import { ONE_MIN_MILLIS, websockets_url } from './Constants';
import { getItem, getPluginId, getPluginName, getVersion, getOs, getPluginUuid, logIt, getRandomNumberWithinRange, isPrimaryWindow, editorOpsExtInstalled } from './Util';
import { handleFlowScoreMessage } from './message_handlers/flow_score';
import { handleIntegrationConnectionSocketEvent } from './message_handlers/integration_connection';
import { handleCurrentDayStatsUpdate } from './message_handlers/current_day_stats_update';
import { handleFlowStateMessage } from './message_handlers/flow_state';
import { userDeletedCompletionHandler } from './DataController';
import { setEndOfDayNotification } from './notifications/endOfDay';
import { handleAuthenticatedPluginUser } from './message_handlers/authenticated_plugin_user';

const WebSocket = require('ws');

// The server should send its timeout to allow the client to adjust.
// Default of 30 minutes
const DEFAULT_PING_INTERVAL_MILLIS = ONE_MIN_MILLIS * 30;
let SERVER_PING_INTERVAL_MILLIS = DEFAULT_PING_INTERVAL_MILLIS + ONE_MIN_MILLIS;
let livenessPingTimeout: NodeJS.Timer | undefined = undefined;
let lastPingResetMillis: number = 0;
let retryTimeout: NodeJS.Timer | undefined = undefined;

// Reconnect constants
const INITIAL_RECONNECT_DELAY: number = 12000;
const MAX_RECONNECT_DELAY: number = 25000;
const LONG_RECONNECT_DELAY: number = ONE_MIN_MILLIS * 5;
// Reconnect vars
let useLongReconnectDelay: boolean = false;
let currentReconnectDelay: number = INITIAL_RECONNECT_DELAY;

let ws: any | undefined = undefined;
let alive: boolean = false;

export function websocketAlive() {
  return alive;
}

export function initializeWebsockets() {
  logIt('initializing websocket connection');
  clearWebsocketRetryTimeout();
  if (ws) {
    // 1000 indicates a normal closure, meaning that the purpose for
    // which the connection was established has been fulfilled
    ws.close(1000, 're-initializing websocket');
  }

  const options = {
    headers: {
      Authorization: getItem('jwt'),
      'X-SWDC-Plugin-Id': getPluginId(),
      'X-SWDC-Plugin-Name': getPluginName(),
      'X-SWDC-Plugin-Version': getVersion(),
      'X-SWDC-Plugin-OS': getOs(),
      'X-SWDC-Plugin-TZ': Intl.DateTimeFormat().resolvedOptions().timeZone,
      'X-SWDC-Plugin-Offset': new Date().getTimezoneOffset(),
      'X-SWDC-Plugin-UUID': getPluginUuid(),
    },
    perMessageDeflate: false
  };

  ws = new WebSocket(websockets_url, options);

  function heartbeat(buf: any) {
    try {
      // convert the buffer to the json payload containing the server timeout
      const data = JSON.parse(buf.toString());
      if (data?.timeout) {
        // add a 1 minute buffer to the millisconds timeout the server provides
        const interval = data.timeout;
        if (interval > DEFAULT_PING_INTERVAL_MILLIS) {
          SERVER_PING_INTERVAL_MILLIS = interval + ONE_MIN_MILLIS;
        } else {
          SERVER_PING_INTERVAL_MILLIS = DEFAULT_PING_INTERVAL_MILLIS + ONE_MIN_MILLIS;
        }
      }
    } catch (e) {
      // defaults to the DEFAULT_PING_INTERVAL_MILLIS
      SERVER_PING_INTERVAL_MILLIS = DEFAULT_PING_INTERVAL_MILLIS + ONE_MIN_MILLIS;
    }

    // Received a ping from the server. Clear the timeout so
    // our client doesn't terminate the connection
    clearLivenessPingTimeout();

    // Use `WebSocket#terminate()`, which immediately destroys the connection,
    // instead of `WebSocket#close()`, which waits for the close timer.
    // Delay should be equal to the interval at which your server
    // sends out pings plus a conservative assumption of the latency.
    livenessPingTimeout = setTimeout(() => {
      if (ws) {
        ws.terminate();
      }
    }, SERVER_PING_INTERVAL_MILLIS);
  }

  ws.on('open', function open() {
    // clear out the retry timeout
    clearWebsocketRetryTimeout();

    // reset long reconnect flag
    useLongReconnectDelay = false;

    // RESET reconnect delay
    currentReconnectDelay = INITIAL_RECONNECT_DELAY;
    alive = true;
    logIt('Websocket connection open');
  });

  ws.on('ping', heartbeat);

  ws.on('message', function incoming(data: any) {
    handleIncomingMessage(data);
  });

  ws.on('close', function close(code: any, reason: any) {
    if (code !== 1000) {
      useLongReconnectDelay = false;
      retryConnection();
    }
  });

  ws.on('unexpected-response', function unexpectedResponse(request: any, response: any) {
    logIt(`unexpected websocket response: ${response.statusCode}`);

    if (response.statusCode === 426) {
      logIt('websocket request had invalid headers. Are you behind a proxy?');
    } else if (response.statusCode >= 500) {
      useLongReconnectDelay = true;
      retryConnection();
    }
  });

  ws.on('error', function error(e: any) {
    logIt(`error connecting to websocket: ${e.message}`);
  });
}

function retryConnection() {
  alive = false;
  if (!retryTimeout) {

    // clear this client side liveness timeout
    clearLivenessPingTimeout();

    let delay: number = getDelay();
    if (useLongReconnectDelay) {
      // long reconnect (5 minutes)
      delay = LONG_RECONNECT_DELAY;
    } else {
      // shorter reconnect: 10 to 50 seconds
      if (currentReconnectDelay < MAX_RECONNECT_DELAY) {
        // multiply until we've reached the max reconnect
        currentReconnectDelay *= 2;
      } else {
        currentReconnectDelay = Math.min(currentReconnectDelay, MAX_RECONNECT_DELAY);
      }
    }

    logIt(`retrying websocket connection in ${delay / 1000} second(s)`);

    retryTimeout = setTimeout(() => {
      initializeWebsockets();
    }, delay);
  }
}

function getDelay() {
  let rand: number = getRandomNumberWithinRange(-5, 5);
  if (currentReconnectDelay < MAX_RECONNECT_DELAY) {
    // if less than the max reconnect delay then increment the delay
    rand = Math.random();
  }
  return currentReconnectDelay + Math.floor(rand * 1000);
}

export function disposeWebsocketTimeouts() {
  clearWebsocketRetryTimeout();
  clearLivenessPingTimeout();
}

function clearLivenessPingTimeout() {
  if (livenessPingTimeout) {
    clearTimeout(livenessPingTimeout);
    livenessPingTimeout = undefined;
  }
  lastPingResetMillis = new Date().getTime();
}

export function checkWebsocketConnection() {
  const nowMillis = new Date().getTime();
  const threshold = SERVER_PING_INTERVAL_MILLIS * 2;
  if (lastPingResetMillis && nowMillis - lastPingResetMillis > threshold) {
    logIt('Resetting websocket connection');
    initializeWebsockets();
  }
}

function clearWebsocketRetryTimeout() {
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = undefined;
  }
}

// handle incoming websocket messages
const handleIncomingMessage = (data: any) => {
  try {
    let message: any = {
      type: 'none'
    }
    try {
      message = JSON.parse(data);
    } catch (e: any) {
      logIt(`Unable to handle incoming message: ${e.message}`);
    }

    switch (message.type) {
      case 'flow_score':
        if (isPrimaryWindow() && !(editorOpsExtInstalled())) {
          try { logIt(`Flow score: ${JSON.stringify(message.body.flowScore)}`) } catch (e) { }
          handleFlowScoreMessage(message);
        }
        break;
      case 'authenticated_plugin_user':
        const user = message.body;
        const currentEmail = getItem('name');
        if (user.email !== currentEmail) {
          handleAuthenticatedPluginUser(user);
        }
        break;
      case 'flow_state':
        try { logIt(`Flow state: ${JSON.stringify(message.body)}`) } catch (e) { }
        handleFlowStateMessage(message.body);
        break;
      case 'user_integration_connection':
        handleIntegrationConnectionSocketEvent(message.body);
        break;
      case 'current_day_stats_update':
        try { logIt(`Current day stats: ${JSON.stringify(message.body.data)}`) } catch (e) { }
        handleCurrentDayStatsUpdate(message.body);
        break;
      case 'account_deleted':
        userDeletedCompletionHandler();
        break;
      case 'preferences_update':
        setEndOfDayNotification();
        break;
    }
  } catch (e) {
    if (data) {
      let dataStr: string = '';
      try {
        dataStr = JSON.stringify(data);
      } catch (e) {
        dataStr = data.toString();
      }
      logIt(`Unable to handle incoming message: ${dataStr}`);
    }
  }
};

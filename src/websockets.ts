import { websockets_url } from "./Constants";
import { getItem } from "./Util";
import { handleFlowScoreMessage } from "./message_handlers/flow_score";

const WebSocket = require('ws');

let retryTimeout = undefined;

export function initializeWebsockets() {
  const options = {
    headers: {
      "Authorization": getItem("jwt")
    }
  }

  const ws = new WebSocket(websockets_url, options);

  ws.on('open', function open() {
    console.debug("[CodeTime] websockets connection open");
  });

  ws.on('message', function incoming(data) {
    console.debug("[CodeTime] received websocket message: ", data);

    handleIncomingMessage(data);
  });

  ws.on('close', function close(code, reason) {
    console.debug("[CodeTime] websockets connection closed");

    retryConnection();
  });

  ws.on('unexpected-response', function unexpectedResponse(request, response) {
    console.debug("[CodeTime] unexpected websockets response:", response.statusCode);

    if (response.statusCode === 426) {
      console.error("[CodeTime] websockets request had invalid headers. Are you behind a proxy?");
    } else {
      retryConnection();
    }
  })

  ws.on('error', function error(e) {
    console.error('[CodeTime] error connecting to websockets', e);
  });
}

function retryConnection() {
  console.debug("[CodeTime] retrying websockets connecting in 10 seconds")

  retryTimeout = setTimeout(() => {
    console.log("[CodeTime] attempting to reinitialize websockets connection");
    initializeWebsockets();
  }, 10000);
}

export function clearWebsocketConnectionRetryTimeout() {
  clearTimeout(retryTimeout);
}

const handleIncomingMessage = (data: any) => {
  try {
    const message = JSON.parse(data);

    switch (message.type) {
      case "info":
        console.info(`[CodeTime] ${message.body}`);
        break;
      case "flow_score":
        handleFlowScoreMessage(message);
        break;
      default:
        console.warn("[CodeTime] received unhandled websocket message type", data);
    }
  } catch (e) {
    console.error("[CodeTime] Unable to handle incoming message", data);
  }
}

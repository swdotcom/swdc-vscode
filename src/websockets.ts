import { websockets_url } from "./Constants";
import { getItem } from "./Util";
import { handleFlowScoreMessage } from "./message_handlers/flow_score";

const WebSocket = require('ws');

let intervalId = undefined;

export function initializeWebsockets() {
  const options = {
    headers: {
      "Authorization": getItem("jwt")
    }
  }

  const ws = new WebSocket(websockets_url, options);

  ws.on('open', function open() {
    clearInterval(intervalId);
    console.debug("[CodeTime] websockets connection open");
  });

  ws.on('message', function incoming(data) {
    console.debug("[CodeTime] received websocket message: ", data);

    handleIncomingMessage(data);
  });

  ws.on('close', function close() {
    console.debug("[CodeTime] websockets connection closed - will retry connecting in 10 seconds");

    clearInterval(intervalId)
    intervalId = setInterval(() => {
      console.log("[CodeTime] attempting to reinitialize websockets connection");
      initializeWebsockets();
    }, 10000);
  });

  ws.on('error', function error(e) {
    console.error('[CodeTime] error connecting to websockets', e);
  });
}

const handleIncomingMessage = (data: any) => {
  try {
    const message = JSON.parse(data);

    switch (message.type) {
      case "info":
        console.info(`[CodeTime] ${message.body}`)
        break;
      case "flow_score":
        handleFlowScoreMessage(message.body);
        break;
      default:
        console.warn("[CodeTime] received unhandled websocket message type", data);
    }
  } catch (e) {
    console.error("[CodeTime] Unable to handle incoming message", data);
  }
}

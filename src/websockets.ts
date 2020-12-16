import { window } from "vscode";
import { getItem } from "./Util";
import { websockets_url } from "./Constants";

const WebSocket = require('ws');

let intervalId = undefined

export function initializeWebsockets() {
	const options = {
		headers: {
			"Authorization": getItem("jwt")
		}
	}

	const ws = new WebSocket(websockets_url, options);

	ws.on('open', function open() {
		clearInterval(intervalId);
		console.log("[CodeTime] websockets connection open");
	});

	ws.on('message', function incoming(data) {
		console.log("[CodeTime] received websocket message: ", data);
		handleIncomingMessage(data);
	});

	ws.on('close', function close() {
		console.log("[CodeTime] websockets connection closed - will retry connecting in 10 seconds")
		clearInterval(intervalId)
		intervalId = setInterval(() => {
			console.log("[CodeTime] attempting to reinitialize websockets connection")
			initializeWebsockets()
		}, 10000)
	});

	ws.on('error', function error(e) {
		console.error('[CodeTime] error connecting to websockets', e);
	});
}

const handleIncomingMessage = (data: any) => {
	const message = JSON.parse(data);

	// Message Types
	// "info" are messages that can be logged
	// "notification" are message that will pop up a window notification to the user
	switch (message.type) {
		case "notification":
			handleNotification(message);
			break;
		default:
			console.log("[CodeTime] received unhandled websocket message type", data);
	}
}


const handleNotification = (message: any) => {
	if (message.body?.inFlowState) {
		return window.showInformationMessage("Your CodeTime data shows you are entering your \"Flow State\". Now would be a good time to snooze notifications.")
	}

	console.log("Unhandled websocket message", message)
}
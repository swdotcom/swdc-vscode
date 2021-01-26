import { enableFlow } from "../managers/FlowManager";
import { window } from "vscode";

export async function handleFlowScoreMessage(message: any) {
	console.debug("[CodeTime] Received flow score message", message);

	const selection = await window.showInformationMessage(
		"Would you like to minimize distractions and enable flow mode?",
		...["Yes"]
	);

	if (selection === "Yes") {
		enableFlow()
	}
}
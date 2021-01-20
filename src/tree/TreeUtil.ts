import { commands, TreeView, window } from "vscode";
import { KpmItem } from "../model/models";
import { buildEmptyButton } from "./TreeButtonProvider";

let treeOpen = false;

export function isKpmTreeOpen() {
  return treeOpen;
}

export function setKpmTreeOpen(isOpen: boolean) {
  treeOpen = isOpen;
}

export function handleChangeSelection(view: TreeView<KpmItem>, item: KpmItem) {
  if (item?.command) {
    const args = item.commandArgs || [];
    if (args.length) {
      commands.executeCommand(item.command, ...args);
    } else {
      // run the command
      commands.executeCommand(item.command, item);
    }
  }

  if (item) {
    // logic to deselect the current tree item
    revealEmptyButton(view, true, item.location);
    revealEmptyButton(view, false, item.location);
  }
}

function revealEmptyButton(view: TreeView<KpmItem>, select: boolean, location: string) {
  if (location) {
    try {
      let buttonId = "";
      if (location === "ct-flow-tree") {
        buttonId = "empty-flow-button";
      }
      if (buttonId) {
        // set the select to false to deselect
        view.reveal(buildEmptyButton(buttonId), {
          select,
        });
      }
    } catch (err) {}
  }
}

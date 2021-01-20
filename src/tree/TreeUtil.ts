import { commands, TreeView } from "vscode";
import { KpmItem } from "../model/models";

let treeOpen = false;

export function isKpmTreeOpen() {
  return treeOpen;
}

export function setKpmTreeOpen(isOpen: boolean) {
  treeOpen = isOpen;
}

export function handleChangeSelection(view: TreeView<KpmItem>, item: KpmItem) {
  if (item.command) {
    const args = item.commandArgs || [];
    if (args.length) {
      commands.executeCommand(item.command, ...args);
    } else {
      // run the command
      commands.executeCommand(item.command, item);
    }
  }

  // deselect it
  try {
    // re-select the track without focus
    view.reveal(item, {
      focus: false,
      select: false,
    });
  } catch (err) {}
}

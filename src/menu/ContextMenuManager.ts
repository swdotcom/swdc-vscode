import { commands } from "vscode";
import { getItem, setItem } from "../Util";
import { showQuickPick } from "./MenuManager";

export async function showAverageComparisonOptions() {
  let menuOptions = {
    items: [],
    placeholder: `Select how to compare your stats progress`,
  };

  menuOptions.items.push({
    label: "Your daily average",
    value: "user",
  });
  menuOptions.items.push({
    label: "Global daily average",
    value: "global",
  });

  const pick = await showQuickPick(menuOptions);
  if (pick && pick.value) {
    setItem("reference-class", pick.value);
    // refresh the stats tree
    commands.executeCommand("codetime.refreshCodeTimeView");
  }
  return null;
}

export async function switchAverageComparison() {
  let currentReferenceClass = getItem("reference-class");
  if (!currentReferenceClass || currentReferenceClass === "user") {
    currentReferenceClass = "global";
  } else {
    currentReferenceClass = "user";
  }
  setItem("reference-class", currentReferenceClass);
  // refresh the stats tree
  commands.executeCommand("codetime.refreshCodeTimeView");
}

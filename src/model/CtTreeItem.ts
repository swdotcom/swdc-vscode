import { TreeItem, TreeItemCollapsibleState, TreeItemLabel } from "vscode";
import * as path from "path";

const resourcePath: string = path.join(__dirname, "resources");

export class CtTreeItem extends TreeItem {
  public value: any = undefined;
  public iconName: string = "";
  public children: CtTreeItem[] = null;
  public id: string = "";

  constructor(label: string | TreeItemLabel, tooltip: string = "", description: string = "", iconName: string = "") {
    super(label, TreeItemCollapsibleState.None);
    this.tooltip = tooltip ?? label.toString();
    this.description = description;
    this.iconName = iconName;

    const { lightPath, darkPath } = getTreeItemIcon(this.iconName);

    if (lightPath && darkPath) {
      this.iconPath.light = lightPath;
      this.iconPath.dark = darkPath;
    } else {
      // no matching tag, remove the tree item icon path
      delete this.iconPath;
    }
  }

  iconPath = {
    light: "",
    dark: "",
  };
}

function getTreeItemIcon(iconName: string): any {
  const lightPath = iconName ? path.join(resourcePath, "light", iconName) : null;
  const darkPath = iconName ? path.join(resourcePath, "dark", iconName) : null;
  return { lightPath, darkPath };
}

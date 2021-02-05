import * as React from "react";
import * as ReactDOM from "react-dom";
import "./index.css";
import Config from "./Config";

declare global {
  interface Window {
    acquireVsCodeApi(): any;
  }
}

const vscode = window.acquireVsCodeApi();

ReactDOM.render(
    <Config vscode={vscode} />,
    document.getElementById("root")
);
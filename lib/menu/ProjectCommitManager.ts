import { window, QuickPickItem, Position, TextEditor, TextLine } from "vscode";
import { softwareGet, isResponseOk } from "../http/HttpClient";
import { getItem } from "../Util";
import Checkbox from "../models/checkbox";
import { displayProjectCommitsDashboard } from "./MenuManager";

const numeral = require("numeral");

export class ProjectCommitManager {
    private static instance: ProjectCommitManager;

    private constructor() {
        //
    }

    static getInstance(): ProjectCommitManager {
        if (!ProjectCommitManager.instance) {
            ProjectCommitManager.instance = new ProjectCommitManager();
        }

        return ProjectCommitManager.instance;
    }

    async launchProjectCommitMenuFlow() {
        const checkboxes: Checkbox[] = await this.getAllCheckboxes();
        const pickItems: QuickPickItem[] = checkboxes.map(checkbox => {
            return {
                value: checkbox.value,
                picked: checkbox.checked,
                label: checkbox.label
            } as QuickPickItem;
        });
        const picks = await window.showQuickPick(pickItems, {
            placeHolder: "Select one or more projects",
            ignoreFocusOut: false,
            matchOnDescription: true,
            canPickMany: true
        });

        // will return an array of ... (value is the projectId)
        // [{description, label, picked, value}]
        if (picks && picks.length) {
            // go through the array and get the project IDs
            const projectIds = picks.map((n: QuickPickItem) => n["value"]);
            // show it
            displayProjectCommitsDashboard("lastWeek", projectIds);
        }
        return null;
    }

    async getAllCheckboxes(): Promise<Checkbox[]> {
        // fetch the projects from the backend
        const resp = await softwareGet(
            "/projects/codeTimeProjects",
            getItem("jwt")
        );
        let checkboxes: Checkbox[] = [];
        if (isResponseOk(resp)) {
            const projects = resp.data;
            let total_records = 0;
            projects.forEach(p => {
                total_records += p.coding_records;
            });

            for (let i = 0; i < projects.length; i++) {
                const p = projects[i];
                const percentage = (p.coding_records / total_records) * 100;
                // coding_records:419, project_name:"swdc-sublime-music-time", projectId:603593
                const cb: Checkbox = new Checkbox();
                cb.text = `(${percentage.toFixed(2)}%)`;
                cb.label = p.project_name;
                cb.checked = true;
                cb.lineNumber = i;
                cb.value = p.projectId;
                checkboxes.push(cb);
            }
        }

        return checkboxes;
    }

    async showInputBox(value: string, placeHolder: string) {
        return await window.showInputBox({
            value,
            placeHolder,
            validateInput: text => {
                return !text
                    ? "Please enter a valid message to continue."
                    : null;
            }
        });
    }
}

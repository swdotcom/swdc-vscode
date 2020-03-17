import { window } from "vscode";
import { showQuickPick } from "./MenuManager";
import { softwareGet, isResponseOk } from "../http/HttpClient";
import { getItem } from "../Util";

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
        // fetch the projects from the backend
        const resp = await softwareGet(
            "/projects/codeTimeProjects",
            getItem("jwt")
        );
        let projects = [];
        if (isResponseOk(resp)) {
            projects = resp.data;
        }

        let items = [];
        if (projects && projects.length) {
            items = projects.map(p => {
                return {
                    label: p.project_name,
                    id: p.projectId
                };
            });
        } else {
            items.push({
                label: "No projects found",
                id: null
            });
        }

        let menuOptions = {
            items,
            placeholder: "Select a project"
        };

        const pick = await showQuickPick(menuOptions);
        if (pick && pick.label) {
            return pick.label;
        }
        return null;
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

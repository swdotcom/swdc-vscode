import { window, QuickPickItem } from "vscode";
import { softwareGet, isResponseOk } from "../http/HttpClient";
import { getItem } from "../Util";
import Checkbox from "../models/checkbox";
import {
    displayProjectCommitsDashboard,
    generateDailyReport
} from "./ReportManager";

export class ProjectCommitManager {
    private static instance: ProjectCommitManager;

    private items: any[] = [
        {
            label: "Yesterday",
            value: "yesterday"
        },
        {
            label: "This week",
            value: "currentWeek"
        },
        {
            label: "Last week",
            value: "lastWeek"
        },
        {
            label: "Last month",
            value: "lastMonth"
        }
    ];

    private constructor() {
        //
    }

    static getInstance(): ProjectCommitManager {
        if (!ProjectCommitManager.instance) {
            ProjectCommitManager.instance = new ProjectCommitManager();
        }

        return ProjectCommitManager.instance;
    }

    async launchDailyReportMenuFlow() {
        const pickItems: QuickPickItem[] = this.items.map(item => {
            return {
                label: item.label,
                value: item.value
            } as QuickPickItem;
        });

        const pick = await window.showQuickPick(pickItems, {
            placeHolder: "Select a date range"
        });

        if (pick && pick.label) {
            return this.launchProjectSelectionMenu(pick["value"], true);
        }
        return null;
    }

    async launchProjectCommitMenuFlow() {
        const pickItems: QuickPickItem[] = this.items.map(item => {
            return {
                label: item.label,
                value: item.value
            } as QuickPickItem;
        });

        const pick = await window.showQuickPick(pickItems, {
            placeHolder: "Select a date range"
        });
        if (pick && pick.label) {
            return this.launchProjectSelectionMenu(pick["value"], false);
        }
        return null;
    }

    async launchProjectSelectionMenu(dateRange, isDailyReport = false) {
        const checkboxes: Checkbox[] = await this.getAllCheckboxes(dateRange);
        const pickItems: QuickPickItem[] = checkboxes.map(checkbox => {
            return {
                value: checkbox.value,
                picked: checkbox.checked,
                label: checkbox.label,
                description: checkbox.text
            } as QuickPickItem;
        });
        const picks = await window.showQuickPick(pickItems, {
            placeHolder: "Select one or more projects",
            ignoreFocusOut: false,
            matchOnDescription: true,
            canPickMany: true
        });

        // will return an array of ... (value is the projectIds)
        // [{description, label, picked, value}]
        if (picks && picks.length) {
            // go through the array and get the project IDs
            const projectIds = [];
            picks.forEach(item => {
                projectIds.push(...item["value"]);
            });
            if (!isDailyReport) {
                // show it
                displayProjectCommitsDashboard(dateRange, projectIds);
            } else {
                generateDailyReport(dateRange, projectIds);
            }
        }
        return null;
    }

    async getAllCheckboxes(type = "lastWeek"): Promise<Checkbox[]> {
        // fetch the projects from the backend
        const qryStr = `?timeRange=${type}&coding=true`;
        const api = `/projects${qryStr}`;
        const resp = await softwareGet(api, getItem("jwt"));
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
                cb.value = p.projectIds;
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

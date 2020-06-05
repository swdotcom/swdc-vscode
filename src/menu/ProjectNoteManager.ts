import { window } from "vscode";

export class ProjectNoteManager {
    private static instance: ProjectNoteManager;

    private constructor() {
        //
    }

    static getInstance(): ProjectNoteManager {
        if (!ProjectNoteManager.instance) {
            ProjectNoteManager.instance = new ProjectNoteManager();
        }

        return ProjectNoteManager.instance;
    }

    addNote() {
        window.showInputBox({
            value: "",
            placeHolder: "Enter a note",
            validateInput: text => {
                return !text
                    ? "Please enter a non-empty note to continue."
                    : null;
            }
        });
    }
}

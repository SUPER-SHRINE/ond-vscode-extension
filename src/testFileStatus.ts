import * as vscode from "vscode";

export function createTestFileStatus(context: vscode.ExtensionContext): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    item.name = "Ond Test File";
    item.text = "🧪 Ond Test";
    item.tooltip = "Active Ond test file";
    item.accessibilityInformation = { label: "Active Ond test file" };
    item.color = new vscode.ThemeColor("charts.green");

    const update = (editor: vscode.TextEditor | undefined): void => {
        const name = editor?.document.fileName.split(/[\\/]/).pop() ?? "";
        const isTest = name === "test.ond" || name.endsWith("_test.ond");
        if (editor?.document.languageId === "ond" && isTest) item.show();
        else item.hide();
    };

    context.subscriptions.push(
        item,
        vscode.window.onDidChangeActiveTextEditor(update),
        vscode.workspace.onDidOpenTextDocument(() => update(vscode.window.activeTextEditor))
    );
    update(vscode.window.activeTextEditor);
    return item;
}

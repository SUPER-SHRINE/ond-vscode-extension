import * as vscode from "vscode";
import { OndLanguageClient, createOndLanguageClient } from "./client";
import { createTestFileStatus } from "./testFileStatus";

let client: OndLanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    createTestFileStatus(context);
    client = createOndLanguageClient(context);
    await client.start();
}

export async function deactivate(): Promise<void> {
    await client?.stop();
    client = undefined;
}

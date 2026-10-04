import * as path from "node:path";
import * as fs from "node:fs";
import * as vscode from "vscode";
import {
    Executable,
    LanguageClient,
    LanguageClientOptions,
    RevealOutputChannelOn,
    ServerOptions,
    TransportKind
} from "vscode-languageclient/node";

export interface OndLanguageClient {
    start(): Promise<void>;
    stop(): Promise<void>;
}

class VscodeOndLanguageClient implements OndLanguageClient {
    private stopped = false;

    constructor(
        private readonly client: LanguageClient,
        private readonly outputChannel: vscode.OutputChannel
    ) {}

    async start(): Promise<void> {
        this.outputChannel.appendLine("Starting ond Language Server client...");
        try {
            await this.client.start();
            this.outputChannel.appendLine("ond Language Server client started.");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`Failed to start ond Language Server: ${message}`);
            this.outputChannel.show(true);
            void vscode.window.showErrorMessage(
                "ond Language Serverの起動に失敗しました。出力パネルを確認してください。"
            );
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (this.stopped) {
            return;
        }
        this.stopped = true;

        this.outputChannel.appendLine("Stopping ond Language Server client...");
        try {
            await this.client.stop();
        } finally {
            this.outputChannel.dispose();
        }
    }
}

export function createOndLanguageClient(context: vscode.ExtensionContext): OndLanguageClient {
    const outputChannel = vscode.window.createOutputChannel("ond Language Server");
    const serverOptions = createServerOptions(context, outputChannel);
    const fileEvents = [
        vscode.workspace.createFileSystemWatcher("**/*.ond"),
        vscode.workspace.createFileSystemWatcher("**/ond.toml"),
        vscode.workspace.createFileSystemWatcher("**/ond.lock")
    ];
    context.subscriptions.push(...fileEvents);
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: "file", language: "ond" }],
        outputChannel,
        traceOutputChannel: outputChannel,
        revealOutputChannelOn: RevealOutputChannelOn.Never,
        synchronize: { fileEvents }
    };

    const client = new LanguageClient("ond", "ond Language Server", serverOptions, clientOptions);
    return new VscodeOndLanguageClient(client, outputChannel);
}

function createServerOptions(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
): ServerOptions {
    const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
    if (process.arch !== "x64" || !["win32", "linux"].includes(process.platform) ||
        (process.platform === "linux" && !report?.header?.glibcVersionRuntime)) {
        throw new Error("Ond supports Windows x64 and Linux x64 (glibc) only.");
    }
    const binaryName = process.platform === "win32" ? "ond-lsp.exe" : "ond-lsp";
    const binaryPath = context.asAbsolutePath(path.join("server", binaryName));
    outputChannel.appendLine(`Using bundled ond-lsp binary: ${binaryPath}`);

    if (!fs.existsSync(binaryPath)) {
        const message = `Bundled ond Language Server was not found: ${binaryPath}`;
        outputChannel.appendLine(message);
        outputChannel.show(true);
        void vscode.window.showErrorMessage(
            "ond Language Serverを起動できません。拡張機能を再インストールしてください。"
        );
        throw new Error(message);
    }

    const executable: Executable = {
        command: binaryPath,
        args: ["stdio"],
        options: {
            cwd: context.extensionPath
        },
        transport: TransportKind.stdio
    };
    return executable;
}

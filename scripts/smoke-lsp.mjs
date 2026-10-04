import { getPlatform } from "./platform.mjs";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const platform = getPlatform();
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(scriptDirectory, "..");
const binaryPath = resolve(extensionRoot, "server", platform.binary);
const metadata = JSON.parse(
    readFileSync(resolve(extensionRoot, "server", "ond-lsp.json"), "utf8")
);

await new Promise((resolveSmoke, rejectSmoke) => {
    const child = spawn(binaryPath, ["stdio"], {
        cwd: extensionRoot,
        stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = Buffer.alloc(0);
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
        finish(new Error(`ond-lsp initialize timed out. ${stderr}`));
    }, 10_000);

    child.on("error", finish);
    child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
    });
    child.stdout.on("data", (chunk) => {
        stdout = Buffer.concat([stdout, chunk]);
        readMessages();
    });
    child.on("exit", (code) => {
        if (!settled) {
            finish(new Error(`ond-lsp exited before initialize completed: ${code}. ${stderr}`));
        }
    });

    send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
            processId: null,
            rootUri: null,
            capabilities: {}
        }
    });

    function send(message) {
        const body = Buffer.from(JSON.stringify(message), "utf8");
        child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
        child.stdin.write(body);
    }

    function readMessages() {
        while (true) {
            const headerEnd = stdout.indexOf("\r\n\r\n");
            if (headerEnd < 0) {
                return;
            }
            const header = stdout.subarray(0, headerEnd).toString("ascii");
            const match = header.match(/(?:^|\r\n)Content-Length:\s*(\d+)/i);
            if (!match) {
                finish(new Error(`Invalid LSP response header: ${header}`));
                return;
            }
            const length = Number(match[1]);
            const bodyStart = headerEnd + 4;
            if (stdout.length < bodyStart + length) {
                return;
            }
            const body = stdout.subarray(bodyStart, bodyStart + length).toString("utf8");
            stdout = stdout.subarray(bodyStart + length);
            const message = JSON.parse(body);
            if (message.id !== 1) {
                continue;
            }
            if (message.error) {
                finish(new Error(`ond-lsp initialize failed: ${JSON.stringify(message.error)}`));
                return;
            }
            const actualVersion = message.result?.serverInfo?.version;
            if (actualVersion !== metadata.version) {
                finish(
                    new Error(
                        `ond-lsp version mismatch: metadata ${metadata.version}, initialize ${actualVersion}`
                    )
                );
                return;
            }
            console.log(`ond-lsp initialize succeeded: ${actualVersion}`);
            finish();
            return;
        }
    }

    function finish(error) {
        if (settled) {
            return;
        }
        settled = true;
        clearTimeout(timeout);
        child.kill();
        if (error) {
            rejectSmoke(error);
        } else {
            resolveSmoke();
        }
    }
});

import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { outputFiles } = await build({
    entryPoints: [fileURLToPath(new URL("../src/client.ts", import.meta.url))],
    bundle: true, platform: "node", format: "cjs", write: false,
    external: ["vscode", "vscode-languageclient/node"]
});

function clientFor(platform, arch = "x64", exists = true, glibc = "2.35") {
    let options;
    const output = { appendLine() {}, show() {}, dispose() {} };
    const mocked = {
        vscode: {
            window: { createOutputChannel: () => output, showErrorMessage() {} },
            workspace: { createFileSystemWatcher: () => ({ dispose() {} }) }
        },
        "node:fs": { existsSync: () => exists },
        "vscode-languageclient/node": {
            LanguageClient: class {
                constructor(_id, _name, server) { options = server; }
                async start() {}
                async stop() {}
            },
            TransportKind: { stdio: "stdio" }, RevealOutputChannelOn: { Never: "never" }
        }
    };
    const context = {
        exports: {}, module: { exports: {} },
        require: (name) => mocked[name] ?? require(name),
        process: { platform, arch, report: { getReport: () => ({ header: { glibcVersionRuntime: glibc } }) } }
    };
    vm.runInNewContext(outputFiles[0].text, context);
    context.module.exports.createOndLanguageClient({
        asAbsolutePath: (name) => path.resolve("/extension", name),
        extensionPath: "/extension", subscriptions: []
    });
    return options;
}

test("extension starts the bundled native Linux LSP over stdio", () => {
    const server = clientFor("linux");
    assert.equal(server.command, path.resolve("/extension/server/ond-lsp"));
    assert.equal(server.args.join(" "), "stdio");
    assert.equal(server.transport, "stdio");
});
test("Windows extension keeps the .exe launch path", () => {
    assert.equal(clientFor("win32").command, path.resolve("/extension/server/ond-lsp.exe"));
});
test("missing binary and unsupported platforms fail without launching", () => {
    assert.throws(() => clientFor("linux", "x64", false), /was not found/);
    assert.throws(() => clientFor("linux", "arm64"), /supports Windows x64/);
    assert.throws(() => clientFor("linux", "x64", true, null), /supports Windows x64/);
    assert.throws(() => clientFor("darwin"), /supports Windows x64/);
});

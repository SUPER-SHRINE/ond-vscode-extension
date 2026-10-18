import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { outputFiles } = await build({
    entryPoints: [fileURLToPath(new URL("../src/testFileStatus.ts", import.meta.url))],
    bundle: true, platform: "node", format: "cjs", write: false, external: ["vscode"]
});

function harness(initialEditor) {
    const subscriptions = [];
    const events = {};
    const item = {
        showCount: 0, hideCount: 0, disposeCount: 0,
        show() { this.showCount++; }, hide() { this.hideCount++; }, dispose() { this.disposeCount++; }
    };
    const vscode = {
        StatusBarAlignment: { Left: 1 },
        ThemeColor: class { constructor(id) { this.id = id; } },
        window: {
            activeTextEditor: initialEditor,
            createStatusBarItem: () => item,
            onDidChangeActiveTextEditor(fn) { events.editor = fn; return { dispose() {} }; }
        },
        workspace: {
            onDidOpenTextDocument(fn) { events.document = fn; return { dispose() {} }; }
        }
    };
    const context = { exports: {}, module: { exports: {} }, require: (name) => name === "vscode" ? vscode : require(name) };
    vm.runInNewContext(outputFiles[0].text, context);
    context.module.exports.createTestFileStatus({ subscriptions });
    return { item, events, subscriptions, vscode };
}

const editor = (fileName, languageId = "ond") => ({ document: { fileName, languageId } });

test("shows initially for test.ond and *_test.ond with theme foreground", () => {
    for (const name of ["test.ond", "unit_test.ond"]) {
        const { item, subscriptions } = harness(editor(`/workspace/${name}`));
        assert.equal(item.showCount, 1);
        assert.equal(item.text, "🧪 Ond Test");
        assert.equal(item.color.id, "charts.green");
        assert.equal(subscriptions.length, 3);
    }
});

test("hides for ordinary, non-Ond, and absent editors", () => {
    for (const active of [editor("/workspace/main.ond"), editor("/workspace/unit_test.ond", "typescript"), undefined]) {
        const { item } = harness(active);
        assert.equal(item.showCount, 0);
        assert.equal(item.hideCount, 1);
    }
});

test("tracks editor and document changes and disposes the status item", () => {
    const state = harness(editor("/workspace/test.ond"));
    state.events.editor(editor("/workspace/main.ond"));
    assert.equal(state.item.hideCount, 1);
    state.events.editor(editor("/workspace/new_test.ond"));
    assert.equal(state.item.showCount, 2);
    state.vscode.window.activeTextEditor = editor("/workspace/new_test.ond", "plaintext");
    state.events.document();
    assert.equal(state.item.hideCount, 2);
    state.subscriptions[0].dispose();
    assert.equal(state.item.disposeCount, 1);
});

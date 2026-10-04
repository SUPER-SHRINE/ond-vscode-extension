import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { downloadVSCode } from "./download-vscode.mjs";
import { parseLock,canonical,sha256 } from "../ond-sync/contract.mjs";
import { verifyServer } from "../ond-sync/server.mjs";
import { OND_NOTICE_FILES,requiresNotices } from "../ond-sync/archive.mjs";
import { testPolicy } from "../ond-sync/test-policy.mjs";
import { getPlatform } from "../platform.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const {policy:config,digest:policySha256}=testPolicy();
const lock=parseLock(readFileSync(join(root,"config/ond-release.lock.json")));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const platform = getPlatform();
const metadata = JSON.parse(readFileSync(join(root, "server/ond-lsp.json"), "utf8"));
const binary = readFileSync(join(root, "server", platform.binary));
if(process.env.OND_TEST_SOURCE_LANE==='local') {
    if(metadata.source.kind!=='local-build'||metadata.source.commit!==process.env.OND_SOURCE_SHA||metadata.version!==process.env.OND_SOURCE_VERSION)throw new Error('Local lane exact source mismatch.');
} else {
    const notices=requiresNotices(lock.version)?Object.fromEntries(OND_NOTICE_FILES.map(name=>[name,readFileSync(join(root,'server',name))])):undefined;
    verifyServer(lock,platform.target,metadata,binary,notices);
}
if(sha256(binary)!==metadata.sha256)throw new Error('LSP checksum mismatch.');
const commitResult=spawnSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'});if(commitResult.status!==0)throw new Error('Missing extension commit');
const extensionCommit=commitResult.stdout.trim();
const vsix = join(root, `ond-vscode-extension-${manifest.version}-${platform.target}.vsix`);
const expected = readFileSync(`${vsix}.sha256`, "utf8").trim().split(/\s+/)[0];
if (createHash("sha256").update(readFileSync(vsix)).digest("hex") !== expected) throw new Error("VSIX checksum mismatch.");

mkdirSync(join(root, ".integration/results"), { recursive: true });
const resultRoot = mkdtempSync(join(root, ".integration/results/host-"));
const project = join(resultRoot, "project");
const extensions = join(resultRoot, "extensions");
const userData = join(resultRoot, "user-data");
mkdirSync(project); mkdirSync(extensions); mkdirSync(join(userData, "User"), { recursive: true });
writeFileSync(join(userData, "User/settings.json"), JSON.stringify({
    "telemetry.telemetryLevel": "off", "update.mode": "none",
    "extensions.autoUpdate": false, "extensions.autoCheckUpdates": false,
    "workbench.startupEditor": "none"
}));
writeFileSync(join(project, "ond.toml"), "");
writeFileSync(join(project, "main.ond"), readFileSync(join(here, "hello.ond")));
writeFileSync(join(resultRoot, "input.json"), JSON.stringify({ ...config, extensionVersion: manifest.version,
    vsixSha256: expected, lspSha256: metadata.sha256, platform: platform.target }, null, 2));

// runTests() adds --no-sandbox / --disable-workspace-trust. Deliberately use
// only the official downloader, then launch the actual editor without those flags.
const {executable,archiveSha256:vscodeArchiveSha256}=await downloadVSCode(config.vscodeVersion,platform.target,join(resultRoot,"vscode"));
async function execute(args, label, env = {}, timeout = 120_000) {
    const log = createWriteStream(join(resultRoot, `${label}.log`));
    return await new Promise((resolveRun, reject) => {
        const childEnv = { ...process.env, ...env };
        if (label.startsWith("editor-")) delete childEnv.ELECTRON_RUN_AS_NODE;
        const child = spawn(executable, args, { cwd: root, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
        child.stdout.on("data", chunk => { log.write(chunk); process.stdout.write(chunk); });
        child.stderr.on("data", chunk => { log.write(chunk); process.stderr.write(chunk); });
        const timer = setTimeout(() => { child.kill(); reject(new Error(`${label} timed out; see ${resultRoot}`)); }, timeout);
        child.on("error", error => { clearTimeout(timer); log.end(); reject(error); });
        child.on("close", code => {
            clearTimeout(timer); log.end();
            if (code === 0) resolveRun(); else reject(new Error(`${label} exited ${code}; see ${resultRoot}`));
        });
    });
}
const profileArgs = [`--user-data-dir=${userData}`, `--extensions-dir=${extensions}`];
// Same node-mode CLI entrypoint as the official bin/code and bin/code.cmd.
await execute([join(dirname(executable), "resources/app/out/cli.js"), ...profileArgs,
    "--install-extension", vsix], "install", { ELECTRON_RUN_AS_NODE: "1" });
// 通常起動の信頼ダイアログで、この実行が作成したfixtureだけを信頼する。
// テスト起動ではVS Code自身がdialogを抑止するため、先に通常UIを操作する。
const portServer = createServer();
await new Promise(resolvePort => portServer.listen(0, "127.0.0.1", resolvePort));
const debugPort = portServer.address().port;
await new Promise(resolvePort => portServer.close(resolvePort));
const preparation = execute([...profileArgs, `--remote-debugging-port=${debugPort}`,
    "--remote-debugging-address=127.0.0.1", "--skip-welcome", "--skip-release-notes",
    "--new-window", project], "editor-trust");
// Keep rejection handled while waiting for the debugger endpoint.
preparation.catch(() => {});
let socket;
try {
    let page;
    for (let attempt = 0; attempt < 120; attempt++) {
        const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json()).catch(() => []);
        page = pages.find(item => item.type === "page" && item.url.includes("workbench"));
        if (page) break;
        await new Promise(r => setTimeout(r, 250));
    }
    if (!page) throw new Error("Trust preparation: editor debugger did not start.");
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { socket.addEventListener("open", res, { once: true }); socket.addEventListener("error", rej, { once: true }); });
    let sequence = 0;
    const call = (method, params = {}) => new Promise((res, rej) => {
        const id = ++sequence;
        const timer = setTimeout(() => { socket.removeEventListener("message", listener); rej(new Error(`Debugger timeout: ${method}`)); }, 10000);
        const listener = event => {
            const message = JSON.parse(event.data);
            if (message.id !== id) return;
            clearTimeout(timer); socket.removeEventListener("message", listener);
            if (message.error) rej(new Error(JSON.stringify(message.error))); else res(message.result);
        };
        socket.addEventListener("message", listener); socket.send(JSON.stringify({ id, method, params }));
    });
    let accepted = false;
    for (let attempt = 0; attempt < 120; attempt++) {
        const result = await call("Runtime.evaluate", { expression: `(() => {
            const button = [...document.querySelectorAll('a.monaco-button, button')]
                .find(b => b.textContent.includes('Yes, I trust the authors'));
            if (!button) return false;
            button.click(); return true;
        })()`, returnByValue: true });
        if (result.result.value) { accepted = true; break; }
        await new Promise(r => setTimeout(r, 250));
    }
    if (!accepted) throw new Error("Trust preparation: expected normal trust confirmation was not found.");
    writeFileSync(join(resultRoot, "trust.json"), JSON.stringify({ project, method: "normal-editor-trust-dialog", accepted }, null, 2));
    // Allow scoped trust persistence before normal editor shutdown.
    await new Promise(r => setTimeout(r, 1500));
    await call("Runtime.evaluate", { expression: "setTimeout(() => window.close(), 100)" });
} finally { socket?.close(); }
await preparation;
for (const run of [1, 2]) {
    await execute([...profileArgs, `--extensionDevelopmentPath=${join(here, "driver")}`,
        "--skip-welcome", "--skip-release-notes",
        "--new-window", project], `editor-${run}`, {
        OND_TEST_ROOT: resultRoot, OND_HOST_RUN: String(run),
        OND_EXPECTED_LSP_SHA256: metadata.sha256, OND_EXPECTED_EXTENSION_VERSION: manifest.version
    });
    const result = JSON.parse(readFileSync(join(resultRoot, `host-results-${run}.json`), "utf8"));
    if (!result.success || result.vscode !== config.vscodeVersion) throw new Error("Extension host did not report successful tests.");
}
if(sha256(readFileSync(vsix))!==expected)throw new Error('Tested VSIX changed during host tests');
if(process.env.OND_TEST_SOURCE_LANE!=='local')writeFileSync(`${vsix}.verified.json`,canonical({schemaVersion:1,extensionCommit,headCommit:process.env.OND_EXPECTED_HEAD_SHA||extensionCommit,baseCommit:process.env.OND_EXPECTED_BASE_SHA||extensionCommit,extensionVersion:manifest.version,target:platform.target,vsixSha256:expected,lockSha256:sha256(canonical(lock)),binarySha256:metadata.sha256,policySha256,vscodeVersion:config.vscodeVersion,vscodeArchiveSha256,hostRuns:[1,2].map(run=>JSON.parse(readFileSync(join(resultRoot,`host-results-${run}.json`),'utf8')))}));
console.log(`Two real VS Code extension-host runs passed. Evidence: ${resultRoot}`);

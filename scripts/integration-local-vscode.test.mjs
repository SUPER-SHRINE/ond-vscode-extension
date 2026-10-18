import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectLocalVSCode } from './integration/local-vscode.mjs';
import { ROOT } from './ond-sync/bundle.mjs';

test('local source lane resolves the explicit executable and CLI from installed files', () => {
  const root = mkdtempSync(join(tmpdir(), 'ond-local-vscode-'));
  try {
    const executable = join(root, 'Code.exe');
    const cli = join(root, '6d62b1d5da', 'resources', 'app', 'out', 'cli.js');
    mkdirSync(join(root, '6d62b1d5da', 'resources', 'app', 'out'), { recursive: true });
    writeFileSync(executable, 'installed editor executable');
    writeFileSync(cli, 'installed editor CLI');
    writeFileSync(join(root, '6d62b1d5da', 'resources', 'app', 'package.json'), JSON.stringify({ version: '1.142.0' }));
    const local = inspectLocalVSCode(executable, cli);
    assert.equal(local.executable, executable);
    assert.equal(local.cli, cli);
    assert.equal(local.version, '1.142.0');
    assert.equal(local.executableSha256, createHash('sha256').update('installed editor executable').digest('hex'));
    assert.equal(local.cliSha256, createHash('sha256').update('installed editor CLI').digest('hex'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('integration runner rejects local editor overrides outside a complete local source lane', () => {
  const releaseEnv = { ...process.env, OND_LOCAL_VSCODE_EXECUTABLE: 'C:\\VSCode\\Code.exe', OND_LOCAL_VSCODE_CLI: 'C:\\VSCode\\resources\\app\\out\\cli.js' };
  delete releaseEnv.OND_TEST_SOURCE_LANE;
  const release = spawnSync(process.execPath, [join(ROOT, 'scripts/integration/run.mjs')], { env: releaseEnv, encoding: 'utf8' });
  assert.notEqual(release.status, 0);
  assert.match(release.stderr, /only allowed in the local source lane/);
  const incompleteEnv = { ...process.env, OND_TEST_SOURCE_LANE: 'local', OND_LOCAL_VSCODE_EXECUTABLE: 'C:\\VSCode\\Code.exe' };
  delete incompleteEnv.OND_LOCAL_VSCODE_CLI;
  const incomplete = spawnSync(process.execPath, [join(ROOT, 'scripts/integration/run.mjs')], { env: incompleteEnv, encoding: 'utf8' });
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /Set both OND_LOCAL_VSCODE_EXECUTABLE and OND_LOCAL_VSCODE_CLI/);
});

test('local VS Code CLI must remain inside the selected installation', () => {
  const root = mkdtempSync(join(tmpdir(), 'ond-local-vscode-path-'));
  try {
    const installation = join(root, 'installation');
    const executable = join(installation, 'Code.exe');
    const cli = join(root, 'outside', 'resources', 'app', 'out', 'cli.js');
    mkdirSync(installation);
    mkdirSync(join(root, 'outside', 'resources', 'app', 'out'), { recursive: true });
    writeFileSync(executable, 'exe');
    writeFileSync(cli, 'cli');
    writeFileSync(join(root, 'outside', 'resources', 'app', 'package.json'), JSON.stringify({ version: '1.142.0' }));
    assert.throws(() => inspectLocalVSCode(executable, cli), /inside the selected installation directory/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

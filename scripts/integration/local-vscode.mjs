import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export function inspectLocalVSCode(executablePath, cliPath) {
  assert(isAbsolute(executablePath), 'OND_LOCAL_VSCODE_EXECUTABLE must be an absolute path');
  assert(isAbsolute(cliPath), 'OND_LOCAL_VSCODE_CLI must be an absolute path');
  const executable = resolve(executablePath);
  const cli = resolve(cliPath);
  assert(lstatSync(executable).isFile(), 'Local VS Code executable must be a regular file');
  assert(lstatSync(cli).isFile(), 'Local VS Code CLI must be a regular file');
  const relativeCli = relative(dirname(executable), cli);
  assert(relativeCli && !isAbsolute(relativeCli) && !relativeCli.split(/[\\/]/).includes('..'),
    'Local VS Code CLI must be inside the selected installation directory');
  const packagePath = resolve(dirname(cli), '..', 'package.json');
  const version = JSON.parse(readFileSync(packagePath, 'utf8')).version;
  assert.match(version ?? '', /^\d+\.\d+\.\d+$/, 'Local VS Code version is unavailable');
  return {
    executable,
    executableSha256: createHash('sha256').update(readFileSync(executable)).digest('hex'),
    cli,
    cliSha256: createHash('sha256').update(readFileSync(cli)).digest('hex'),
    version
  };
}

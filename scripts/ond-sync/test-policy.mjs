import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './bundle.mjs';
import { canonical,sha256,parseCanonical,keys } from './contract.mjs';
import assert from 'node:assert/strict';
const FILES=['config/ond-test-policy.json','scripts/integration/run.mjs','scripts/integration/download-vscode.mjs','scripts/integration/extract-vscode.ps1','scripts/integration/suite.cjs','scripts/integration/driver/extension.cjs','scripts/integration/driver/package.json','scripts/integration/diagnostics.cjs','scripts/integration/hello.ond'];
export function testPolicy(){const policy=parseCanonical(readFileSync(join(ROOT,FILES[0])));keys(policy,['schemaVersion','hostRuns','source','targets','vscodeVersion']);assert.equal(policy.schemaVersion,1);assert.equal(policy.hostRuns,2);assert.equal(policy.source,'ond-release');assert.deepEqual(policy.targets,['linux-x86_64','windows-x86_64']);assert.match(policy.vscodeVersion,/^\d+\.\d+\.\d+$/);return {policy,digest:sha256(canonical(FILES.map(path=>({path,sha256:sha256(readFileSync(join(ROOT,path)))}))))};}

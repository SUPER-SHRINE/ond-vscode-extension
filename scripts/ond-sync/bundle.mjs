import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical,sha256,DISTRIBUTION } from './contract.mjs';
export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
// 配布物リストは固定。環境のdirectory探索でplannerの入力を増やさない。
export { DISTRIBUTION } from './contract.mjs';
export function execution() {
  assert.match(process.version,/^v22\.\d+\.\d+$/,'Node 22 required');
  return {nodeVersion:process.version,nodeSha256:sha256(readFileSync(process.execPath)),modules:DISTRIBUTION.map(path=>{const bytes=readFileSync(resolve(ROOT,path));return {path,content:bytes.toString('base64'),sha256:sha256(bytes)};})};
}
export function verifyExecution(input){assert.equal(canonical(input.execution),canonical(execution()),'Planner/runtime differs from approved snapshot');assert.equal(input.plannerDigest,sha256(canonical(input.execution)));}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join,dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
// 固定versionを毎回公式配布元から取得。cache/latest/Insiders fallbackなし。
export async function downloadVSCode(version,target,directory) {
  const platform=target==='linux-x86_64'?'linux-x64':'win32-x64-archive';
  const first=await fetch(`https://update.code.visualstudio.com/${version}/${platform}/stable`,{redirect:'manual',signal:AbortSignal.timeout(30000)});
  assert.equal(first.status,302,'Official VS Code redirect unavailable');
  const digest=first.headers.get('x-sha256');assert.match(digest||'',/^[0-9a-f]{64}$/,'Official VS Code archive digest unavailable');
  const url=new URL(first.headers.get('location'));assert.equal(url.protocol,'https:');
  const response=await fetch(url,{signal:AbortSignal.timeout(120000)});assert(response.ok,'VS Code archive unavailable');
  const bytes=Buffer.from(await response.arrayBuffer());assert(bytes.length<1024*1024*1024);assert.equal(createHash('sha256').update(bytes).digest('hex'),digest,'VS Code archive checksum mismatch');
  mkdirSync(directory,{recursive:true});const archive=join(directory,target==='linux-x86_64'?'code.tar.gz':'code.zip');writeFileSync(archive,bytes);
  const unpack=join(directory,'unpacked');mkdirSync(unpack);
  const p=target==='linux-x86_64'?spawnSync('tar',['-xzf',archive,'-C',unpack]):spawnSync('pwsh',['-NoProfile','-File',join(dirname(fileURLToPath(import.meta.url)),'extract-vscode.ps1'),'-Archive',archive,'-Output',unpack]);
  if(p.error||p.status!==0)throw new Error('Could not unpack verified VS Code archive');
  return {executable:target==='linux-x86_64'?join(unpack,'VSCode-linux-x64','code'):join(unpack,'Code.exe'),archiveSha256:digest};
}

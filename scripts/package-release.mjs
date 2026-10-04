import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ROOT } from './ond-sync/bundle.mjs';
import { parseLock } from './ond-sync/contract.mjs';
import { join } from 'node:path';
const lock=parseLock(readFileSync(join(ROOT,'config/ond-release.lock.json'))),args=process.argv.slice(2);
assert(args.length===0||args.length===2&&['--version','--archives'].includes(args[0]),'Use --version or --archives');
if(args[0]==='--version')assert.equal(args[1],lock.version,'Requested version differs from adopted lock');
assert(!process.env.OND_TEST_SOURCE_LANE,'Local source lane cannot make an official release');
for(const [command,arguments_] of [[process.execPath,[join(ROOT,'scripts/ond-sync/cli.mjs'),'acquire','--out',join(ROOT,'server'),...(args[0]==='--archives'?args:[])]],[process.platform==='win32'?'npm.cmd':'npm',['run','package:vsix']]]){
  const env={...process.env};if(command!==process.execPath){delete env.OND_RELEASE_TOKEN;delete env.GH_TOKEN;delete env.GITHUB_TOKEN;}
  const p=spawnSync(command,arguments_,{cwd:ROOT,stdio:'inherit',env,shell:process.platform==='win32'&&command==='npm.cmd'});if(p.error)throw p.error;assert.equal(p.status,0,'Release packaging failed');
}

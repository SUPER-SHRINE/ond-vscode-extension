// maintainerのprivate環境専用。release lock・公開・共有cacheを操作しない。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { commit,version } from './ond-sync/contract.mjs';
import { verifySourceCommit } from "./source-checkout.mjs";
import { ROOT } from './ond-sync/bundle.mjs';
const [repository,sha,expectedVersion]=process.argv.slice(2);assert(repository,'Use <private Ond checkout> <exact SHA> <version>');commit(sha);version(expectedVersion);
const directory=resolve(repository);verifySourceCommit(directory,sha);
const env={...process.env,OND_TEST_SOURCE_LANE:'local',OND_REPOSITORY_PATH:directory,OND_SOURCE_SHA:sha,OND_SOURCE_VERSION:expectedVersion};delete env.OND_RELEASE_TOKEN;delete env.GH_TOKEN;delete env.GITHUB_TOKEN;
for(const script of ['package:vsix','test:integration']){const p=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run',script],{cwd:ROOT,env,stdio:'inherit',shell:process.platform==='win32'});if(p.error)throw p.error;assert.equal(p.status,0,'Private source test lane failed');verifySourceCommit(directory,sha);}

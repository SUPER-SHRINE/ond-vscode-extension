// CLI回帰test専用。許可したfixture応答以外のnetworkと全writeを拒否する。
import assert from 'node:assert/strict';
import { readFileSync,appendFileSync } from 'node:fs';
const routes=JSON.parse(readFileSync(process.env.OND_GATE_ROUTES,'utf8')),counts=new Map();
globalThis.fetch=async (url,options={})=>{
  const address=String(url),method=options.method||'GET';
  appendFileSync(process.env.OND_GATE_REQUESTS,JSON.stringify({address,method})+'\n');
  assert.equal(method,'GET','Fixture forbids network writes');
  assert(!/\/branches\/[^/]+\/protection|\/environments\//.test(address),'Fixture forbids settings audits');
  assert(Object.hasOwn(routes,address),`Unexpected network request: ${address}`);
  const sequence=routes[address],index=counts.get(address)||0;
  counts.set(address,index+1);
  const reply=sequence[Math.min(index,sequence.length-1)];
  return new Response(reply.binary?Buffer.from(reply.binary,'base64'):JSON.stringify(reply.json),{status:reply.status||200});
};

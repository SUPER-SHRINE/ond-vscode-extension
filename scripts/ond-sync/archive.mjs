// Archiveをfilesystemへ展開せず、固定されたbytesだけから読み取る。
import assert from 'node:assert/strict';
import { gunzipSync, inflateRawSync } from 'node:zlib';
import { compareVersions } from './contract.mjs';
const LIMIT = 100 * 1024 * 1024;
export const OND_NOTICE_FILES = ['THIRD-PARTY-NOTICES.txt','COPYRIGHT-library.html'];
function safeName(name) {
  assert(typeof name === 'string' && name.length > 0 && !name.includes('\\') && !name.includes('\0'));
  assert(!name.startsWith('/') && !name.includes(':') && !name.split('/').some(p => p === '..' || p === '.'), 'Unsafe archive path');
  return name;
}
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) { crc ^= b; for (let n=0;n<8;n++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipEntries(bytes) {
  assert(Buffer.isBuffer(bytes));
  let end=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--) if(bytes.readUInt32LE(p)===0x06054b50 && p+22+bytes.readUInt16LE(p+20)===bytes.length){end=p;break;}
  assert(end>=0,'Missing ZIP directory');
  assert.equal(bytes.readUInt16LE(end+4),0);assert.equal(bytes.readUInt16LE(end+6),0);
  const count=bytes.readUInt16LE(end+10);assert.equal(count,bytes.readUInt16LE(end+8));assert(count<65535,'ZIP64 unsupported');
  let cursor=bytes.readUInt32LE(end+16);const directoryEnd=cursor+bytes.readUInt32LE(end+12);assert.equal(directoryEnd,end);
  const output=new Map();let total=0;
  for(let n=0;n<count;n++) {
    assert(cursor+46<=directoryEnd);assert.equal(bytes.readUInt32LE(cursor),0x02014b50);
    const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),crc=bytes.readUInt32LE(cursor+16),size=bytes.readUInt32LE(cursor+20),plain=bytes.readUInt32LE(cursor+24);
    assert((flags & ~0x808)===0,'Encrypted/unsupported ZIP flags');assert([0,8].includes(method));
    const nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),offset=bytes.readUInt32LE(cursor+42);
    const name=safeName(bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8'));
    assert(!output.has(name),'Duplicate archive entry');
    const unixType=(bytes.readUInt32LE(cursor+38)>>>16)&0xf000;assert([0,0x8000,0x4000].includes(unixType),'ZIP symlink/special entry rejected');
    assert(offset+30<=bytes.readUInt32LE(end+16));assert.equal(bytes.readUInt32LE(offset),0x04034b50);
    assert.equal(bytes.readUInt16LE(offset+6),flags);assert.equal(bytes.readUInt16LE(offset+8),method);
    const localNameLength=bytes.readUInt16LE(offset+26),localExtra=bytes.readUInt16LE(offset+28);
    assert.equal(bytes.subarray(offset+30,offset+30+localNameLength).toString('utf8'),name);
    const start=offset+30+localNameLength+localExtra;assert(start+size<=bytes.readUInt32LE(end+16));
    total+=plain;assert(total<=LIMIT,'Archive too large');
    const data=method===0?bytes.subarray(start,start+size):inflateRawSync(bytes.subarray(start,start+size),{maxOutputLength:LIMIT});
    assert.equal(data.length,plain);assert.equal(crc32(data),crc,'ZIP CRC mismatch');
    output.set(name,data);cursor+=46+nameLength+extra+comment;
  }
  assert.equal(cursor,directoryEnd);return output;
}
export function tarEntries(archive) {
  const bytes=gunzipSync(archive,{maxOutputLength:LIMIT}),output=new Map();let cursor=0;
  const text=b=>b.toString('utf8').replace(/\0.*$/s,'');
  const octal=b=>{const t=text(b).trim();assert(/^[0-7]*$/.test(t));return t?parseInt(t,8):0;};
  for(;cursor+512<=bytes.length;){
    const header=bytes.subarray(cursor,cursor+512);if(header.every(b=>b===0))break;
    let sum=0;for(let n=0;n<512;n++)sum+=n>=148&&n<156?32:header[n];assert.equal(sum,octal(header.subarray(148,156)),'TAR checksum mismatch');
    const prefix=text(header.subarray(345,500)),name=safeName((prefix?prefix+'/':'')+text(header.subarray(0,100)));
    const type=header[156];assert([0,48,53].includes(type),'TAR link/special entry rejected');
    const size=octal(header.subarray(124,136));assert(size<=LIMIT&&cursor+512+size<=bytes.length);
    assert(!output.has(name),'Duplicate archive entry');output.set(name,bytes.subarray(cursor+512,cursor+512+size));
    cursor+=512+Math.ceil(size/512)*512;
  }
  assert(bytes.subarray(cursor).every(b=>b===0),'Invalid TAR trailer');return output;
}
export function extractBinary(archive,name,extension) {
  const entries=extension==='tar.gz'?tarEntries(archive):zipEntries(archive);
  assert(entries.has(name),'Missing archive binary');assert(entries.get(name).length>0);return entries.get(name);
}
export function extractNotices(archive,extension,version) {
  const entries=extension==='tar.gz'?tarEntries(archive):zipEntries(archive);
  if(!requiresNotices(version)) {
    assert(OND_NOTICE_FILES.every(name=>!entries.has(name)),'Unexpected notice files in pre-contract Ond archive');
    return null;
  }
  const notices={};
  for(const name of OND_NOTICE_FILES) { assert(entries.has(name),`Missing Ond archive notice: ${name}`);const bytes=entries.get(name);assert(bytes.length>0,`Empty Ond archive notice: ${name}`);notices[name]=bytes; }
  return notices;
}
export function requiresNotices(version) {
  return compareVersions(version,'0.1.3')>=0;
}

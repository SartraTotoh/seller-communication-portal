/**
 * Seller Communication Portal - Mojibake repair (double-encoded cp874 -> UTF-8).
 * Usage: node app/tools/fix-scp-mojibake.mjs
 *
 * Strategy:
 *  - Bytes were read as cp874 and re-saved as UTF-8, so Thai text shows as
 *    "เธฃเธญ" / "โ€”" / "ยฉ" / "โ€ฆ" / "ยท" etc.
 *  - Repair = encode back to cp874 bytes, then decode those bytes as UTF-8.
 *  - Only lines listed in the probe result are touched (scope-limited by
 *    design); lines that already contain intentional Thai are never altered.
 *  - JS identifiers longer than 3 chars that decode to Thai are renamed to
 *    English for production quality, with every occurrence kept consistent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORTAL_ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(PORTAL_ROOT, 'public', 'index.html');

const PROBE_FILE = process.env.SCP_MOJIBLAKE_PROBE
  || 'C:/Users/TOTOH~1.TAP/AppData/Local/Temp/opencode/mojibake-probe.json';

const CMAP = { 0x201a:0x82,0x0192:0x83,0x201e:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x02c6:0x88,0x2030:0x89,0x0160:0x8a,0x2039:0x8b,0x0152:0x8c,0x017d:0x8e,0x2018:0x91,0x2019:0x92,0x201c:0x93,0x201d:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02dc:0x98,0x2122:0x99,0x0161:0x9a,0x203a:0x9b,0x0153:0x9c,0x017e:0x9e,0x0178:0x9f };

function encode874(str){
  const out=[];
  for(const ch of str){
    const cp=ch.codePointAt(0);
    if(cp<=0x7f){out.push(cp);continue;}
    if(cp===0x20ac){out.push(0x80);continue;}
    if(cp>=0x80&&cp<=0x9f){out.push(cp);continue;}
    if(cp===0xa0){out.push(0xa0);continue;}
    if(CMAP[cp]!==undefined){out.push(CMAP[cp]);continue;}
    if(cp>=0x0e01&&cp<=0x0e5b){out.push(0xa1+(cp-0x0e01));continue;}
    return {error:'UNMAPPABLE U+'+cp.toString(16)};
  }
  return {bytes:out};
}
// CP874 bytes -> UTF-8 string (strict)
function from874Bytes(bytes){
  return Buffer.from(bytes).toString('utf8');
}
// Reverse mojibake: current junk chars -> original string.
function roundtrip(str){
  const enc=encode874(str);
  if(enc.error)return null;
  const dec=from874Bytes(enc.bytes);
  if(dec.includes('\uFFFD'))return null;
  return dec;
}
const RENAME = { 'dateรวมs':'dateCounts', 'peopleStatรวม':'peopleStatTotal' };
const renames = Object.entries(RENAME);

function validateProbe(){
  if(!fs.existsSync(PROBE_FILE))throw new Error('probe file missing: '+PROBE_FILE);
  return JSON.parse(fs.readFileSync(PROBE_FILE,'utf8'));
}
function main(){
  const probe=validateProbe();
  const changedLines=new Set(probe.filter(x=>x.roundtrip&&x.text!==x.fixed).map(x=>x.line));
  if(!changedLines.size)throw new Error('probe has no changed (mojibake) lines');
  const raw=fs.readFileSync(TARGET,'utf8');
  const lines=raw.replace(/\r/g,'').split('\n');
  let fixed=0,renamed=0;
  for(const n of changedLines){
    const i=n-1;
    if(i<0||i>=lines.length)continue;
    const fix=roundtrip(lines[i]);
    if(fix===null||fix===lines[i])continue;
    lines[i]=fix;
    fixed++;
  }
  // consistent identifier rename across whole file
  for(const line of lines){
    for(const [from,to] of renames){ if(line.includes(from)) renamed++; }
  }
  for(let i=0;i<lines.length;i++){
    for(const [from,to] of renames){
      if(lines[i].includes(from))lines[i]=lines[i].split(from).join(to);
    }
  }
  fs.writeFileSync(TARGET,Buffer.from(lines.join('\n'),'utf8'));
  console.log('mojibake lines fixed:',fixed,'| identifier occurrences renamed:',renamed);
}
main();
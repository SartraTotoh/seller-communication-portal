import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {fileURLToPath} from 'node:url';import {migrateGateway} from './gateway-migration.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const expected=fs.readdirSync(path.join(root,'backend')).filter(f=>f.endsWith('.gs')).map(f=>({name:f.slice(0,-3),type:'SERVER_JS',source:fs.readFileSync(path.join(root,'backend',f),'utf8')}));let n=0;function test(name,fn){fn();console.log('PASS '+name);n++}
const legacy={name:'PortalHttpGateway',type:'SERVER_JS',source:'// Original gateway\nfunction doGet(e){return "old:"+e.parameter.action;}\nfunction gatewayHelper(){return 3;}'};
let out;
test('Known gateway migrated without removing helper or route behavior',()=>{out=migrateGateway([legacy],expected);assert.ok(out.changed);assert.ok(out.migrated.source.includes('gatewayHelper'));const ctx={};vm.createContext(ctx);vm.runInContext(out.migrated.source,ctx);assert.equal(ctx.legacyPortalHttpGet_({parameter:{action:'legacy'}}),'old:legacy');assert.equal(ctx.gatewayHelper(),3);assert.equal(ctx.doGet,undefined)});
test('Original source object not mutated',()=>assert.ok(legacy.source.includes('function doGet(')));
test('Repeated migration is idempotent',()=>assert.equal(migrateGateway(out.files,expected).changed,false));
test('Other filenames remain untouched',()=>assert.equal(migrateGateway([{...legacy,name:'AnotherGateway'}],expected).changed,false));
test('Comment or string does not become a function declaration',()=>assert.equal(migrateGateway([{...legacy,source:'// function doGet(e){}\nconst example="function doGet(e){}";'}],expected).changed,false));
test('Recursive or indirect doGet references stop before edits',()=>assert.throws(()=>migrateGateway([{...legacy,source:'function doGet(e){return doGet(e);}'}],expected),/REFERENCES/));
test('Helper collision stops before edits',()=>assert.throws(()=>migrateGateway([{...legacy,source:legacy.source+'\nfunction portalCurrentEmail_(){}'}],expected),/SHARED_GLOBAL/));
test('Duplicate named gateway files rejected',()=>assert.throws(()=>migrateGateway([legacy,{...legacy,name:'backend/PortalHttpGateway.gs'}],expected),/AMBIGUOUS/));
test('Syntax error rejected',()=>assert.throws(()=>migrateGateway([{...legacy,source:'function doGet('}],expected)));
test('Existing legacy handler name rejected',()=>assert.throws(()=>migrateGateway([legacy,{name:'Other',source:'function legacyPortalHttpGet_(){}'}],expected),/ALREADY_EXISTS/));
test('POST handler preserved under alternate name',()=>{const x=migrateGateway([{...legacy,source:'function doPost(e){return e.postData.contents;}'}],expected);assert.ok(x.migrated.source.includes('function legacyPortalHttpPost_('))});
test('Canonical GET authentication happens before legacy fallback',()=>{const s=expected.find(x=>x.name==='TrackerSync').source;assert.ok(s.includes("portalViewerContext_(); if(typeof legacyPortalHttpGet_==='function')"))});
test('Uploader backs up before migration and cloud write',()=>{const s=fs.readFileSync(path.join(root,'tools/update-apps-script-deployment.mjs'),'utf8');const start=s.indexOf('async function selfHealHeadState');const body=s.slice(start,s.indexOf('function isLegacyAnyoneAccess',start));assert.ok(body.indexOf('remote-source-before.json')<body.indexOf('migrateGateway('));assert.ok(body.indexOf('migrateGateway(')<body.indexOf("token,'PUT'"))});
test('No clasp push before backup',()=>{const s=fs.readFileSync(path.join(root,'AUTO-DEPLOY.ps1'),'utf8');assert.ok(!s.includes("@('push','--force')"))});
console.log(`${n} gateway recovery tests passed.`);

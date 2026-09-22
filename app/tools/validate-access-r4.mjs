import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const backend=path.join(root,'backend');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const mustMatch={
  'ApiCenter.gs':'ea67d3bbbf659326a355ef5512e90cf59484745d386d292fd6ac5c39b5745017',
  'Closeout.gs':'b5ef147887def2948bee1f7c32623097395bea689b50749c8e197c965f761f71',
  'ContentOperations.gs':'b627f4fe90c28ba9959da826baea05afabe63ceac04bd443407b1212bfd96ada',
  'CycleEngine.gs':'714cb13f0aa4c7f72e9aaebe50b4a690cab1591bc2c6c314e0268c3545f8a301',
  'LiveSyncEngine.gs':'1abd06e0543fa1e46fcce09343e3946baa6c2661b03f9aab02cec411c74dcf19',
  'PeopleImportUi.gs':'55aa8f16f242da813d8ec17889727caeb685b543449f7577a051eacf0d633c50',
  'PeopleSeed.gs':'becb7efe4803d56a74143b03625099a9f2cc18de652df6fa0d7c973f02ec62e9',
  'PortalApi.gs':'d2bbe8b48aba490c59868e6e4910c102553940edb38be82cf8e231a4263954e6',
  'TrackerSync.gs':'b3561a2604809d3bca76856de883c0c3af462539d88bb20271027c94165950c2'
};
let fail=0; const pass=(m,ok)=>{console.log((ok?'PASS ':'FAIL ')+m); if(!ok)fail++};
for(const [name,expected] of Object.entries(mustMatch)) pass('Data/backend logic unchanged: '+name,sha(path.join(backend,name))===expected);
const manifest=JSON.parse(fs.readFileSync(path.join(backend,'appsscript.json'),'utf8'));
pass('Web app access = DOMAIN',manifest?.webapp?.access==='DOMAIN');
pass('Web app executes as deployment owner',manifest?.webapp?.executeAs==='USER_DEPLOYING');
const consent=fs.readFileSync(path.join(backend,'WorkspaceConsent.gs'),'utf8');
pass('Broken per-user OAuth link removed',!/getAuthorizationUrl\s*\(/.test(consent));
pass('Setup consent gate is bypassed',/function\s+portalSetupConsentGate_\s*\(\)\s*\{[\s\S]*?return\s+null\s*;[\s\S]*?\}/.test(consent));
const closeout=fs.readFileSync(path.join(backend,'Closeout.gs'),'utf8');
pass('Identity still uses active Workspace user',/Session\.getActiveUser\(\)\.getEmail\(\)/.test(closeout));
pass('No EffectiveUser identity fallback',!/Session\.getEffectiveUser\(\)/.test(closeout));
const portal=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
pass('Portal release remains v4.9.3',/data-portal-version="4\.9\.3"/.test(portal));
pass('Existing backend URL remains embedded for in-place update',/https:\/\/script\.google\.com\/a\/macros\/shopee\.com\/s\/AKfy[A-Za-z0-9_-]+\/exec/.test(portal));
if(fail){console.error(`R4 validation failed: ${fail}`);process.exit(1)}
console.log('R4 access validation PASS');

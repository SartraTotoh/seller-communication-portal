import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const np = p => path.join(root, 'public/new', p);
let n = 0, fail = [];
function check(label, ok, detail) {
  n++;
  if (ok) { console.log('PASS ' + label); }
  else { fail.push(label + (detail ? ' :: ' + detail : '')); console.log('FAIL ' + label + (detail ? ' :: ' + detail : '')); }
}
const html = fs.readFileSync(np('index.html'), 'utf8');
const js = fs.readFileSync(np('js/app.js'), 'utf8');
const css = fs.readFileSync(np('css/app.css'), 'utf8');
const data = fs.readFileSync(np('data/requests-2026.json'), 'utf8');

check('index.html exists', html.length > 500);
check('assets referenced', html.includes('css/app.css') && html.includes('js/app.js'));
check('html lang=en + utf8', /<html lang="en"/.test(html) && /<meta charset="UTF-8">/.test(html));
check('boot gate present', html.includes('id="bootGate"'));

// Every element id referenced from app.js must exist in index.html OR be
// generated dynamically by app.js itself (modal form templates, rows, etc.)
const ids = new Set([...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
const dynIds = new Set([...js.matchAll(/id="([^"${}]+)"/g)].map(m => m[1]));
let missing = [];
for (const id of ids) {
  if (id.startsWith('__')) continue;
  const inHtml = html.indexOf('id="' + id + '"') !== -1 || html.indexOf('id=\'' + id + '\'') !== -1;
  const inJs = dynIds.has(id);
  if (!inHtml && !inJs) missing.push(id);
}
check('all getElementById ids exist in html or dynamic templates', missing.length === 0, missing.join(','));

// Every data-i18n key referenced in app.js must exist in html or be handled
const i18nKeys = new Set([...js.matchAll(/getI18n\('([^']+)'\)|i18n\(\s*'([^']+)'\)/g)].map(m => m[1] || m[2]));
let i18nMissing = [];
for (const k of i18nKeys) { if (html.indexOf('data-i18n="' + k + '"') === -1 && html.indexOf('data-i18n="' + k + '.') === -1) i18nMissing.push(k); }
check('i18n keys resolved in html', i18nMissing.length === 0, i18nMissing.join(','));

// app.js must be valid JS
let jsOk = true, jsErr = '';
try { new vm.Script(js, {filename: 'app.js'}); } catch (e) { jsOk = false; jsErr = e.message; }
check('app.js parses as valid JS', jsOk, jsErr);

// requests-2026.json must be valid JSON with expected shape
let obj = null, jsonErr = '';
try { obj = JSON.parse(data); } catch (e) { jsonErr = e.message; }
check('requests-2026.json is valid JSON', obj !== null, jsonErr);
check('requests json shape', obj && Array.isArray(obj.requests) && obj.meta && obj.meta.mode === 'locked' && obj.lookups && Array.isArray(obj.lookups.sellerScopes));

// Mojibake / encoding sanity: no C1 control bytes, no U+FFFD
function hasC1(s) { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c >= 0x80 && c <= 0x9F) return true; } return false; }
for (const [label, content] of [['index.html', html], ['js/app.js', js], ['css/app.css', css], ['requests json', data]]) {
  check('no C1 control bytes in ' + label, !hasC1(content));
  check('no U+FFFD in ' + label, !content.includes('\uFFFD'));
}

// Regressions on known mojibake fragments (double-encoded Thai must never reappear)
let moji = [];
for (const [label, content] of [['index.html', html], ['js/app.js', js]]) {
  for (const frag of ['เธ', 'ยท', 'เน€', 'เธฟ']) { if (content.includes(frag)) moji.push(label + ':' + frag); }
}
check('no known mojibake fragments', moji.length === 0, moji.join(','));

console.log((n - fail.length) + '/' + n + ' checks passed.');
if (fail.length) { console.log('SMOKE FAILED'); process.exit(1); }
console.log('SMOKE OK');
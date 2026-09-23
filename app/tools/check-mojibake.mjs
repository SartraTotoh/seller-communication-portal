import fs from 'node:fs';
import path from 'node:path';
const SUSP = /เธฃ|เธฌ|เธดเธฟ|เน€|โ€|ยฉ|เธทเธ|เธฃเธงเธก/;
function scan(file) {
  const s = fs.readFileSync(file, 'utf8');
  const ff = (s.match(/\uFFFD/g) || []).length;
  let c1 = 0; for (let k = 0; k < s.length; k++) { const cp = s.codePointAt(k); if (cp >= 0x80 && cp <= 0x9f) c1++; }
  let susp = 0; const m = s.match(SUSP); if (m) susp = m.length;
  return { file, ff, c1, susp };
}
const backendFiles = fs.readdirSync('app/backend').filter(f => f.endsWith('.gs')).map(f => 'app/backend/' + f);
const targets = [
  'app/public/index.html',
  'app/public/new/index.html',
  'app/public/new/js/app.js',
  ...backendFiles,
];
const ok = [];
for (const p of targets) {
  if (!fs.existsSync(p)) continue;
  const r = scan(p);
  const pass = r.ff === 0 && r.c1 === 0 && r.susp === 0;
  ok.push({ ...r, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' - ' + r.file + '  (FFFD:' + r.ff + ' C1:' + r.c1 + ' suspicious:' + r.susp + ')');
}
if (ok.some(x => !x.pass)) process.exit(1);
console.log('mojibake guard: ALL CLEAN');
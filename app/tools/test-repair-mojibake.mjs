import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync('C:/Users/totoh.taponchai/Documents/seller communication portal/app/public/index.html', 'utf8');
const start = html.indexOf('const W874_MAP=');
const end = html.indexOf('function importHeaderKey(', start);
if (start < 0 || end < 0) { console.error('helper block not found'); process.exit(2); }
const src = html.slice(start, end) + '\n';
const ctx = { TextDecoder };
vm.createContext(ctx);
new vm.Script(src, { filename: 'repair-helpers' }).runInContext(ctx);

const cases = [
  ['เธฃเธงเธก', 'รวม'],
  ['เธฃ', 'ร'],
  ['โ€”', '—'],
  ['โ€ฆ', '…'],
  ['ยท', '·'],
];
let pass = 0;
for (const [input, expected] of cases) {
  const got = ctx.repairMojibake(input);
  const ok = expected === '' ? (got !== input && got.length > 0) : got === expected;
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'} repairMojibake(${JSON.stringify(input)}) = ${JSON.stringify(got)}${expected !== '' ? ' expect ' + JSON.stringify(expected) : ' expect repaired'}`);
}
for (const t of ['ลบ', 'แผน', 'ทั่วไป', 'ปลายทาง', 'รายงาน', 'a b', '']) {
  const got = ctx.repairMojibake(t);
  const ok = got === t;
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'} keep(${JSON.stringify(t)}) = ${JSON.stringify(got)}`);
}
console.log(`\n${pass}/${cases.length + 7} pass`);
process.exit(pass === cases.length + 7 ? 0 : 1);
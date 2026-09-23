import fs from 'fs';
import vm from 'vm';

const base = 'C:/Users/totoh.taponchai/Documents/seller communication portal/app';

const html = fs.readFileSync(base + '/public/index.html', 'utf8');
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, n = 0, fail = 0;
while ((m = re.exec(html)) !== null) {
  n++;
  try { new vm.Script(m[1], { filename: `inline-block-${n}` }); console.log(`html block ${n}: OK`); }
  catch (e) { fail++; console.log(`html block ${n}: FAIL -> ${e.message}`); }
}

const gs = ['Charset.gs', 'PortalApi.gs', 'PeopleImportUi.gs'];
for (const f of gs) {
  try { new vm.Script(fs.readFileSync(base + '/backend/' + f, 'utf8'), { filename: f }); console.log(`gs ${f}: OK`); }
  catch (e) { fail++; console.log(`gs ${f}: FAIL -> ${e.message}`); }
}

console.log(`\ntotal=${n + gs.length} fail=${fail}`);
process.exit(fail ? 1 : 0);
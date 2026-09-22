import vm from 'node:vm';
function parse(source){
 const native=process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
 if(!native)throw new Error('NODE_JS_PARSER_UNAVAILABLE');
 const exports={};vm.runInNewContext(native,{exports,module:{exports}});
 return exports.parse(source,{ecmaVersion:'latest',sourceType:'script'});
}
function globals(tree){
 const names=[];
 for(const n of tree.body){
  if(n.type==='FunctionDeclaration'||n.type==='ClassDeclaration'){if(n.id)names.push(n.id.name);}
  if(n.type==='VariableDeclaration')for(const d of n.declarations){if(d.id.type!=='Identifier')throw new Error('GATEWAY_DESTRUCTURING_REQUIRES_REVIEW');names.push(d.id.name);}
 }
 return names;
}
function walk(n,fn){if(!n||typeof n!=='object')return;fn(n);for(const [k,v]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(x=>walk(x,fn));else if(v&&typeof v==='object')walk(v,fn);}}
export function migrateGateway(files,expected){
 const candidates=files.filter(f=>String(f.name).replace(/\\/g,'/').split('/').pop().replace(/\.(gs|js)$/i,'').toLowerCase()==='portalhttpgateway');
 if(!candidates.length)return {files,changed:false};
 if(candidates.length!==1)throw new Error('AMBIGUOUS_PORTAL_HTTP_GATEWAY');
 const f=candidates[0];if(f.type!=='SERVER_JS')throw new Error('UNEXPECTED_GATEWAY_TYPE');
 const ast=parse(f.source),declared=globals(ast),names=new Set(expected.flatMap(e=>e.type==='SERVER_JS'?globals(parse(e.source)):[]));
 const replacements=[];
 for(const handler of ['doGet','doPost']){
  const found=ast.body.filter(n=>n.type==='FunctionDeclaration'&&n.id?.name===handler);
  if(!found.length)continue;
  if(found.length!==1)throw new Error('DUPLICATE_GATEWAY_HANDLER');
  let uses=0;walk(ast,n=>{if(n.type==='Identifier'&&n.name===handler)uses++;});
  if(uses!==1)throw new Error('GATEWAY_HANDLER_REFERENCES_REQUIRE_REVIEW');
  replacements.push({start:found[0].id.start,end:found[0].id.end,name:handler==='doGet'?'legacyPortalHttpGet_':'legacyPortalHttpPost_'});
 }
 if(!replacements.length)return {files,changed:false};
 for(const name of declared){if(names.has(name)&&!['doGet','doPost'].includes(name))throw new Error('GATEWAY_SHARED_GLOBAL_REQUIRES_REVIEW:'+name);}
 for(const name of replacements.map(r=>r.name)){if(declared.includes(name)||files.some(x=>x!==f&&new RegExp('function\\s+'+name+'\\s*\\(').test(String(x.source))))throw new Error('LEGACY_HANDLER_NAME_ALREADY_EXISTS');}
 let source=f.source;for(const r of replacements.sort((a,b)=>b.start-a.start))source=source.slice(0,r.start)+r.name+source.slice(r.end);
 parse(source);return {files:files.map(x=>x===f?{...f,source}:x),changed:true,migrated:{...f,source},handlers:replacements.map(r=>r.name)};
}

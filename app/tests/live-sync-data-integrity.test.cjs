/* Source-isolated regression gates. Never reads seller rows or executes live GAS. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../backend/LiveSyncEngine.gs'),'utf8');

function extract(name) {
  const term='function '+name+'(';
  const start=script.indexOf(term);
  assert.notEqual(start,-1,name+' not found');
  let i=script.indexOf('{',start),depth=1;
  assert.ok(i>start);
  for(i++;i<script.length&&depth;i++){ if(script[i]==='{')depth++; if(script[i]==='}')depth--; }
  assert.equal(depth,0,name+' unbalanced');
  return script.slice(start,i);
}
const context=vm.createContext({ensureSheetSize_:()=>{}});
vm.runInContext([
  extract('assertSourceSnapshotHealthy_'),
  extract('writeTableObjects_')
].join('\n'),context,{timeout:3000});
const validate=context.assertSourceSnapshotHealthy_;
const persist=context.writeTableObjects_;

function states(n=100) {
  return Array.from({length:n},(_,i)=>({
    state_id:'STATE-'+i,source_id:'SRC-SC-REQUEST',
    source_record_key:'SC|'+i, source_row_locator:'Sheet!'+(i+1),
    canonical_status:'SUBMITTED', missing_from_source:'FALSE'
  }));
}
function sourceFromStates(s) {
  return {scannedRows:s.length+15,records:s.map(x=>({
    sourceRecordKey:x.source_record_key,sourceRowLocator:x.source_row_locator
  })),exclusions:[]};
}
function makeSheet(name,ids,options={}) {
  const header=name==='Requests'?'request_id':name==='Comms_Items'?'comms_item_id':'state_id';
  let data=ids.map(x=>[String(x),'value']);
  const events=[];
  const sheet={
    getName:()=>name,getLastRow:()=>1+data.length,
    getRange(row,col,n,cols){
      const at=row-2;
      return {
        setValues(values){
          events.push('setValues');
          if(options.failSet)throw Error('SIMULATED_WRITE_ERROR');
          for(let j=0;j<values.length;j++){
            if(!data[at+j])data[at+j]=[];
            for(let k=0;k<cols;k++)data[at+j][col-1+k]=values[j][k];
          }
        },
        getValues(){
          events.push('getValues');
          const values=Array.from({length:n},(_,j)=>
            Array.from({length:cols},(_,k)=>data[at+j]?.[col-1+k]??''));
          if(options.corruptReadback)values[0][0]='CORRUPTED';
          return values;
        },
        clearContent(){
          events.push('clearContent');
          for(let j=0;j<n;j++)for(let k=0;k<cols;k++){
            if(data[at+j])data[at+j][col-1+k]='';
          }
        }
      };
    }
  };
  return {table:{sheet,headers:[header,'description'],objects:ids.map(x=>({[header]:String(x),description:'updated'}))},
    events,getData:()=>data.map(r=>r.slice())};
}
test('source guard accepts complete idempotent source',()=>{
  const old=states(100),current=sourceFromStates(old);
  const result=validate('SRC-SC-REQUEST',current,old);
  assert.equal(result.matched,100);
});
test('source guard blocks zero records even when forced sync might be requested',()=>{
  assert.throws(()=>validate('SRC-SC-REQUEST',{scannedRows:0,records:[],exclusions:[]},states(100)),/SYNC_SOURCE_EMPTY_ABORTED/);
});
test('source guard blocks more than 20 percent disappearance',()=>{
  const old=states(100);
  assert.throws(()=>validate('SRC-SC-REQUEST',sourceFromStates(old.slice(0,18)),old),/SYNC_MASS_MISSING_ABORTED/);
});
test('source guard blocks a remapped snapshot with new unknown IDs',()=>{
  const old=states(100),current=sourceFromStates(old);
  current.records=current.records.map((r,i)=>({...r,sourceRecordKey:'BAD|'+i,sourceRowLocator:'Unexpected!'+i}));
  assert.throws(()=>validate('SRC-SC-REQUEST',current,old),/SYNC_MASS_MISSING_ABORTED/);
});
test('source guard accepts initial import with no previous state',()=>{
  const result=validate('SRC-SC-REQUEST',{scannedRows:80,records:[{sourceRecordKey:'new'}],exclusions:[]},[]);
  assert.equal(result.previous,0);
});
test('write-before-trim preserves data when Sheets setValues throws',()=>{
  const p=makeSheet('Requests',['REQ1','REQ2','REQ3'],{failSet:true});
  assert.throws(()=>persist(p.table),/SIMULATED_WRITE_ERROR/);
  assert.deepEqual(p.events,['setValues']);
  assert.deepEqual(p.getData().map(x=>x[0]),['REQ1','REQ2','REQ3']);
});
test('write-before-trim changes rows then removes only old tail',()=>{
  const p=makeSheet('Requests',['REQ1','REQ2','REQ3','REQ4']);
  p.table.objects=p.table.objects.slice(0,3);
  persist(p.table);
  assert.deepEqual(p.events,['setValues','getValues','clearContent']);
  assert.deepEqual(p.getData().map(x=>x[0]),['REQ1','REQ2','REQ3','']);
});
test('protects 100+ existing Requests from catastrophic shrink',()=>{
  const old=Array.from({length:100},(_,i)=>'REQ'+i);
  const p=makeSheet('Requests',old);p.table.objects=p.table.objects.slice(0,5);
  assert.throws(()=>persist(p.table),/SYNC_PROTECTED_TABLE_SHRINK_ABORTED/);
  assert.deepEqual(p.events,[]);
});
test('rejects duplicate or missing keys before writing',()=>{
  const p=makeSheet('Comms_Items',['CI1','CI2']);p.table.objects[1].comms_item_id='CI1';
  assert.throws(()=>persist(p.table),/SYNC_PROTECTED_TABLE_BAD_OR_DUPLICATE_ID/);
  assert.deepEqual(p.events,[]);
});
test('readback failure aborts before clearing trailing rows',()=>{
  const p=makeSheet('Requests',['REQ1','REQ2','REQ3'],{corruptReadback:true});
  p.table.objects=p.table.objects.slice(0,2);
  assert.throws(()=>persist(p.table),/SYNC_PROTECTED_TABLE_READBACK_FAILED/);
  assert.deepEqual(p.events,['setValues','getValues']);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const C=require('../src/core.js');
function service({meta={indexedPages:1,total:3},text='Partial cached prose',fresh=true,workerResult,workerError,readError=false}={}) {
  let calls=0;
  const context={PaperStatsCore:C,Zotero:{logError:()=>{},FullText:{getPages:async()=>meta,getItemCacheFile:()=>({path:'cache'})},
    PDFWorker:{getFullText:async(id,maxPages,priority)=>{calls++;assert.equal(maxPages,null);assert.equal(priority,false);if(workerError)throw Error('extraction unavailable');return workerResult;}}}};
  context.IOUtils={stat:async()=>({lastModified:fresh?200:50}),readUTF8:async()=>{if(readError)throw Error('missing');return text;}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../src/main.js'),'utf8'),context);
  return {extract:force=>context.PaperStatistics.TextStatisticsService.extract({id:1},{lastModified:100},force),calls:()=>calls};
}
test('fresh complete cache is reused without parsing',async()=>{
  const s=service({meta:{indexedPages:3,total:3}});const r=await s.extract(false);
  assert.equal(s.calls(),0);assert.equal(r.textCompleteness,'complete');assert.equal(r.totalPages,3);
});
test('partial index obtains complete text through all-page worker',async()=>{
  const s=service({workerResult:{text:'Complete extracted prose',totalPages:3,extractedPages:3}});const r=await s.extract(false);
  assert.equal(s.calls(),1);assert.equal(r.textCompleteness,'complete');assert.equal(r.indexedPages,3);
});
test('worker failure preserves known partial coverage and its UI marker',async()=>{
  const s=service({workerError:true});const r=await s.extract(false);
  assert.equal(r.textCompleteness,'partial');assert.equal(r.indexedPages,1);assert.equal(r.totalPages,3);
  const data=C.encodeColumn({...C.analyze(r.text),...r},'words');assert.match(data,/\|~3\|Partial text: 1 \/ 3/);
});
test('stale cache and missing cache cannot resurrect old page metadata',async()=>{
  for(const patch of [{fresh:false},{readError:true}]){
    const s=service({...patch,meta:{indexedPages:100,total:184},workerError:true});const r=await s.extract(false);
    assert.equal(r.text,'');assert.equal(r.totalPages,null);assert.equal(r.textCompleteness,'unknown');
  }
});
test('force recompute bypasses even fresh complete fulltext cache',async()=>{
  const s=service({meta:{indexedPages:3,total:3},workerResult:{text:'New PDF prose',totalPages:3,extractedPages:3}});
  const r=await s.extract(true);assert.equal(s.calls(),1);assert.equal(r.text,'New PDF prose');
});
test('unknown extraction coverage never becomes a plain exact word count',async()=>{
  const s=service({meta:null,workerResult:{text:'Readable words but no coverage metadata'}});const r=await s.extract(false);
  assert.equal(r.textCompleteness,'unknown');assert.match(C.encodeColumn({...C.analyze(r.text),...r},'words'),/\|~/);
});

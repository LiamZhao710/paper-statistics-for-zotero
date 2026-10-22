const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

test('word normalization, Unicode, scientific tokens, contractions and line-end hyphens', () => {
  assert.equal(C.normalizeText('distribu-\ntion'), 'distribution');
  assert.equal(C.TextStatisticsService.count("α-synuclein H2O don't naïve distribu-\ntion 123 = + https://x.org/a 10.1234/example"), 5);
  assert.equal(C.TextStatisticsService.count('ﬁnite\u00a0element'), 2);
  assert.equal(C.TextStatisticsService.count('state-of-the-art isn’t β2'), 3);
});
test('repeated margins are removed only at page edges', () => {
  const text = [1,2,3].map(n => `Journal Test ${n}\nPage ${n}\nUnique prose page ${n}\nBody text\nFooter ${n}`).join('\f');
  const result = C.removeRepeatedMargins(text);
  assert.ok(!result.includes('Journal Test'));
  assert.ok(result.includes('Unique prose'));
  assert.equal(C.removeRepeatedMargins('one\ftwo'), 'one\ftwo');
});
test('figures are caption-based, normalized and deduplicated', () => {
  const text = `As shown in Fig. 3, this is prose.\nFig. 1. Architecture\nFigure 1: Architecture repeated\nFIG. 2(a) Result A\nFig. 2(b) Result B\nFigure S2: Supplement\nFig. S1. More results\nFig. 10. A caption\nFig. 9 shows the outcome.\nFigure 8 and Figure 9 illustrate the method.`;
  assert.deepEqual(C.FigureDetector.detect(text).ids, ['1','2','10','S1','S2']);
  assert.equal(C.FigureDetector.detect(text, false).count, 3);
});
test('tables normalize Roman/Arabic, support two-line IEEE labels and supplementary', () => {
  const text = 'See Table 5 for details.\nTABLE III\nCOMPARISON OF METHODS\nTable 3: Comparison repeated\nTable II. Values\nTable S1 Supplement\nTable 10. Values\nTable 4 shows the result.';
  assert.deepEqual(C.TableDetector.detect(text).ids, ['2','3','10','S1']);
  assert.equal(C.TableDetector.detect(text, false).count, 3);
  assert.equal(C.normalizedID('IIX'), null);
});
test('no text has unknown statistics instead of fake zero', () => {
  assert.equal(C.analyze('').words, null);
  assert.equal(C.analyze('1234').figures, null);
  assert.equal(C.analyze('There are no captions.').figures, 0);
});
test('pure analysis API allows explicit reference enablement and rejects weak evidence', () => {
  const numbered = 'REFERENCES\n[1] Smith 2020\n[2] Wang 2021\n[3] Jones 2022\nAppendix A\n[4] Not a reference';
  assert.equal(C.analyze(numbered).references, null);
  assert.equal(C.analyze(numbered, {references:true}).references, 3);
  assert.equal(C.ReferencesDetector.detect('Bibliography\n1. Smith\n2. Wang\n3. Jones').count, 3);
  assert.equal(C.ReferencesDetector.detect('References\nSmith, J., 2020\nWang, X., 2021').count, null);
  assert.equal(C.ReferencesDetector.detect('References\n[1] A\n[3] C\n[4] D').count, null);
});
test('sort keys order numerically independent of partial marker or thousands separator', () => {
  const values = [100,7,1200,12,0,8421];
  const encoded = values.map(n => C.encodeColumn({ words:n, textCompleteness:'partial',indexedPages:100,totalPages:184 },'words'));
  assert.deepEqual(encoded.sort().map(s => Number(s.slice(0,16))), [0,7,12,100,1200,8421]);
  assert.match(encoded[0], /\|~0\|Partial text: 100 \/ 184/);
  assert.equal(C.encodeColumn({words:null},'words'), '');
  assert.ok(!C.encodeColumn({pages:12,textCompleteness:'partial'},'pages').includes('~'));
});
test('cache validity covers identity, mtime, size, algorithm and detector settings', () => {
  const a={id:42,key:'ABC',libraryID:1}, s={size:100,lastModified:20}, o={includeSupplementary:true};
  const c={attachmentID:42,attachmentKey:'ABC',libraryID:1,fileSize:100,fileMTime:20,algorithmVersion:C.ALGORITHM_VERSION,settingsKey:C.settingsKey(o)};
  assert.ok(C.cacheValid(c,a,s,o));
  for (const patch of [{fileMTime:21},{fileSize:101},{attachmentKey:'XYZ'},{attachmentID:43},{libraryID:2},{algorithmVersion:0}]) assert.ok(!C.cacheValid({...c,...patch},a,s,o));
  assert.ok(!C.cacheValid(c,a,s,{references:true}));
});
test('primary PDF uses available best, then stored, then stable ID; never journal pages', async () => {
  const att=(id,stored=true,available=true)=>({id, key:String(id), isPDFAttachment:()=>true,isStoredFileAttachment:()=>stored,getFilePathAsync:async()=>available?'x.pdf':false});
  const all=[att(5,false),att(7,true),att(3,true)];
  const parent={isRegularItem:()=>true,getAttachments:()=>[5,7,3],getBestAttachment:async()=>all[0]};
  assert.equal((await C.selectPrimaryPDF(parent,id=>all.find(a=>a.id===id))).id,5);
  parent.getBestAttachment=async()=>att(10,true,false);
  assert.equal((await C.selectPrimaryPDF(parent,id=>all.find(a=>a.id===id))).id,3);
  parent.getAttachments=()=>[];
  assert.equal(await C.selectPrimaryPDF(parent,()=>null),null);
});
test('queue defers work, bounds concurrency, deduplicates and cancels queued tasks', async () => {
  const q=new C.BackgroundQueue(2); let running=0,max=0,calls=0;
  const fn=async()=>{calls++;max=Math.max(max,++running);await new Promise(r=>setTimeout(r,8));running--;return 1;};
  const p=q.add('a',fn); assert.equal(calls,0); assert.equal(q.add('a',fn),p);
  const promises=[p,...Array.from({length:8},(_,i)=>q.add('b'+i,fn))];
  const cancelled=q.add('cancel',()=>{throw Error('must not run');},{cancelled:true});
  assert.equal(await cancelled,null); await Promise.all(promises); await q.idle();
  assert.equal(max,2); assert.equal(calls,9);
  q.close(); await assert.rejects(q.add('x',fn));
});

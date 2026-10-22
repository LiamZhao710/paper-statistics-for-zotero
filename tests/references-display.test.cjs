const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm');
const C=require('../src/core.js');
const APA='References\nSmith, J. (2020). First research article.\nWang, X., 2021. Second research article.\nJones, M. (2022a). Third research article.';
test('numbered references support bracket, parenthesis, dot and closing parenthesis',()=>{
  for(const label of [n=>`[${n}]`,n=>`(${n})`,n=>`${n}.`,n=>`${n})`]){
    const text='References\n'+[1,2,3].map(n=>label(n)+' Smith Research '+n).join('\n');
    const r=C.ReferencesDetector.detect(text);assert.equal(r.count,3);assert.equal(r.confidence,'high');
  }
});
test('one or two clearly numbered references are valid counts',()=>{
  assert.equal(C.ReferencesDetector.detect('Bibliography\n[1] Smith First paper.').count,1);
  assert.equal(C.ReferencesDetector.detect('参考文献\n1. Wang Paper.\n2. Zhang Paper.').count,2);
});
test('numbering on separate line and repeated running heading are handled',()=>{
  const r=C.ReferencesDetector.detect('REFERENCES\n[1]\nSmith First paper.\n[2] Wang Second paper.\fREFERENCES\n[3] Jones Third paper.');
  assert.equal(r.count,3);
});
test('numbered bibliography survives column reorder and exact duplicate labels',()=>{
  const r=C.ReferencesDetector.detect('8. References\n[3] C\n[1] A\n[2] B\n[1] A');
  assert.equal(r.count,3);assert.deepEqual(r.ids,['1','2','3']);
});
test('gaps, missing bodies and conflicting numbered labels stay unknown',()=>{
  for(const text of ['References\n[1] A\n[3] C','References\n[1]\n[2] B','References\n[1] A\n[1] Other paper']){
    assert.equal(C.ReferencesDetector.detect(text).count,null);
  }
});
test('bibliography limits exclude appendix, author contributions and data statement',()=>{
  for(const ending of ['Appendix A','Author contributions','Data availability']){
    assert.equal(C.ReferencesDetector.detect(`References\n[1] Paper\n${ending}\n[2] Not a reference`).count,1);
  }
});
test('heading and first numbered reference may share a paragraph',()=>{
  assert.equal(C.ReferencesDetector.detect('REFERENCES [1] Smith Paper\n[2] Wang Paper').count,2);
  assert.equal(C.ReferencesDetector.detect('This references earlier work.\n[1] Smith Paper').count,null);
});
test('APA and Harvard references are explicitly estimated and rendered with tilde',()=>{
  const r=C.analyze(APA,{references:true});assert.equal(r.references,3);assert.equal(r.referenceStyle,'author-year');
  assert.equal(r.referenceConfidence,'estimated');assert.match(C.encodeColumn({...r,textCompleteness:'complete'},'references'),/\|~3\|/);
  assert.equal(C.ReferencesDetector.detect(APA,{authorYear:false}).count,null);
});
test('author-year duplicates deduplicate, distinct papers in the same year remain',()=>{
  const text=APA+'\nSmith, J. (2020). First research article.\nSmith, J. (2020). Different research article.';
  assert.equal(C.ReferencesDetector.detect(text).count,4);
});
test('author-year year on next line is supported without counting continuation text',()=>{
  const text='References\nSmith, J.\n(2020). First research article.\nJournal of Research, 2020, 1-10.\nWang X, 2021. Second research article.\nJones, M. (2022). Third research article.';
  assert.equal(C.ReferencesDetector.detect(text).count,3);
});
test('insufficient author-year evidence and years in ordinary prose stay unknown',()=>{
  assert.equal(C.ReferencesDetector.detect('References\nSmith, J., 2020. One article.\nWang, X., 2021. Another article.').count,null);
  assert.equal(C.ReferencesDetector.detect('References\nThere were 2020 participants.\nPublished in 2021.\nJournal issue 2022.').count,null);
});
test('numbered reference confidence does not remove partial extraction marker',()=>{
  const r=C.analyze('References\n[1] A',{references:true});
  assert.match(C.encodeColumn({...r,textCompleteness:'partial',indexedPages:1,totalPages:3},'references'),/\|~1\|Partial text/);
  assert.match(C.encodeColumn({...r,textCompleteness:'complete'},'references'),/\|1\|/);
});
test('default visible metrics are compact and user can hide or select any subset',()=>{
  const prefs=new Map();
  const context={PaperStatsCore:C,Zotero:{Prefs:{get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v)}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../src/main.js'),'utf8'),context);
  const api=context.PaperStatistics;
  assert.deepEqual([...api.visibleMetrics()],['pages','words','references']);
  api.setVisibleMetrics(['references']);assert.deepEqual([...api.visibleMetrics()],['references']);
  api.setVisibleMetrics([]);assert.deepEqual([...api.visibleMetrics()],[]);
  api.setVisibleMetrics(Object.keys(C.METRICS));assert.equal(api.visibleMetrics().length,8);
  assert.throws(()=>api.setVisibleMetrics(['title']));
});
test('display choices are independent from extraction settings and cached counts',()=>{
  const a=C.settingsKey({references:true,authorYearReferences:true});
  assert.equal(a,C.settingsKey({references:true,authorYearReferences:true,show:{references:false}}));
  assert.notEqual(a,C.settingsKey({references:true,authorYearReferences:false}));
});

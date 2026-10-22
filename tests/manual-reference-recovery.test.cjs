const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
test('merged bibliography paragraphs retain all bracket entry labels',()=>{
  const r=C.ReferencesDetector.detect('References\n[1] Smith A. First paper. [2] Wang B. Second paper. [3] Jones C. Third paper.');
  assert.equal(r.count,3);assert.deepEqual(r.ids,['1','2','3']);assert.equal(r.confidence,'high');
});
test('heading merged into prose and spaced heading/brackets are recoverable',()=>{
  assert.equal(C.ReferencesDetector.detect('End of the discussion. References [1] Smith A. Paper. [2] Wang B. Paper.').count,2);
  assert.equal(C.ReferencesDetector.detect('R E F E R E N C E S\n[ 1 ] Smith Paper\n[ 2 ] Wang Paper').count,2);
});
test('incomplete but substantial numeric bibliography returns detected count with estimate flag',()=>{
  const r=C.analyze('References\n[1] Smith Paper. [2] Wang Paper. [4] Jones Paper.',{references:true});
  assert.equal(r.references,3);assert.equal(r.referenceConfidence,'estimated');
  assert.match(C.encodeColumn({...r,textCompleteness:'complete'},'references'),/\|~3\|/);
  assert.notEqual(r.references,4);
});
test('sparse or conflicting numbering is still unknown',()=>{
  assert.equal(C.ReferencesDetector.detect('References\n[1] Smith A\n[40] Wang B\n[80] Jones C').count,null);
  assert.equal(C.ReferencesDetector.detect('References\n[1] Smith A [1] Wang B [2] Jones C').count,null);
});
test('a real bibliography heading wins over an earlier prose mention of references',()=>{
  const text='See references [9] for details.\nThe main discussion continues.\nReferences\n[1] Smith A. Paper. [2] Wang B. Paper.';
  assert.equal(C.ReferencesDetector.detect(text).count,2);
});
test('manual values validate integers, allow zero and blank reset, reject unsafe numbers',()=>{
  for(const value of ['0',0,'42',42,' 17 '])assert.equal(C.parseManualValue(value),Number(value));
  for(const value of ['',null,undefined,'   '])assert.equal(C.parseManualValue(value),null);
  for(const value of ['1.5',-1,'1e3','1,200','no',true,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>C.parseManualValue(value));
});
test('manual overlay preserves automatic record and labels provenance in columns',()=>{
  const automatic={references:null,words:123,textCompleteness:'partial',indexedPages:1,totalPages:3};
  const manual={references:{value:42,updatedAt:1000},words:{value:0,updatedAt:1000}};
  const r=C.applyManualStatistics(automatic,manual);
  assert.equal(r.references,42);assert.equal(r.words,0);assert.equal(automatic.references,null);assert.equal(automatic.words,123);
  assert.equal(r.automaticValues.words,123);assert.equal(r.textCompleteness,'partial');
  assert.match(C.encodeColumn(r,'references'),/\|42\*\|人工值/);assert.match(C.encodeColumn(r,'words'),/\|0\*\|/);
});
test('manual values exist without PDF or text and never become fake complete coverage',()=>{
  assert.equal(C.applyManualStatistics(null),null);
  const r=C.applyManualStatistics(null,{references:{value:7,updatedAt:1000}});
  assert.equal(r.references,7);assert.equal(r.textCompleteness,'unknown');assert.match(C.encodeColumn(r,'references'),/\|7\*\|/);
});
test('manual overlay rejects unknown or malformed persisted fields',()=>{
  const r=C.applyManualStatistics({words:12},{words:{value:-2},title:{value:5},references:{value:'3'}});
  assert.equal(r.words,12);assert.deepEqual(r.manualMetrics,{});
});
test('manual markers do not affect numeric sort keys',()=>{
  const values=[100,7,12].map(n=>C.encodeColumn(C.applyManualStatistics(null,{references:{value:n}}),'references'));
  assert.deepEqual(values.sort().map(v=>Number(v.slice(0,16))),[7,12,100]);
});

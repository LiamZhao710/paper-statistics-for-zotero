const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

test('statement total includes four types, excludes definitions/proofs/remarks/assumptions', () => {
  const text = `Definition 1. A graph is connected.\nProposition 1. Every tree is connected.\nTheorem 1 (Existence). Let a solution exist.\nLemma 2.1. Let x be positive.\nCorollary A.1. All solutions converge.\nProof. This follows.\nRemark 1. Useful observation.\nAssumption 1. Smoothness holds.`;
  const r=C.StatementDetector.detect(text);
  assert.equal(r.count,4);
  assert.deepEqual(r.breakdown,{proposition:1,theorem:1,lemma:1,corollary:1});
  assert.deepEqual(r.ids,['proposition:1','theorem:1','lemma:2.1','corollary:A.1']);
});
test('statements deduplicate by type and ID, not global number, and skip prose mentions', () => {
  const text=`Theorem 01. A heading.\nTHEOREM 1: Repeated heading.\nLemma 1. A different object.\nAs shown in Proposition 9, the model works.\nTheorem 8 shows the bound.\nLemma 7 is applicable.\nCorollary 6 follows from the result.\nProposition 5 states that this works.`;
  assert.deepEqual(C.StatementDetector.detect(text).ids,['theorem:1','lemma:1']);
});
test('unnumbered and Chinese theorem-like headings are supported', () => {
  const text=`Theorem: Let x be positive.\nLemma (Convergence). The sequence converges.\n命题 2. 结论成立。\n定理 3. 存在唯一解。\n引理 4. 函数连续。\n推论 5. 极限存在。\n定义 6. 这是定义。`;
  const r=C.StatementDetector.detect(text);
  assert.equal(r.count,6);assert.equal(r.breakdown.theorem,2);assert.equal(r.breakdown.lemma,2);
});
test('structural headings skip bibliography and resume in appendix', () => {
  const text=`Theorem 1. Main result.\nReferences\nTheorem 2. A book title.\nAlgorithm 99. A paper title.\nx = y (99)\nAppendix A\nLemma A.1. Extra result.\nAlgorithm A.1. Extra method.\ny = z (A.1)`;
  assert.equal(C.StatementDetector.detect(text).count,2);
  assert.deepEqual(C.AlgorithmDetector.detect(text).ids,['A.1']);
  assert.deepEqual(C.EquationDetector.detect(text).ids,['A.1']);
});
test('algorithms deduplicate numbered captions and support Roman and separate-line titles', () => {
  const text=`Algorithm 1: Main method\nALGORITHM I. Same method repeated\nAlgorithm II\nITERATIVE SOLVER\nAlgorithm A.1. Appendix method\nThe algorithm terminates.\nSee Algorithm 8 for details.\nAlgorithm 9 is used in our experiments.\nAlgorithm: Unnumbered solver`;
  const r=C.AlgorithmDetector.detect(text);
  assert.equal(r.count,4);assert.deepEqual(r.ids.slice(0,3),['1','2','A.1']);
});
test('numbered display equations support sections, appendix labels and subequations', () => {
  const text=`x = y + 1  (1)\nz = 2*x (2a)\nz = 3*x (2b)\nf(x) ≤ 1 (A.1)\ny ∈ R (3.1)\nx = y + 1 (01)\n(4) a = b`;
  assert.deepEqual(C.EquationDetector.detect(text).ids,['1','2A','2B','3.1','4','A.1']);
});
test('equation number on separate line needs adjacent mathematical evidence', () => {
  const text=`f(x) =\nx + y\n(1)\n\n(2)\na = b\n\nThis is an ordinary list\n(3)\nThis paragraph is plain text.`;
  assert.deepEqual(C.EquationDetector.detect(text).ids,['1','2']);
});
test('equation detector excludes prose references, years, captions, lists and unnumbered math', () => {
  const text=`See Eq. (1)\nAs shown in (2)\nWe use x = y in (3)\nThe condition x = y is used (4)\nFigure 1. Error = 0 (5)\nTable 1. Value = 1 (6)\nAlgorithm 1: Set x = y (7)\nSmith (2026)\n(8)\nPlain description\nx = y + z`;
  assert.deepEqual(C.EquationDetector.detect(text).ids,[]);
});
test('equation evidence does not cross page or empty-paragraph boundaries', () => {
  assert.equal(C.EquationDetector.detect('x = y\f(1)').count,0);
  assert.equal(C.EquationDetector.detect('x = y\n\n(1)').count,0);
});
test('new metrics are null for unreadable PDFs and counted for pure numerical equations', () => {
  const empty=C.analyze('');
  for (const metric of ['statements','algorithms','equations']) assert.equal(empty[metric],null);
  assert.equal(C.analyze('1 + 2 = 3 (1)').equations,1);
  assert.equal(C.analyze('1 + 2 = 3 (1)').noExtractableText,false);
  const noStructures=C.analyze('This is ordinary prose.');
  assert.equal(noStructures.statements,0);assert.equal(noStructures.algorithms,0);assert.equal(noStructures.equations,0);
});
test('new metrics retain numeric sorting and partial coverage indicators', () => {
  for (const metric of ['statements','algorithms','equations']) {
    const records=[100,7,12].map(n=>C.encodeColumn({[metric]:n,textCompleteness:'partial',indexedPages:1,totalPages:3},metric));
    assert.deepEqual(records.sort().map(x=>Number(x.slice(0,16))),[7,12,100]);
    assert.match(records[0],/\|~7\|Partial text/);
  }
  assert.match(C.encodeColumn({equations:2,textCompleteness:'complete'},'equations'),/Numbered display equations only/);
  assert.match(C.encodeColumn({statements:2,textCompleteness:'complete'},'statements'),/Definition excluded/);
});
test('version 0.1 algorithm caches are invalidated for structural metrics', () => {
  const attachment={id:1,key:'ABC',libraryID:1},stat={size:10,lastModified:20},options={};
  const old={attachmentID:1,attachmentKey:'ABC',libraryID:1,fileSize:10,fileMTime:20,algorithmVersion:1,settingsKey:C.settingsKey(options)};
  assert.ok(!C.cacheValid(old,attachment,stat,options));
  assert.ok(C.cacheValid({...old,algorithmVersion:C.ALGORITHM_VERSION},attachment,stat,options));
});

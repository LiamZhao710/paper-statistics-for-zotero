/* Read-only local audit. No PDF/fulltext content is copied or transmitted. */
const fs=require('node:fs'),path=require('node:path');
const C=require('../src/core.js');
const prefsPath=process.argv[2];
if(!prefsPath)throw Error('Usage: node scripts/audit-reference-recovery.cjs path/to/Zotero/profile/prefs.js');
const prefs=fs.readFileSync(prefsPath,'utf8');
const match=/user_pref\("extensions\.zotero\.dataDir",\s*("(?:\\.|[^"\\])*")\)/.exec(prefs);
if(!match)throw Error('No explicit Zotero dataDir preference found; audit stopped');
const dataDir=JSON.parse(match[1]);
const cache=JSON.parse(fs.readFileSync(path.join(dataDir,'paper-statistics/cache-v1.json'),'utf8')).attachments;
const summary={readOnly:true,scope:'Existing local full-text caches only; candidate counts are not manual ground truth',
 totalCachedRecords:Object.keys(cache).length,olderDisabledResults:0,unknownCurrentRecords:0,fulltextCachesChecked:0,
 recoveredNumbered:0,recoveredEstimates:0,stillUnknown:0,previouslyKnownChecked:0,previouslyKnownChanged:0};
for(const record of Object.values(cache)){
 if(record.referenceReason==='Disabled (experimental)'){summary.olderDisabledResults++;continue;}
 if(record.algorithmVersion!==3)continue;
 const missing=record.references===null;
 if(missing)summary.unknownCurrentRecords++;
 const file=path.join(dataDir,'storage',record.attachmentKey,'.zotero-ft-cache');
 if(!fs.existsSync(file))continue;
 const text=fs.readFileSync(file,'utf8');
 const result=C.ReferencesDetector.detect(text);
 if(!missing){summary.previouslyKnownChecked++;if(result.count!==record.references)summary.previouslyKnownChanged++;continue;}
 summary.fulltextCachesChecked++;
 if(result.count===null)summary.stillUnknown++;
 else if(result.confidence==='estimated')summary.recoveredEstimates++;
 else summary.recoveredNumbered++;
}
fs.mkdirSync(path.join(__dirname,'../reports'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'../reports/reference-recovery-audit.json'),JSON.stringify(summary,null,2));
process.stdout.write(JSON.stringify(summary,null,2)+'\n');

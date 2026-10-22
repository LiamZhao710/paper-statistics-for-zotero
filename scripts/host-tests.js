/* Test-only helper add-on. Installed only into tests/host/profile. */
function install() {}
function uninstall() {}
function shutdown() {}
var started = false;
function startup() {
  // Do not hold Zotero's plugin startup sequence open while waiting for UI.
  setTimeout(() => run().catch(fatal), 2500);
}
function onMainWindowLoad() { if (!started) setTimeout(() => run().catch(fatal), 500); }
function onMainWindowUnload() {}
async function fatal(e) {
  const root = Services.prefs.getStringPref('paperstats.testRoot');
  await IOUtils.writeUTF8(PathUtils.join(root, 'host-report.json'), JSON.stringify({ error:String(e), stack:e.stack },null,2));
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
}
async function run() {
  if (started) return; started = true;
  const root = Services.prefs.getStringPref('paperstats.testRoot');
    const report = { host:Zotero.version, startedAt:new Date().toISOString(), checks:[] };
  const check = (name, condition, details) => {
    report.checks.push({name,passed:!!condition,details});
    if (!condition) throw Error('Failed: '+name+' '+JSON.stringify(details));
  };
  const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
  try {
    await Zotero.initializationPromise;
    check('isolated data directory', PathUtils.normalize(Zotero.DataDirectory.dir) === PathUtils.normalize(PathUtils.join(root,'data')), Zotero.DataDirectory.dir);
    const { AddonManager }=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addon=await AddonManager.getAddonByID('paper-statistics@local.zotero');
    if (addon?.userDisabled) await addon.enable();
    for (let i=0;i<80 && (!Zotero.PaperStatistics || !Zotero.getMainWindow()?.ZoteroPane?.itemsView);i++) await sleep(250);
    const api=Zotero.PaperStatistics;
    check('real XPI bootstrap loaded',!!api);
    check('XPI active',addon?.isActive,addon?.getResourceURI().spec);
    report.pluginVersion=addon.version;
    const installedBytes=await IOUtils.read(PathUtils.join(root,'profile','extensions','paper-statistics@local.zotero.xpi'));
    const hash=Cc['@mozilla.org/security/hash;1'].createInstance(Ci.nsICryptoHash);
    hash.init(hash.SHA256);hash.update(installedBytes,installedBytes.length);
    report.testedXpiSHA256=[...hash.finish(false)].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');
    api.setVisibleMetrics(['pages','words','references']);await sleep(300);
    check('compact default selection',api.columnIDs.length===3 && api.visibleMetrics().join(',')==='pages,words,references',api.columnIDs);
    check('official display preference pane',!!api.preferencePaneID && Zotero.PreferencePanes.pluginPanes.some(p=>p.id===api.preferencePaneID),api.preferencePaneID);
    api.setVisibleMetrics(['pages','words','figures','tables','statements','algorithms','equations','references']);await sleep(300);
    check('all eight metrics can be selected',api.columnIDs.length===8,api.columnIDs);
    check('official pane section',!!api.sectionID,api.sectionID);
    const parent=async title=>{
      const item=new Zotero.Item('journalArticle'); item.libraryID=Zotero.Libraries.userLibraryID;
      item.setField('title',title); item.setField('pages','123-137'); await item.saveTx(); return item;
    };
    const fixture = name=>PathUtils.join(root,'fixtures',name);
    const attach=async(item,name)=>Zotero.Attachments.importFromFile({file:fixture(name),parentItemID:item.id});
    const paper=await parent('Paper Statistics synthetic test'); const a=await attach(paper,'paper.pdf');
    // Ensure exactly one page is indexed, and verify full text extraction covers all 3.
    Zotero.Prefs.set('fulltext.pdfMaxPages',1);
    await Zotero.FullText.indexPDF(await a.getFilePathAsync(),a.id,false);
    const before=await Zotero.FullText.getPages(a.id);
    check('partial index fixture',before.indexedPages===1 && before.total===3,{indexedPages:before.indexedPages,total:before.total});
    const r=await api.request(paper,true);
    report.sample=r;
    check('actual PDF pages, not journal range',r?.pages===3,r);
    check('all-page worker extraction',r?.textCompleteness==='complete' && r.indexedPages===3,r);
    check('actual PDF captions',r?.figures===2 && r.tables===2,{figures:r?.figureIDs,tables:r?.tableIDs});
    check('actual PDF word count',r?.words===43,r?.words);
    check('numbered PDF references enabled',r?.references===3 && r.referenceConfidence==='high',{count:r?.references,style:r?.referenceStyle});
    const after=await Zotero.FullText.getPages(a.id);
    check('extraction did not rewrite fulltext index',after.indexedPages===1,{indexedPages:after.indexedPages,total:after.total});
    // Use the host collation, exactly as ItemTree's comparator does.
    const collation=Zotero.getLocaleCollation();
    const key=api.columnIDs.find(k=>k.endsWith('-words'));
    const provider=Zotero.ItemTreeManager.getCustomColumns('main').find(c=>c.dataKey===key);
    check('registered provider data',provider?.dataProvider(paper,key).includes('|'),key);
    const sortKeys=[100,12,7].map(n=>String(n).padStart(16,'0')+'|'+n);
    sortKeys.sort((a,b)=>collation.compareString(1,a,b));
    check('host numeric sorting',sortKeys.map(s=>Number(s.slice(0,16))).join(',')==='7,12,100',sortKeys);
    const noPDF=await parent('No PDF'); await api.request(noPDF);
    check('no PDF stays unknown',api.dataProvider(noPDF,'pages')==='');
    const mathPaper=await parent('Paper Statistics mathematical structures');await attach(mathPaper,'structures.pdf');
    const sr=await api.request(mathPaper,true);report.structureSample=sr;
    check('actual PDF statement count excludes definitions and references',sr?.statements===4,sr?.statementIDs);
    check('actual PDF statement breakdown',sr?.statementCounts?.proposition===1 && sr.statementCounts.theorem===1 && sr.statementCounts.lemma===1 && sr.statementCounts.corollary===1,sr?.statementCounts);
    check('actual PDF algorithm captions deduplicate Roman and Arabic',sr?.algorithms===2,sr?.algorithmIDs);
    check('actual PDF numbered equations',sr?.equations===4,sr?.equationIDs);
    for(const metric of ['statements','algorithms','equations'])check('live column provider '+metric,!!api.dataProvider(mathPaper,metric),api.dataProvider(mathPaper,metric));
    const authorPaper=await parent('Paper Statistics author-year bibliography');await attach(authorPaper,'author-year.pdf');
    const ar=await api.request(authorPaper,true);report.authorYearSample=ar;
    check('actual PDF author-year references estimated',ar?.references===3 && ar.referenceConfidence==='estimated',ar);
    check('author-year column marks estimate despite complete extraction',api.dataProvider(authorPaper,'references').includes('|~3|'),api.dataProvider(authorPaper,'references'));
    const blank=await parent('Blank PDF');await attach(blank,'blank.pdf');const br=await api.request(blank,true);
    check('blank PDF pages, unknown words',br?.pages===2 && br.words===null && br.figures===null,br);
    const bad=await parent('Corrupt PDF');await attach(bad,'corrupt.pdf');const badResult=await api.request(bad,true);
    check('corrupt PDF does not become zero',badResult?.pages==null && badResult?.words==null,badResult);
    // Replace the PDF on disk without any Zotero metadata change.
    const originalPath=await a.getFilePathAsync();
    // A complete old cache can have a timestamp newer than a replacement PDF.
    // The plugin must honor its changed-file fingerprint, not reuse stale text.
    await Zotero.FullText.indexPDF(originalPath,a.id,true);
    const fullIndex=await Zotero.FullText.getPages(a.id);
    check('complete stale-cache replacement fixture',fullIndex.indexedPages===3 && fullIndex.total===3,{indexedPages:fullIndex.indexedPages,total:fullIndex.total});
    await IOUtils.copy(fixture('replacement.pdf'),originalPath);
    const replaced=await api.request(paper);
    check('external replacement invalidates cache',replaced?.pages===1 && replaced.figureIDs.join(',')==='7',replaced);
    // Pane rendering and actual tree provider/renderCell hooks in a live window.
    const win=Zotero.getMainWindow();
    await win.ZoteroPane.selectItem(paper.id);await sleep(1200);
    const pane=[...win.document.querySelectorAll('item-pane-custom-section')].find(el=>el.dataset.pane===api.sectionID);
    if(pane){pane.open=true;pane.scrollIntoView({block:'center'});}
    await sleep(800);
    const cells=[...win.document.querySelectorAll('[data-pane]')].filter(el=>el.dataset.pane===api.sectionID);
    report.paneDOMMatches=cells.length;
    check('live pane rendered',cells.some(el=>el.textContent.includes('Analyzed PDF')),{text:cells.map(el=>el.textContent.slice(0,100)),pane:pane?{initialized:pane.initialized,hidden:pane.hidden,skipRender:pane.skipRender,itemID:pane.item?.id,open:pane.open,html:pane.outerHTML.slice(0,3000)}:null});
    await win.ZoteroPane.selectItem(mathPaper.id);await sleep(600);
    const mathPane=[...win.document.querySelectorAll('item-pane-custom-section')].find(el=>el.dataset.pane===api.sectionID);
    if(mathPane){mathPane.open=true;mathPane.scrollIntoView({block:'center'});}await sleep(500);
    check('new metrics and scope rendered in pane',mathPane?.textContent.includes('Statements: 4') && mathPane.textContent.includes('Algorithms: 2') && mathPane.textContent.includes('Numbered Equations: 4') && mathPane.textContent.includes('Definitions excluded.'),mathPane?.textContent.slice(0,1800));
    const beforeDisplay=sr.calculatedAt;
    api.setVisibleMetrics(['references']);await sleep(500);
    check('unchecked columns unregistered',api.columnIDs.length===1 && Zotero.ItemTreeManager.getCustomColumns('main').filter(c=>c.pluginID==='paper-statistics@local.zotero').length===1,api.columnIDs);
    check('pane shows only selected metric',[...mathPane.querySelectorAll('[data-statistic]')].map(el=>el.dataset.statistic).join(',')==='references');
    check('details start collapsed',!mathPane.querySelector('details[data-paperstats-details="evidence"]')?.open);
    const displaySettings=mathPane.querySelector('details[data-paperstats-details="settings"]');displaySettings.open=true;
    const pagesCheckbox=displaySettings.querySelector('input[data-metric="pages"]');pagesCheckbox.checked=true;
    pagesCheckbox.dispatchEvent(new win.Event('change',{bubbles:true}));await sleep(500);
    check('pane checkbox updates columns and persists preference',api.columnIDs.length===2 && Zotero.Prefs.get('extensions.paperstatistics.show.pages',true)===true);
    check('checkbox group remains open',!!mathPane.querySelector('details[data-paperstats-details="settings"]')?.open);
    check('display changes do not reparse PDF',api.getRow(mathPaper.id).result.calculatedAt===beforeDisplay);
    api.setVisibleMetrics([]);await sleep(400);
    check('hide all removes all plugin columns',api.columnIDs.length===0);
    check('hide all retains accessible settings',mathPane.querySelectorAll('[data-statistic]').length===0 && mathPane.querySelectorAll('input[data-metric]').length===8);
    api.setVisibleMetrics(['pages','words','references']);await sleep(300);
    // Open the actual preferences UI and exercise Zotero's preference binding.
    const prefWindow=Zotero.Utilities.Internal.openPreferences(api.preferencePaneID);
    for(let i=0;i<80 && !prefWindow.document.querySelector('[preference="extensions.paperstatistics.show.figures"]');i++)await sleep(100);
    const figuresPreference=prefWindow.document.querySelector('[preference="extensions.paperstatistics.show.figures"]');
    check('actual settings panel rendered eight checkboxes',prefWindow.document.querySelectorAll('[preference^="extensions.paperstatistics.show."]').length===8);
    figuresPreference.checked=true;figuresPreference.dispatchEvent(new prefWindow.Event('change',{bubbles:true}));await sleep(400);
    check('preferences checkbox controls visible metrics',api.visibleMetrics().includes('figures') && api.columnIDs.length===4);
    figuresPreference.checked=false;figuresPreference.dispatchEvent(new prefWindow.Event('change',{bubbles:true}));await sleep(300);prefWindow.close();
    await win.ZoteroPane.selectItem(authorPaper.id);await sleep(600);
    const authorPane=[...win.document.querySelectorAll('item-pane-custom-section')].find(el=>el.dataset.pane===api.sectionID);
    if(authorPane){authorPane.open=true;authorPane.scrollIntoView({block:'center'});}await sleep(300);
    check('author-year estimated reference count visible in pane',authorPane?.querySelector('[data-statistic="references"]')?.textContent.includes('~3'));
    const column=Zotero.ItemTreeManager.getCustomColumns('main').find(c=>c.dataKey===key);
    const cell=column.renderCell(0,api.dataProvider(paper,'words'),{className:'test'},false,win.document);
    check('real document cell rendering',!!cell.textContent && !cell.textContent.startsWith('0000'),cell.textContent);
    // Cancel a batch immediately; submitted work is discarded / remaining tasks are skipped.
    const batchPromise=api.startBatch([paper,blank,noPDF],true);api.cancelBatch();const summary=await batchPromise;
    check('batch cancellation',summary.cancelled && summary.done<summary.total,summary);
    await api.whenIdle();
    // Disable through the real AddonManager; this exercises bootstrap shutdown and cleanup.
    await addon.disable();
    for(let i=0;i<80 && Zotero.PaperStatistics;i++)await sleep(100);
    check('disable removed API',!Zotero.PaperStatistics);
    check('disable removed columns',!Zotero.ItemTreeManager.getCustomColumns('main').some(c=>c.pluginID==='paper-statistics@local.zotero'));
    await addon.enable();
    for(let i=0;i<40 && !Zotero.PaperStatistics;i++)await sleep(100);
    check('enable restored plugin',!!Zotero.PaperStatistics);
    check('display selection survives plugin restart',Zotero.PaperStatistics.visibleMetrics().join(',')==='pages,words,references' && Zotero.PaperStatistics.columnIDs.length===3,Zotero.PaperStatistics.visibleMetrics());
    const restored=await Zotero.PaperStatistics.request(paper);
    check('persistent cache reload',restored?.calculatedAt===replaced.calculatedAt,{restored:restored?.calculatedAt,old:replaced.calculatedAt});
    // Let manager-generated row/column refreshes finish before closing the host.
    await Zotero.DB.waitForTransaction();
    await sleep(1000);
    report.passed=report.checks.every(c=>c.passed);
  }
  catch(e) { report.error=String(e); report.stack=e.stack; report.passed=false; }
  report.finishedAt=new Date().toISOString();
  await IOUtils.writeUTF8(PathUtils.join(root,'host-report.json'),JSON.stringify(report,null,2));
  Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
}

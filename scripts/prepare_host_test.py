"""Install production XPI + test-only harness into a fresh WORKSPACE profile."""
from pathlib import Path
import json,shutil,zipfile

root=Path(__file__).resolve().parents[1]
host=root/'tests'/'host'
if (host/'profile').exists():
    raise SystemExit('Refusing to overwrite an existing test profile. Use a new directory or archive it first.')
profile=host/'profile';data=host/'data';extensions=profile/'extensions'
extensions.mkdir(parents=True);data.mkdir()
shutil.copytree(root/'tests'/'fixtures',host/'fixtures',dirs_exist_ok=True)
shutil.copy2(root/'dist'/'paper-statistics-0.1.0.xpi',extensions/'paper-statistics@local.zotero.xpi')
manifest={'manifest_version':2,'name':'Paper Statistics ISOLATED Test Harness','version':'1.0','applications':{'zotero':{'id':'paperstats-test@local.zotero','update_url':'https://127.0.0.1:0/paperstats-test/no-updates.json','strict_min_version':'10.0','strict_max_version':'10.0.*'}}}
with zipfile.ZipFile(extensions/'paperstats-test@local.zotero.xpi','w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json',json.dumps(manifest));z.write(root/'scripts'/'host-tests.js','bootstrap.js')
prefs={
    'extensions.zotero.dataDir':str(data),'extensions.zotero.useDataDir':True,
    'extensions.zotero.firstRun':False,'extensions.zotero.firstRun2':False,
    'extensions.zotero.httpServer.enabled':False,'extensions.zotero.sync.autoSync':False,
    'extensions.zotero.automaticScraperUpdates':False,'extensions.zotero.reportTranslationFailure':False,
    'extensions.autoDisableScopes':0,'extensions.enabledScopes':15,'extensions.startupScanScopes':15,
    'app.update.auto':False,'app.update.enabled':False,'extensions.update.enabled':False,
    'browser.shell.checkDefaultBrowser':False,'paperstats.testRoot':str(host),
    'extensions.zoteroWinWordIntegration.skipInstallation':True,
    'extensions.zoteroOpenOfficeIntegration.skipInstallation':True,
}
(profile/'user.js').write_text(''.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});\n' for k,v in prefs.items()),encoding='utf-8')
print(json.dumps({'profile':str(profile),'data':str(data),'report':str(host/'host-report.json')},indent=2))

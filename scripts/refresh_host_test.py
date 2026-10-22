"""Refresh the two test add-ons in the known isolated workspace profile only."""
import pathlib,shutil,zipfile,json
root=pathlib.Path(__file__).resolve().parents[1]
host=root/'tests'/'host';profile=host/'profile';ext=profile/'extensions'
assert (profile/'user.js').is_file(), 'Run prepare_host_test.py first'
ext.mkdir(exist_ok=True)
version=json.loads((root/'src/manifest.json').read_text(encoding='utf-8'))['version']
shutil.copy2(root/'dist'/f'paper-statistics-{version}.xpi',ext/'paper-statistics@local.zotero.xpi')
shutil.copytree(root/'tests/fixtures',host/'fixtures',dirs_exist_ok=True)
manifest={'manifest_version':2,'name':'Paper Statistics ISOLATED Test Harness','version':'1.0','applications':{'zotero':{'id':'paperstats-test@local.zotero','update_url':'https://127.0.0.1:0/paperstats-test/no-updates.json','strict_min_version':'10.0','strict_max_version':'10.0.*'}}}
with zipfile.ZipFile(ext/'paperstats-test@local.zotero.xpi','w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json',json.dumps(manifest));z.write(root/'scripts/host-tests.js','bootstrap.js')
p=profile/'user.js'
prefs={'extensions.logging.enabled':True,'browser.dom.window.dump.enabled':True,'extensions.zoteroWinWordIntegration.skipInstallation':True,'extensions.zoteroOpenOfficeIntegration.skipInstallation':True,'extensions.lastAppBuildId':'force-rescan','extensions.lastAppVersion':'0'}
p.write_text(p.read_text(encoding='utf-8')+''.join(f'user_pref({json.dumps(k)},{json.dumps(v)});\n' for k,v in prefs.items()),encoding='utf-8')
report=host/'host-report.json'
if report.exists():
    import time
    shutil.copy2(report,host/f'host-report-{time.time_ns()}.json')
    report.unlink()

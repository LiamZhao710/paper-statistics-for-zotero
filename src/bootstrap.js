/* SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (c) 2026 Paper Statistics contributors. See LICENSE and NOTICE.
 */
/* global Zotero, Services, ChromeUtils */
var chromeHandle;
var pluginScope;

function install() {}
function uninstall() {}

async function startup({ id, rootURI }) {
  await Zotero.initializationPromise;
  const aom = Cc["@mozilla.org/addons/addon-manager-startup;1"]
    .getService(Ci.amIAddonManagerStartup);
  chromeHandle = aom.registerChrome(Services.io.newURI(rootURI + "manifest.json"), [
    ["content", "paperstatistics", rootURI]
  ]);
  pluginScope = { Zotero, Services, ChromeUtils, IOUtils, PathUtils, Worker,
    setTimeout, clearTimeout, setInterval, clearInterval };
  Services.scriptloader.loadSubScript(rootURI + "core.js", pluginScope);
  Services.scriptloader.loadSubScript(rootURI + "main.js", pluginScope);
  try {
    await pluginScope.PaperStatistics.start({ id, rootURI });
  }
  catch (e) {
    await pluginScope.PaperStatistics.stop();
    chromeHandle.destruct();
    throw e;
  }
}

function onMainWindowLoad({ window }) {
  pluginScope?.PaperStatistics.loadWindow(window);
}
function onMainWindowUnload({ window }) {
  pluginScope?.PaperStatistics.unloadWindow(window);
}
async function shutdown(data, reason) {
  await pluginScope?.PaperStatistics.stop({ appShutdown: reason === 2 });
  pluginScope = null;
  chromeHandle?.destruct();
  chromeHandle = null;
}

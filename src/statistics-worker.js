/* PDF extraction belongs to Zotero.PDFWorker; text analysis runs in this worker. */
importScripts("core.js");
onmessage = function ({ data }) {
  try { postMessage({ id: data.id, result: PaperStatsCore.analyze(data.text, data.options) }); }
  catch (e) { postMessage({ id: data.id, error: String(e) }); }
};

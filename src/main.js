/* global PaperStatsCore, Zotero, IOUtils, PathUtils, Services, Worker */
var PaperStatistics = (() => {
  "use strict";
  const C = PaperStatsCore;
  const PREF = "extensions.paperstatistics.";
  const METRICS = C.METRICS;
  const LABELS = { pages: "PDF 页数", words: "词数", figures: "图数", tables: "表数",
    statements: "命题/定理类", algorithms: "算法数", equations: "编号公式数", references: "参考文献数" };
  let pluginID, rootURI, cachePath, worker, queue, observer, timer, saveTimer, refreshTimer;
  let alive = false, serial = 0, cache = {}, batch = null, diskWrites = Promise.resolve();
  let manualPath, manualValues = {}, manualWrites = Promise.resolve(), manualStoreHealthy = true;
  const rows = new Map(), tracked = new Set(), epochs = new Map(), replies = new Map();
  const columns = [], menus = [], paneHooks = new Map(), dirtyRows = new Set(), prefObservers = [];
  const columnMetrics = new Map();
  let preferencePaneID;
  const windows = new Set();
  const log = e => Zotero.logError(e);
  const options = () => ({
    includeSupplementary: Zotero.Prefs.get(PREF + "includeSupplementary", true) !== false,
    references: true,
    authorYearReferences: Zotero.Prefs.get(PREF + "authorYearReferences", true) !== false
  });
  function visibleMetrics() {
    return Object.keys(METRICS).filter(metric => {
      const value = Zotero.Prefs.get(PREF + "show." + metric, true);
      return value === undefined ? C.DEFAULT_METRICS.includes(metric) : !!value;
    });
  }
  function setVisibleMetrics(metrics) {
    if (!Array.isArray(metrics) || metrics.some(m => !Object.hasOwn(METRICS, m))) throw new Error("Unknown statistic selection");
    const selected = new Set(metrics);
    for (const metric of Object.keys(METRICS)) Zotero.Prefs.set(PREF + "show." + metric, selected.has(metric), true);
  }
  function registerSelectedColumns() {
    const selected = new Set(visibleMetrics());
    for (const [metric, key] of columnMetrics) {
      if (selected.has(metric)) continue;
      Zotero.ItemTreeManager.unregisterColumn(key);
      columnMetrics.delete(metric); columns.splice(columns.indexOf(key), 1);
    }
    for (const metric of selected) {
      if (columnMetrics.has(metric)) continue;
      // A fresh namespace avoids legacy hidden-column preferences on upgrade.
      // Visibility is owned by our checkboxes; unselected columns are unregistered.
      const key = Zotero.ItemTreeManager.registerColumn({
        pluginID, dataKey: "selected-" + metric, label: METRICS[metric], hidden: false,
        showInColumnPicker: false, width: metric === "equations" ? "140" : "90",
        zoteroPersist: ["width", "sortDirection"],
        dataProvider: item => dataProvider(item, metric),
        renderCell: (index, data, column, isFirstColumn, doc) => {
          const span = doc.createElement("span"); span.className = "cell " + column.className;
          const [, display, tooltip] = String(data || "").split("|");
          span.textContent = display || ""; span.title = tooltip || "Pending or unavailable";
          span.style.fontVariantNumeric = "tabular-nums"; return span;
        }
      });
      if (!key) throw new Error("Column registration failed: " + metric);
      columnMetrics.set(metric, key); columns.push(key);
    }
    for (const hook of paneHooks.values()) hook.refresh();
  }
  const identity = a => `${a.libraryID}/${a.key}`;
  const cancelled = token => !alive || token?.cancelled;
  function getEffectiveRecord(item) {
    return C.applyManualStatistics(rows.get(item.id)?.result, manualValues[identity(item)]);
  }
  function setManualValues(item, values) {
    if (!alive || !item || item.deleted || !(item.isRegularItem() || item.isPDFAttachment())) throw new Error("请选择论文或 PDF 附件。");
    if (!manualStoreHealthy) throw new Error("手动数据文件无法读取；为保护原数据，未执行覆盖写入。");
    const parsed = {};
    for (const [metric, value] of Object.entries(values)) {
      if (!Object.hasOwn(METRICS, metric)) throw new Error("Unknown statistic: " + metric);
      parsed[metric] = C.parseManualValue(value);
    }
    const key = identity(item);
    manualWrites = manualWrites.catch(log).then(async () => {
      const entries = { ...(manualValues[key] || {}) };
      for (const [metric, value] of Object.entries(parsed)) {
        if (value === null) delete entries[metric];
        else entries[metric] = { value, updatedAt: Date.now() };
      }
      const next = { ...manualValues };
      if (Object.keys(entries).length) next[key] = entries; else delete next[key];
      await IOUtils.writeUTF8(manualPath, JSON.stringify({ schemaVersion: 1, items: next }), { tmpPath: manualPath + ".tmp" });
      manualValues = next;refresh(item.id);
    });
    return manualWrites;
  }
  function clearManualValues(item) {
    return setManualValues(item, Object.fromEntries(Object.keys(METRICS).map(metric => [metric, null])));
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    if (alive) saveTimer = setTimeout(() => flush().catch(log), 700);
  }
  function flush() {
    clearTimeout(saveTimer);
    const json = JSON.stringify({ schemaVersion: 1, attachments: cache });
    diskWrites = diskWrites.catch(log).then(() => IOUtils.writeUTF8(cachePath, json, { tmpPath: cachePath + ".tmp" }));
    return diskWrites;
  }
  function refresh(id) {
    dirtyRows.add(id);
    if (refreshTimer || !alive) return;
    refreshTimer = setTimeout(async () => {
      refreshTimer = null;
      const ids = [...dirtyRows]; dirtyRows.clear();
      // 'refresh' clears just these row caches, and makes no bibliographic edits.
      await Zotero.Notifier.trigger("refresh", "item", ids, { paperStatistics: true });
      // Refresh the active sort using the public tree method, coalesced per batch of results.
      for (const win of windows) {
        const view = win.ZoteroPane?.itemsView;
        if (view && columns.includes(view.getSortField?.())) await view.sort();
      }
      for (const { itemID, refresh: fn } of paneHooks.values()) if (ids.includes(itemID)) fn();
    }, 250);
  }

  function analyzeInWorker(text, opts) {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      replies.set(id, { resolve, reject });
      worker.postMessage({ id, text, options: opts });
    });
  }

  const TextStatisticsService = {
    async extract(attachment, stat, force) {
      let meta = null, text = "", source = "none", warning = null;
      try { meta = await Zotero.FullText.getPages(attachment.id); } catch (e) { log(e); }
      // The actual API returns {indexedPages, total}, not {totalPages}.
      let totalPages = Number(meta?.total) || null;
      let indexedPages = Number(meta?.indexedPages) || 0;
      let complete = false;
      try {
        const file = Zotero.FullText.getItemCacheFile(attachment).path;
        const cacheStat = await IOUtils.stat(file);
        if (cacheStat.lastModified >= stat.lastModified) {
          text = await IOUtils.readUTF8(file);
          source = "zotero-fulltext-cache";
          complete = totalPages > 0 && indexedPages === totalPages;
        }
        else { totalPages = null; indexedPages = 0; }
      }
      catch (_) { totalPages = null; indexedPages = 0; /* No fresh readable cache: extract below. */ }
      if (force || !complete || !text) {
        try {
          // null explicitly means ALL pages; this does not index/write the library.
          const result = await Zotero.PDFWorker.getFullText(attachment.id, null, false);
          if (typeof result?.text === "string") {
            text = result.text;
            totalPages = Number(result.totalPages) || totalPages;
            indexedPages = Number(result.extractedPages) || 0;
            complete = totalPages > 0 && indexedPages === totalPages;
            source = "zotero-pdf-worker";
          }
        }
        catch (e) { warning = String(e); log(e); }
      }
      return { text, source, warning, totalPages, indexedPages,
        textCompleteness: complete ? "complete" : text && totalPages && indexedPages < totalPages ? "partial" : "unknown" };
    }
  };

  const PdfStatisticsService = {
    async compute(item, force, token) {
      if (cancelled(token)) return null;
      const epoch = epochs.get(item.id) || 0;
      const attachment = await C.selectPrimaryPDF(item, id => Zotero.Items.getAsync(id));
      if (cancelled(token) || epoch !== (epochs.get(item.id) || 0)) return null;
      if (!attachment) {
        rows.set(item.id, { status: "no-pdf" }); refresh(item.id); return null;
      }
      const filePath = await attachment.getFilePathAsync();
      const stat = await IOUtils.stat(filePath);
      const key = identity(attachment), opts = options();
      let result = cache[key];
      // A replacement can preserve an older filesystem timestamp. Once our own
      // fingerprint changed, do not trust even a newer-looking Zotero text cache.
      const changedFile = !!result && (result.fileMTime !== stat.lastModified || result.fileSize !== stat.size);
      const retryIncomplete = result?.textCompleteness !== "complete" && Date.now() - (result?.calculatedAt || 0) > 300000;
      if (force || retryIncomplete || !C.cacheValid(result, attachment, stat, opts)) {
        // Never display statistics for a superseded file while the worker is busy.
        rows.delete(item.id); refresh(item.id);
        const extracted = await TextStatisticsService.extract(attachment, stat, force || changedFile);
        if (cancelled(token)) return null;
        const counts = await analyzeInWorker(extracted.text, opts);
        if (cancelled(token)) return null;
        const afterStat = await IOUtils.stat(filePath);
        if (afterStat.size !== stat.size || afterStat.lastModified !== stat.lastModified) {
          throw new Error("PDF changed during extraction; retry on the next validation");
        }
        result = { attachmentID: attachment.id, attachmentKey: attachment.key, libraryID: attachment.libraryID,
          pages: extracted.totalPages, ...counts, textCompleteness: extracted.textCompleteness,
          indexedPages: extracted.indexedPages, totalPages: extracted.totalPages,
          source: extracted.source, warning: extracted.warning,
          fileMTime: stat.lastModified, fileSize: stat.size, filePath,
          filename: PathUtils.filename(filePath), algorithmVersion: C.ALGORITHM_VERSION,
          settingsKey: C.settingsKey(opts), calculatedAt: Date.now() };
        // An empty/scanned PDF has a page count but no measurable text statistics.
        if (counts.noExtractableText) result.warning = [extracted.warning, "No extractable text. OCR is not provided."].filter(Boolean).join(" ");
        if (epoch !== (epochs.get(item.id) || 0) || cancelled(token)) return null;
        cache[key] = result; scheduleSave();
      }
      if (epoch !== (epochs.get(item.id) || 0) || cancelled(token)) return null;
      rows.set(item.id, { status: "ready", result, attachmentID: attachment.id });
      // Attachment columns and attachment pane use the same validated result.
      rows.set(attachment.id, { status: "ready", result, attachmentID: attachment.id });
      refresh(item.id); refresh(attachment.id);
      return result;
    }
  };

  function request(item, force = false, token = null) {
    if (!alive || !item || !(item.isRegularItem() || item.isPDFAttachment())) return Promise.resolve(null);
    tracked.add(item.id);
    if (force) {
      epochs.set(item.id, (epochs.get(item.id) || 0) + 1);
      rows.delete(item.id);
    }
    // Force requests queue behind an in-flight request; never silently de-duplicate them away.
    const key = force ? `${item.id}:force:${epochs.get(item.id)}` : String(item.id);
    return queue.add(key, async () => {
      try { return await PdfStatisticsService.compute(item, force, token); }
      catch (e) {
        log(e);
        if (!cancelled(token)) { rows.set(item.id, { status: "error", error: String(e) }); refresh(item.id); }
        return null;
      }
    }, token);
  }
  function dataProvider(item, metric) {
    if (!(item.isRegularItem() || item.isPDFAttachment())) return "";
    if (!rows.has(item.id) && !queue.pending.has(String(item.id))) void request(item);
    return C.encodeColumn(getEffectiveRecord(item), metric);
  }

  function renderPane({ body, item, doc }) {
    const opened = new Set([...body.querySelectorAll("details[open]")].map(d => d.dataset.paperstatsDetails));
    const draft = body.dataset.paperstatsItem === (item && identity(item))
      ? new Map([...body.querySelectorAll('input[data-manual-metric][data-dirty="true"]')].map(input => [input.dataset.manualMetric, input.value])) : new Map();
    body.dataset.paperstatsItem = item ? identity(item) : "";
    body.replaceChildren();
    if (!item) return;
    const state = rows.get(item.id);
    const r = getEffectiveRecord(item);
    const container = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    container.style.cssText = "padding:8px;line-height:1.6;overflow-wrap:anywhere";
    let target = container;
    const append = (label, value, metric) => {
      const line = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      const strong = doc.createElementNS("http://www.w3.org/1999/xhtml", "strong");
      strong.textContent = label + ": "; line.append(strong, doc.createTextNode(String(value))); target.append(line);
      if (metric) line.dataset.statistic = metric;
      return line;
    };
    const details = (id, title) => {
      const element = doc.createElementNS("http://www.w3.org/1999/xhtml", "details");
      element.dataset.paperstatsDetails = id; element.open = opened.has(id);
      const summary = doc.createElementNS("http://www.w3.org/1999/xhtml", "summary"); summary.textContent = title;
      element.append(summary);container.append(element);return element;
    };
    const selected = visibleMetrics();
    if (r && selected.length) {
      for (const metric of selected) {
        const line = append(METRICS[metric], C.encodeColumn(r, metric).split("|")[1] || "—", metric);
        if (r.manualMetrics?.[metric]) line.append(doc.createTextNode("（人工）"));
        if (metric === "references") line.title = r.manualMetrics?.[metric] ? "人工填写值；恢复自动统计可查看检测结果" : r.referenceReason || "Reference count unavailable";
      }
      target = details("evidence", "检测明细与统计口径");
      if (Object.keys(r.manualMetrics || {}).length) append("人工覆盖", "带 * 的数值由人工填写；以下编号、分类与覆盖率仍是自动检测结果。");
      append("Text coverage", r.textCompleteness === "partial"
        ? `Partial (${r.indexedPages} / ${r.totalPages} pages extracted)` : r.textCompleteness);
      append("Analyzed PDF", r.filename || "无可用 PDF / 自动值未知");
      append("Last calculated", r.calculatedAt ? new Date(r.calculatedAt).toLocaleString() : "—");
      append("Method", "Words include captions and references; structural counts are text heuristics.");
      if (selected.includes("figures")) append("Detected figures", r.figureIDs.join(", ") || "—");
      if (selected.includes("tables")) append("Detected tables", r.tableIDs.join(", ") || "—");
      if (selected.includes("statements")) {
        if (r.statementCounts) append("Statement breakdown", `Proposition ${r.statementCounts.proposition}; Theorem ${r.statementCounts.theorem}; Lemma ${r.statementCounts.lemma}; Corollary ${r.statementCounts.corollary}. Definitions excluded.`);
        append("Detected statements", (r.statementIDs || []).join(", ") || "—");
      }
      if (selected.includes("algorithms")) append("Detected algorithms", (r.algorithmIDs || []).join(", ") || "—");
      if (selected.includes("equations")) {
        append("Detected equations", (r.equationIDs || []).join(", ") || "—");
        append("Equation scope", r.equationScope || "Numbered display equations only");
      }
      if (selected.includes("references")) {
        append("Reference method", `${r.referenceStyle || "unknown"}; ${r.referenceReason}`);
        append("Detected references", (r.referenceIDs || []).join(", ") || "—");
      }
      if (r.warning) append("Note", r.warning);
      target = container;
    }
    else append("Status", !selected.length ? "未选择统计项目，请展开显示设置勾选。" : state?.status === "no-pdf" ? "No locally available PDF" : state?.status === "error" ? state.error : "Pending…");
    const button = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
    button.textContent = "Recompute Paper Statistics";
    button.addEventListener("click", () => void startBatch([item], true)); container.append(button);
    const editor = details("manual", "手动修改统计（留空使用自动值）");
    const explanation = doc.createElementNS("http://www.w3.org/1999/xhtml", "p");
    explanation.textContent = "人工值显示 *，重新计算不会覆盖。仅作用于当前条目；更换 PDF 后请自行核对。";editor.append(explanation);
    const inputs = new Map();
    for (const metric of selected) {
      const label = doc.createElementNS("http://www.w3.org/1999/xhtml", "label");label.style.display = "block";
      const input = doc.createElementNS("http://www.w3.org/1999/xhtml", "input");
      input.type = "text";input.inputMode = "numeric";input.pattern = "[0-9]*";input.dataset.manualMetric = metric;
      input.placeholder = "自动";input.style.width = "100px";
      input.value = draft.has(metric) ? draft.get(metric) : manualValues[identity(item)]?.[metric]?.value ?? "";
      if (draft.has(metric)) input.dataset.dirty = "true";
      input.addEventListener("input", () => input.dataset.dirty = "true");
      label.append(doc.createTextNode(`${LABELS[metric]}（自动：${state?.result?.[metric] ?? "—"}） `), input);editor.append(label);inputs.set(metric, input);
    }
    const message = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");message.setAttribute("role", "status");
    const save = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");save.textContent = "保存人工值";save.dataset.manualSave = "true";
    save.disabled = !selected.length || !manualStoreHealthy;
    save.onclick = async () => {
      save.disabled = true;
      try { await setManualValues(item, Object.fromEntries([...inputs].map(([metric, input]) => [metric, input.value])));for (const input of inputs.values()) delete input.dataset.dirty;message.textContent = "已保存"; }
      catch (e) { message.textContent = String(e.message || e); }
      finally { save.disabled = !selected.length || !manualStoreHealthy; }
    };
    const reset = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");reset.textContent = "恢复全部自动统计";reset.dataset.manualReset = "true";
    reset.onclick = async () => { try { await clearManualValues(item);for (const input of inputs.values()) { input.value = "";delete input.dataset.dirty; } } catch (e) { message.textContent = String(e.message || e); } };
    editor.append(save, reset, message);
    const settings = details("settings", "显示设置（只显示勾选项）");
    for (const metric of Object.keys(METRICS)) {
      const line = doc.createElementNS("http://www.w3.org/1999/xhtml", "label");
      line.style.display = "block";
      const checkbox = doc.createElementNS("http://www.w3.org/1999/xhtml", "input"); checkbox.type = "checkbox";
      checkbox.dataset.metric = metric;checkbox.checked = selected.includes(metric);
      checkbox.addEventListener("change", () => Zotero.Prefs.set(PREF + "show." + metric, checkbox.checked, true));
      line.append(checkbox, doc.createTextNode(`${LABELS[metric]} / ${METRICS[metric]}`)); settings.append(line);
    }
    const more = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");more.textContent = "打开完整设置";
    more.onclick = () => Zotero.Utilities.Internal.openPreferences(preferencePaneID);settings.append(more);
    if (batch) {
      append("Batch", `${batch.done} / ${batch.total}, unavailable/errors ${batch.failed}${batch.cancelled ? " (cancelling)" : ""}`);
      const cancel = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
      cancel.textContent = "Cancel batch"; cancel.onclick = cancelBatch; container.append(cancel);
    }
    body.append(container);
    if (!state) void request(item);
  }

  function cancelBatch() { if (batch) batch.cancelled = true; updateProgress(); }
  function updateProgress() {
    for (const win of windows) {
      const node = win.document.getElementById("paperstats-progress");
      if (!node) continue;
      node.hidden = !batch;
      node.textContent = batch ? `Paper Statistics: ${batch.done}/${batch.total} · unavailable/errors ${batch.failed} · ${batch.cancelled ? "Cancelling…" : "Click to cancel"}` : "";
    }
    for (const hook of paneHooks.values()) hook.refresh();
  }
  async function startBatch(items, force = false) {
    if (batch) cancelBatch();
    const unique = [...new Map(items.filter(i => i.isRegularItem() || i.isPDFAttachment()).map(i => [i.id, i])).values()];
    const token = { cancelled: false, total: unique.length, done: 0, failed: 0 };
    batch = token; updateProgress();
    // Feed at most two jobs at a time; selection of 10,000 does not create 10,000 promises.
    let cursor = 0;
    const consume = async () => {
      while (cursor < unique.length && !cancelled(token)) {
        const item = unique[cursor++];
        const result = await request(item, force, token);
        token.done++; if (!result && !token.cancelled) token.failed++;
        updateProgress();
      }
    };
    await Promise.all([consume(), consume()]);
    if (batch === token) {
      batch = null; updateProgress();
      for (const hook of paneHooks.values()) hook.refresh();
    }
    return token;
  }

  function invalidate(ids) {
    for (const id of ids) {
      epochs.set(id, (epochs.get(id) || 0) + 1);
      rows.delete(id);
      refresh(id);
    }
  }
  async function notify(event, type, ids, extra) {
    if (!alive || event === "refresh" || type !== "item") return;
    if (!["add", "modify", "delete", "trash"].includes(event)) return;
    const affected = new Set(ids.map(Number));
    for (const [id, state] of rows) if (affected.has(state.attachmentID)) affected.add(id);
    for (const id of ids) {
      const item = Zotero.Items.get(Number(id));
      if (item?.parentItemID) affected.add(item.parentItemID);
    }
    // Delete both persisted results and row projections for deleted or changed attachments.
    for (const [key, record] of Object.entries(cache)) if (ids.some(id => Number(id) === record.attachmentID)) delete cache[key];
    invalidate(affected); scheduleSave();
    for (const id of affected) if (tracked.has(id)) {
      const item = await Zotero.Items.getAsync(id);
      if (item && !item.deleted) void request(item);
      else tracked.delete(id);
    }
  }

  function loadWindow(win) {
    if (!alive || windows.has(win)) return;
    windows.add(win);
    win.document.l10n?.addResourceIds(["paper-statistics.ftl"]);
    const parent = win.document.getElementById("zotero-pane");
    if (parent) {
      const node = win.document.createElementNS("http://www.w3.org/1999/xhtml", "button");
      node.id = "paperstats-progress"; node.hidden = true;
      node.style.cssText = "padding:5px;text-align:start;border:1px solid #888;background:transparent;color:inherit";
      node.onclick = cancelBatch; parent.append(node);
    }
    updateProgress();
  }
  function unloadWindow(win) {
    win.document.getElementById("paperstats-progress")?.remove();
    win.document.l10n?.removeResourceIds(["paper-statistics.ftl"]);
    windows.delete(win);
  }

  async function start(params) {
    pluginID = params.id; rootURI = params.rootURI; alive = true;
    const dir = PathUtils.join(Zotero.DataDirectory.dir, "paper-statistics");
    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
    cachePath = PathUtils.join(dir, "cache-v1.json");
    manualPath = PathUtils.join(dir, "manual-overrides-v1.json");
    try {
      if (await IOUtils.exists(manualPath)) {
        const disk = JSON.parse(await IOUtils.readUTF8(manualPath));
        if (disk.schemaVersion !== 1 || !disk.items || typeof disk.items !== "object" || Array.isArray(disk.items)) throw new Error("Invalid manual statistics store");
        manualValues = disk.items;
      }
    } catch (e) { manualStoreHealthy = false;log(e); }
    try {
      const disk = JSON.parse(await IOUtils.readUTF8(cachePath));
      if (disk.schemaVersion === 1 && disk.attachments && typeof disk.attachments === "object") cache = disk.attachments;
    } catch (e) {
      if (await IOUtils.exists(cachePath)) log(new Error("Paper Statistics: corrupt cache will be rebuilt: " + e));
    }
    queue = new C.BackgroundQueue(2);
    worker = new Worker("chrome://paperstatistics/content/statistics-worker.js");
    worker.onmessage = ({ data }) => {
      const request = replies.get(data.id); if (!request) return;
      replies.delete(data.id); data.error ? request.reject(new Error(data.error)) : request.resolve(data.result);
    };
    worker.onerror = e => {
      for (const req of replies.values()) req.reject(new Error(e.message || "Statistics worker failed"));
      replies.clear();
    };
    registerSelectedColumns();
    preferencePaneID = await Zotero.PreferencePanes.register({ pluginID, id: "paperstats-preferences",
      label: "Paper Statistics / 论文统计", src: rootURI + "preferences.xhtml", image: rootURI + "icon.svg" });
    const section = Zotero.ItemPaneManager.registerSection({
      paneID: "paperstats", pluginID,
      header: { l10nID: "paperstats-section", icon: rootURI + "icon.svg" },
      sidenav: { l10nID: "paperstats-section", icon: rootURI + "icon.svg" },
      onInit: ({ body, item, refresh }) => paneHooks.set(body, { itemID: item?.id, refresh }),
      onDestroy: ({ body }) => paneHooks.delete(body),
      onItemChange: ({ body, item, setEnabled }) => {
        if (paneHooks.has(body)) paneHooks.get(body).itemID = item?.id;
        setEnabled(!!item && (item.isRegularItem() || item.isPDFAttachment()));
      },
      onRender: renderPane
    });
    if (!section) throw new Error("Section registration failed");
    api.sectionID = section;
    const menu = Zotero.MenuManager.registerMenu({
      menuID: "paperstats", pluginID, target: "main/library/item",
      menus: [
        ...[["paperstats-compute", false], ["paperstats-recompute", true]].map(([l10nID, force]) => ({
          menuType: "menuitem", l10nID,
          onShowing: (_, context) => context.setVisible(context.items?.some(i => i.isRegularItem() || i.isPDFAttachment())),
          onCommand: (_, context) => void startBatch(context.items || [], force)
        })),
        { menuType: "menuitem", l10nID: "paperstats-cancel", onShowing: (_, context) => context.setVisible(!!batch), onCommand: cancelBatch },
        { menuType: "menuitem", l10nID: "paperstats-settings", onCommand: () => Zotero.Utilities.Internal.openPreferences(preferencePaneID) }
      ]
    });
    if (!menu) throw new Error("Menu registration failed"); menus.push(menu);
    const settingsMenu = Zotero.MenuManager.registerMenu({ menuID: "paperstats-settings", pluginID, target: "main/menubar/tools",
      menus: [{ menuType: "menuitem", l10nID: "paperstats-settings", onCommand: () => Zotero.Utilities.Internal.openPreferences(preferencePaneID) }] });
    if (settingsMenu) menus.push(settingsMenu);
    observer = Zotero.Notifier.registerObserver({ notify }, ["item"], "paper-statistics");
    for (const metric of Object.keys(METRICS)) prefObservers.push(Zotero.Prefs.registerObserver(PREF + "show." + metric, registerSelectedColumns, true));
    for (const pref of ["includeSupplementary", "authorYearReferences"]) {
      prefObservers.push(Zotero.Prefs.registerObserver(PREF + pref, () => {
        const ids = [...tracked]; invalidate(ids);
        for (const id of ids) { const item = Zotero.Items.get(id); if (item && !item.deleted) void request(item); }
      }, true));
    }
    // Validate only items touched this session, in a bounded queue. Stat detects external replacement,
    // including linked PDFs changed without a Zotero notifier. No library-wide enumeration.
    timer = setInterval(() => {
      for (const id of tracked) {
        const item = Zotero.Items.get(id);
        if (item && !item.deleted) void request(item);
      }
    }, 60000);
    for (const win of Zotero.getMainWindows()) loadWindow(win);
    Zotero.PaperStatistics = api;
  }
  async function stop({ appShutdown = false } = {}) {
    if (!alive) return;
    alive = false;
    if (batch) batch.cancelled = true;
    clearInterval(timer); clearTimeout(refreshTimer); clearTimeout(saveTimer);
    if (observer) Zotero.Notifier.unregisterObserver(observer);
    for (const id of prefObservers.splice(0)) Zotero.Prefs.unregisterObserver(id);
    queue?.close();
    for (const req of replies.values()) req.reject(new Error("Plugin stopped"));
    replies.clear(); worker?.terminate();
    await manualWrites.catch(log);
    // PDFWorker has no public abort API; in-flight extraction returns and is discarded.
    // No need to hold shutdown open while Zotero's shared worker finishes.
    if (cachePath) await flush();
    if (!appShutdown) {
      for (const key of columns.splice(0)) Zotero.ItemTreeManager.unregisterColumn(key);
      if (api.sectionID) Zotero.ItemPaneManager.unregisterSection(api.sectionID);
      for (const id of menus.splice(0)) Zotero.MenuManager.unregisterMenu(id);
      if (preferencePaneID) Zotero.PreferencePanes.unregister(preferencePaneID);
    }
    for (const win of [...windows]) unloadWindow(win);
    paneHooks.clear(); rows.clear(); tracked.clear();columnMetrics.clear();
    if (Zotero.PaperStatistics === api) delete Zotero.PaperStatistics;
  }
  const api = { start, stop, loadWindow, unloadWindow, request, startBatch, cancelBatch,
    visibleMetrics, setVisibleMetrics, get preferencePaneID() { return preferencePaneID; },
    getEffectiveRecord, setManualValues, clearManualValues,
    dataProvider, TextStatisticsService, PdfStatisticsService, getRow: id => rows.get(id),
    whenIdle: () => queue.idle(), get columnIDs() { return [...columns]; }, sectionID: null };
  return api;
})();

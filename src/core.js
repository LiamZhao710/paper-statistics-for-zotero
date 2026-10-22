/* Pure algorithms shared by the background worker and Node tests. */
(function (root) {
  "use strict";
  const ALGORITHM_VERSION = 1;
  const tokenRE = /[\p{L}\p{N}]+(?:['’\-‐‑][\p{L}\p{N}]+)*/gu;

  function normalizeText(text) {
    return String(text || "").normalize("NFKC").replace(/\r\n?/g, "\n")
      .replace(/\u00ad(?=\s*\n)/g, "-").replace(/\u00ad/g, "")
      .replace(/(\p{L})[-‐]\s*\n[ \t]*(?=\p{Ll})/gu, "$1");
  }

  function removeRepeatedMargins(text) {
    const pages = text.split("\f");
    if (pages.length < 3) return text;
    const occurrences = new Map();
    const signature = line => line.trim().replace(/\b\d+\b/g, "#");
    // Only the first/last two non-empty lines; never remove captions or headings.
    const eligible = line => line.length <= 160 && !/^(?:fig(?:ure)?\.?|table|references|bibliography)\b/i.test(line.trim());
    const pageLines = pages.map(p => p.split("\n"));
    for (const lines of pageLines) {
      const filled = lines.map((s, i) => s.trim() ? i : -1).filter(i => i >= 0);
      const keys = new Set([...filled.slice(0, 2), ...filled.slice(-2)]
        .map(i => lines[i]).filter(eligible).map(signature).filter(Boolean));
      for (const key of keys) occurrences.set(key, (occurrences.get(key) || 0) + 1);
    }
    const threshold = Math.max(3, Math.ceil(pages.length * 0.7));
    return pageLines.map(lines => {
      const filled = lines.map((s, i) => s.trim() ? i : -1).filter(i => i >= 0);
      for (const i of new Set([...filled.slice(0, 2), ...filled.slice(-2)])) {
        if (eligible(lines[i]) && (occurrences.get(signature(lines[i])) || 0) >= threshold) lines[i] = "";
      }
      return lines.join("\n");
    }).join("\f");
  }

  class TextStatisticsService {
    static count(text) {
      // URLs/DOIs are metadata tokens, not English prose. Pure numbers/equations are excluded.
      const normalized = removeRepeatedMargins(normalizeText(text))
        .replace(/(?:https?:\/\/|www\.)[^\s]+/gi, " ")
        .replace(/\b10\.\d{4,9}\/[^\s]+/g, " ").replace(/\s+/g, " ");
      let words = 0;
      for (const match of normalized.matchAll(tokenRE)) if (/\p{L}/u.test(match[0])) words++;
      return words;
    }
  }

  function romanNumber(s) {
    s = s.toUpperCase();
    if (!/^(?=[MDCLXVI]+$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(s)) return null;
    const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    return [...s].reduce((sum, c, i) => sum + (values[c] < (values[s[i + 1]] || 0) ? -values[c] : values[c]), 0);
  }
  function normalizedID(id) {
    const upper = id.replace(/\s+/g, "").toUpperCase();
    if (/^S\d+$/.test(upper)) return "S" + Number(upper.slice(1));
    if (/^\d+$/.test(upper)) return String(Number(upper));
    const roman = romanNumber(upper);
    return roman ? String(roman) : null;
  }
  function detectCaptions(text, type, includeSupplementary = true) {
    const prefix = type === "figure" ? "(?:Fig(?:ure)?\\.?)" : "Table";
    const re = new RegExp("^\\s*" + prefix + "\\s+(S\\s*\\d+|\\d+|[IVXLCDM]+)(?:\\s*\\([a-z]\\))?([.:—–-]?)(?:[ \\t]+(.*)|$)", "i");
    const lines = normalizeText(text).split(/[\n\f]/);
    const ids = new Set();
    for (let i = 0; i < lines.length; i++) {
      const match = re.exec(lines[i]);
      if (!match) continue;
      const id = normalizedID(match[1]);
      if (!id || (id.startsWith("S") && !includeSupplementary)) continue;
      const rest = (match[3] || "").trim();
      // A paragraph beginning with a cross-reference is not a caption.
      if (/^(?:and\b|(?:a|b)\s+and\b|shows?\b|illustrates?\b|depicts?\b|presents?\b|compares?\b|is\b|are\b|was\b|were\b|can\b|has\b|have\b|in\b|of\b|see\b|we\b|as\b|demonstrates?\b|provides?\b|summarizes?\b|lists?\b|gives?\b|\d+\b)/i.test(rest)) continue;
      // IEEE often puts the entire label on a separate line, including TABLE III.
      const next = (lines[i + 1] || "").trim();
      if (!rest && !/\p{L}/u.test(next)) continue;
      if (rest && !/\p{L}/u.test(rest)) continue;
      ids.add(id);
    }
    return { count: ids.size, ids: [...ids].sort((a, b) => a.localeCompare(b, "en", { numeric: true })), method: "caption-heuristic" };
  }
  class FigureDetector {
    static detect(text, include = true) { return detectCaptions(text, "figure", include); }
  }
  class TableDetector {
    static detect(text, include = true) { return detectCaptions(text, "table", include); }
  }
  class ReferencesDetector {
    static detect(text) {
      const lines = normalizeText(text).split(/[\n\f]/);
      const start = lines.findIndex(line => /^\s*(?:(?:\d+|[IVX]+)[.\s]+)?(?:references|bibliography)\s*$/i.test(line));
      if (start < 0) return { count: null, reason: "No isolated bibliography heading" };
      const section = [];
      for (const line of lines.slice(start + 1)) {
        if (/^\s*(?:appendix\b|supplementary\s+(?:material|information)|acknowledg(?:e)?ments?\b|author biographies\b)/i.test(line)) break;
        section.push(line);
      }
      for (const pattern of [/^\s*\[(\d+)\]\s+\S/, /^\s*(\d+)\.\s+\p{L}/u]) {
        const sequence = section.map(line => pattern.exec(line)).filter(Boolean).map(m => Number(m[1]));
        if (sequence.length >= 3 && sequence.every((n, i) => n === i + 1)) {
          return { count: sequence.length, reason: "Experimental: consecutive numbered entries" };
        }
      }
      return { count: null, reason: "Unreliable or author-year style; manual review required" };
    }
  }
  function analyze(text, options = {}) {
    const hasText = /\p{L}/u.test(text || "");
    const figures = hasText ? FigureDetector.detect(text, options.includeSupplementary !== false) : null;
    const tables = hasText ? TableDetector.detect(text, options.includeSupplementary !== false) : null;
    const references = options.references && hasText ? ReferencesDetector.detect(text) : { count: null, reason: "Disabled (experimental)" };
    return { words: hasText ? TextStatisticsService.count(text) : null,
      figures: figures?.count ?? null, tables: tables?.count ?? null, references: references.count,
      figureIDs: figures?.ids || [], tableIDs: tables?.ids || [], referenceReason: references.reason,
      detectionMethod: "caption-heuristic", noExtractableText: !hasText };
  }
  function settingsKey(o) { return `${o.includeSupplementary !== false}:${!!o.references}`; }
  function cacheValid(c, a, stat, options) {
    return !!c && c.attachmentID === a.id && c.attachmentKey === a.key && c.libraryID === a.libraryID
      && c.fileMTime === stat.lastModified && c.fileSize === stat.size
      && c.algorithmVersion === ALGORITHM_VERSION && c.settingsKey === settingsKey(options);
  }
  function encodeColumn(record, metric) {
    const n = record?.[metric];
    if (!Number.isSafeInteger(n) || n < 0) return "";
    const approximate = metric !== "pages" && record.textCompleteness !== "complete";
    const heuristic = ["figures", "tables", "references"].includes(metric);
    const coverage = record.textCompleteness === "partial"
      ? `Partial text: ${record.indexedPages ?? "?"} / ${record.totalPages ?? "?"} pages extracted`
      : `Text coverage: ${record.textCompleteness}`;
    return String(n).padStart(16, "0") + "|" + (approximate ? "~" : "") + n.toLocaleString("en-US")
      + "|" + coverage + (heuristic ? "; caption heuristic / experimental bibliography" : "");
  }
  async function selectPrimaryPDF(item, getItem) {
    if (item.isPDFAttachment?.()) return !item.deleted && await item.getFilePathAsync() ? item : null;
    if (!item.isRegularItem?.()) return null;
    const best = await item.getBestAttachment();
    if (best && !best.deleted && best.isPDFAttachment() && await best.getFilePathAsync()) return best;
    const candidates = await Promise.all(item.getAttachments().map(getItem));
    candidates.sort((a, b) => Number(b.isStoredFileAttachment()) - Number(a.isStoredFileAttachment()) || a.id - b.id);
    for (const a of candidates) if (!a.deleted && a.isPDFAttachment() && await a.getFilePathAsync()) return a;
    return null;
  }

  class BackgroundQueue {
    constructor(limit = 2) { this.limit = limit; this.running = 0; this.tasks = []; this.pending = new Map(); this.closed = false; }
    add(key, fn, token) {
      if (this.closed) return Promise.reject(new Error("Queue closed"));
      if (this.pending.has(key)) return this.pending.get(key);
      const promise = new Promise((resolve, reject) => { this.tasks.push({ key, fn, token, resolve, reject }); });
      this.pending.set(key, promise);
      // Microtask: never execute an extractor inside the synchronous dataProvider call.
      Promise.resolve().then(() => this.pump());
      return promise;
    }
    async pump() {
      while (!this.closed && this.running < this.limit && this.tasks.length) {
        const task = this.tasks.shift();
        this.running++;
        (async () => {
          try { task.resolve(task.token?.cancelled ? null : await task.fn(task.token)); }
          catch (e) { task.reject(e); }
          finally { this.running--; this.pending.delete(task.key); this.pump(); }
        })();
      }
    }
    close() {
      this.closed = true;
      for (const task of this.tasks.splice(0)) { this.pending.delete(task.key); task.resolve(null); }
    }
    async idle() { while (this.pending.size) await Promise.allSettled([...this.pending.values()]); }
  }
  const api = { ALGORITHM_VERSION, normalizeText, removeRepeatedMargins, TextStatisticsService,
    FigureDetector, TableDetector, ReferencesDetector, analyze, settingsKey, cacheValid,
    encodeColumn, selectPrimaryPDF, BackgroundQueue, normalizedID };
  root.PaperStatsCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);

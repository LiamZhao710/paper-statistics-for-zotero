/* Pure algorithms shared by the background worker and Node tests. */
(function (root) {
  "use strict";
  const ALGORITHM_VERSION = 4;
  const METRICS = { pages: "PDF Pages", words: "Words", figures: "Figures", tables: "Tables",
    statements: "Statements", algorithms: "Algorithms", equations: "Numbered Equations", references: "References" };
  const DEFAULT_METRICS = ["pages", "words", "references"];
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
  // Headings, rather than mentions in running prose, are the evidence for these counts.
  const structuralID = "(?:[A-Z]\\.\\d+(?:\\.\\d+)*|S\\d+(?:\\.\\d+)*|\\d+(?:\\.\\d+)*[a-z]?|[IVXLCDM]+)";
  const referenceTail = /^(?:\(?see\b|and\b|or\b|shows?\b|states?\b|says?\b|implies?\b|ensures?\b|guarantees?\b|illustrates?\b|describes?\b|establishes?\b|proves?\b|provides?\b|gives?\b|suggests?\b|follows?\b|is\b|are\b|was\b|were\b|can\b|will\b|has\b|have\b|in\b|of\b|from\b|we\b|as\b|applies?\b|requires?\b|与|和|说明|表明|给出|可知|可得|证明了|是)/i;
  function normalizeStructuralID(id) {
    if (/^[IVXLCDM]+$/i.test(id)) return normalizedID(id);
    return id.toUpperCase().replace(/\d+/g, n => String(Number(n)));
  }
  function structuralLines(text) {
    let bibliography = false;
    return normalizeText(text).split(/[\n\f]/).map(line => {
      if (/^\s*(?:(?:\d+|[IVX]+)[.\s]+)?(?:references|bibliography|参考文献)\s*$/i.test(line)) bibliography = true;
      else if (/^\s*(?:appendi(?:x|ces)\b|supplementary\s+(?:material|information)|附录)/i.test(line)) bibliography = false;
      return bibliography ? "" : line;
    });
  }
  function headingEvidence(lines, i, labels) {
    const line = lines[i].trim();
    const numbered = new RegExp("^(" + labels + ")\\.?\\s*(" + structuralID + ")(?=$|[\\s.:：)\\]])[.:：]?\\s*(.*)$", "i").exec(line);
    if (numbered) {
      const rest = numbered[3].trim();
      if (referenceTail.test(rest)) return null;
      if (!rest && !/\p{L}/u.test(lines[i + 1] || "")) return null;
      const id = normalizeStructuralID(numbered[2]);
      return id ? { kind: numbered[1].toLowerCase(), id, numbered: true } : null;
    }
    // Unnumbered declarations need an explicit heading boundary or a named heading.
    const plain = new RegExp("^(" + labels + ")(?:[.:：]\\s*(.*)|\\s+(\\([^)]{2,120}\\))[.:：]?\\s*(.*)|\\s*)$", "i").exec(line);
    if (!plain) return null;
    const rest = (plain[2] || plain[4] || "").trim();
    if (referenceTail.test(rest) || (!rest && !/\p{L}/u.test(lines[i + 1] || ""))) return null;
    return { kind: plain[1].toLowerCase(), id: `unnumbered@${i + 1}`, numbered: false };
  }
  class StatementDetector {
    static detect(text) {
      const lines = structuralLines(text);
      const names = { proposition: "proposition", theorem: "theorem", lemma: "lemma", corollary: "corollary",
        "命题": "proposition", "定理": "theorem", "引理": "lemma", "推论": "corollary" };
      const found = new Map();
      for (let i = 0; i < lines.length; i++) {
        const h = headingEvidence(lines, i, "Proposition|Theorem|Lemma|Corollary|命题|定理|引理|推论");
        if (!h) continue;
        const kind = names[h.kind];
        found.set(`${kind}:${h.id}`, { ...h, kind });
      }
      const breakdown = { proposition: 0, theorem: 0, lemma: 0, corollary: 0 };
      for (const h of found.values()) breakdown[h.kind]++;
      return { count: found.size, ids: [...found.keys()], breakdown, method: "declaration-heading-heuristic" };
    }
  }
  class AlgorithmDetector {
    static detect(text) {
      const lines = structuralLines(text), ids = new Set();
      for (let i = 0; i < lines.length; i++) {
        const h = headingEvidence(lines, i, "Algorithm|算法");
        if (h) ids.add(h.id);
      }
      return { count: ids.size, ids: [...ids], method: "algorithm-heading-heuristic" };
    }
  }
  function isMathExpression(text) {
    const s = text.trim();
    if (!s || s.length > 500 || !/[\p{L}\p{N}]/u.test(s)) return false;
    if (/^(?:fig(?:ure)?\.?|table|algorithm|theorem|lemma|proposition|corollary|definition|eq(?:uation)?s?\.?|where|see|from|using|as|for|in|we|the|this|by|note|since|let|if|when|then|it|these|here|with|and|or)\b/i.test(s)) return false;
    if (!/[=<>≤≥≠≈≡∝∈∉⊂⊆⊃⊇∑∏∫√∂∇→↦±×÷]/u.test(s)) return false;
    const words = s.match(/\p{L}{3,}/gu) || [];
    const prose = words.filter(w => !/^(?:sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|exp|log|ln|max|min|arg|lim|sup|inf|det|diag|rank|tr|trace|subject|forall|exists)$/i.test(w));
    return prose.length <= 2 && !/[!?]/.test(s);
  }
  class EquationDetector {
    static detect(text) {
      const idPattern = "(?:[A-Z](?:\\.\\d+|\\d+)(?:\\.\\d+)*|\\d+(?:\\.\\d+)*)(?:[a-z])?";
      const trailing = new RegExp("^(.*?)\\(\\s*(" + idPattern + ")\\s*\\)[.,;]?\\s*$", "i");
      const leading = new RegExp("^\\s*\\(\\s*(" + idPattern + ")\\s*\\)\\s*(.+)$", "i");
      const ids = new Set();
      // Never borrow math evidence across a page or bibliography boundary.
      const pages = structuralLines(text.replace(/\f/g, "\nPAPERSTATS_PAGE_BOUNDARY\n")).join("\n").split("PAPERSTATS_PAGE_BOUNDARY");
      for (const page of pages) {
        const lines = page.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          let m = trailing.exec(line);
          if (m) {
            let evidence = isMathExpression(m[1]);
            if (!m[1].trim()) {
              // Extraction may put the right-margin number on its own line.
              for (const direction of [-1, 1]) {
                let joined = "";
                for (let step = 1; step <= 2; step++) {
                  const candidate = lines[i + direction * step];
                  if (candidate === undefined || !candidate.trim()) break;
                  if (/^\s*\(?[\d.]+\)?\s*$/.test(candidate)) break;
                  if (!isMathExpression(candidate) && !/[=<>≤≥≠≈≡∈∑∏∫√∂∇+\-*^_(){}]/u.test(candidate)
                    && !/^\s*[\p{L}\p{N}]\s*$/u.test(candidate)) break;
                  joined = direction < 0 ? candidate + " " + joined : joined + " " + candidate;
                  if (isMathExpression(joined)) { evidence = true; break; }
                }
              }
            }
            if (evidence) ids.add(normalizeStructuralID(m[2]));
          }
          else {
            m = leading.exec(line);
            if (m && isMathExpression(m[2])) ids.add(normalizeStructuralID(m[1]));
          }
        }
      }
      return { count: ids.size, ids: [...ids].sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
        method: "numbered-display-equation-heuristic", scope: "Numbered display equations only; inline and unnumbered math excluded" };
    }
  }
  class ReferencesDetector {
    static detect(text, options = {}) {
      let normalized = normalizeText(text).replace(/\bR[ \t]+E[ \t]+F[ \t]+E[ \t]+R[ \t]+E[ \t]+N[ \t]+C[ \t]+E[ \t]+S\b/gi, "References");
      const heading = /^\s*(?:(?:\d+|[IVXLCDM]+)[.\s]+)?(?:references(?:\s+and\s+notes)?|bibliography|literature cited|参考文献)\s*[.:：]?\s*(?=$|\[\s*\d+\s*\]|\(\d+\)|1[.)]\s)/i;
      let lines = normalized.split(/[\n\f]/);
      // Prefer isolated headings; do not promote a prose "see references [1]" before a real section.
      if (!lines.some(line => heading.test(line))) {
        normalized = normalized.replace(/\b(References|Bibliography|Literature cited)\s*[.:：]?\s*(?=\[\s*\d+\s*\]|\(\d+\)|1[.)]\s)/gi, "\n$1\n");
        lines = normalized.split(/[\n\f]/);
      }
      const stop = /^\s*(?:(?:\d+|[IVXLCDM]+)[.\s]+)?(?:appendi(?:x|ces)\b|supplementary\s+(?:material|information)\b|acknowledg(?:e)?ments?\b|author biograph(?:y|ies)\b|author contributions?\b|funding\s*$|data availability\b|(?:declaration of )?competing interests\b|附录)/i;
      const unknown = reason => ({ count: null, ids: [], style: "unknown", confidence: "unknown", reason });
      const start = lines.findIndex(line => heading.test(line));
      if (start < 0) return unknown("No bibliography heading detected");
      const section = [];
      const first = lines[start].replace(heading, "");
      if (first.trim()) section.push(first);
      for (const line of lines.slice(start + 1)) {
        if (stop.test(line)) break;
        if (heading.test(line)) continue; // Repeated running bibliography header.
        section.push(line);
      }
      let foundNumeric = false, estimatedNumeric = null;
      const author = /^(?:(?:de|van|von|der|den|del|da|dos|du|le|la)\s+){0,2}([\p{Lu}][\p{L}\p{M}'’\-]+)(?:[ \t]+[\p{Lu}][\p{L}\p{M}'’\-]+){0,2}(?:,[ \t]*|[ \t]+(?=[\p{Lu}]\.?[ ,]))/u;
      for (const [style, pattern] of [
        ["numeric-bracket", /^\s*\[(\d{1,4})\]\s*(.*)$/u],
        ["numeric-parenthesis", /^\s*\((\d{1,4})\)\s*(.*)$/u],
        ["numeric-dot", /^\s*(\d{1,4})[.)]\s+(.*)$/u]
      ]) {
        const entries = new Map(); let conflict = false;
        const candidates = [];
        if (style === "numeric-bracket") {
          const joined = section.join("\n");
          const labels = [...joined.matchAll(/\[\s*(\d{1,4})\s*\]/g)];
          for (let i = 0; i < labels.length; i++) {
            const label = labels[i];
            const body = joined.slice(label.index + label[0].length, labels[i + 1]?.index ?? joined.length).trim();
            const prefix = joined.slice(joined.lastIndexOf("\n", label.index - 1) + 1, label.index);
            // Inline labels need author-like capitalization. Do not count prose citations.
            if (prefix.trim() && !/^(?:[\p{Lu}\p{Lo}"“‘]|(?:de|van|von|del)\s)/u.test(body)) continue;
            candidates.push({ id: label[1], body, previous: "" });
          }
        }
        else for (let i = 0; i < section.length; i++) {
          const m = pattern.exec(section[i]);
          if (m) candidates.push({ id: m[1], body: m[2].trim() || (!pattern.test(section[i + 1] || "") ? (section[i + 1] || "").trim() : ""), previous: section[i - 1] || "" });
        }
        for (const candidate of candidates) {
          const m = [null, candidate.id, candidate.body];
          if (!m || Number(m[1]) < 1) continue;
          if (style === "numeric-parenthesis" && /^(?:18|19|20)\d{2}$/.test(m[1]) && author.test(candidate.previous.trim())) continue;
          foundNumeric = true;
          let body = m[2].trim();
          if (!/\p{L}/u.test(body)) continue;
          const id = Number(m[1]);
          const signature = body.toLocaleLowerCase().replace(/\s+/g, " ");
          if (entries.has(id) && entries.get(id) !== signature) conflict = true;
          entries.set(id, signature);
        }
        const ids = [...entries.keys()].sort((a, b) => a - b);
        if (!ids.length) continue;
        if (!conflict && ids.every((n, i) => n === i + 1)) {
          return { count: ids.length, ids: ids.map(String), style, confidence: "high",
            reason: "Detected consecutive numbered bibliography entries; duplicate labels counted once" };
        }
        if (!conflict && ids.length >= 3 && ids[0] === 1 && ids.length / ids[ids.length - 1] >= 0.7) {
          estimatedNumeric = { count: ids.length, ids: ids.map(String), style, confidence: "estimated",
            reason: "Estimated detected bibliography entries: some labels are missing; this is not the largest label or a verified total" };
        }
      }
      if (estimatedNumeric) return estimatedNumeric;
      if (foundNumeric) return unknown("Numbered entries contain gaps, missing text, or conflicting labels; manual review required");
      if (options.authorYear === false) return unknown("Author-year estimation disabled");
      // Author-year counts are ALWAYS estimates; use author + early year + title evidence.
      const year = /\b((?:18|19|20)\d{2}[a-z]?)\b/i;
      const entries = new Map();
      for (let i = 0; i < section.length; i++) {
        let line = section[i].trim();
        const a = author.exec(line);
        if (!a) continue;
        if (!year.test(line.slice(0, 240)) && /^\s*\(?(?:18|19|20)\d{2}/.test(section[i + 1] || "")) line += " " + section[++i].trim();
        const y = year.exec(line.slice(0, 240));
        if (!y || y.index < a[0].length) continue;
        const title = line.slice(y.index + y[0].length).replace(/^[\s).,:;]+/, "");
        if (!/\p{L}/u.test(title) || title.length < 5) continue;
        const signature = line.toLocaleLowerCase().replace(/\s+/g, " ");
        entries.set(signature, `${a[1]} ${y[1]}`);
      }
      if (entries.size >= 3) return { count: entries.size, ids: [...entries.values()], style: "author-year", confidence: "estimated",
        reason: "Estimated author-year bibliography entries; wrapping and corporate authors may affect the count" };
      return unknown("Insufficient recognizable author-year entries; manual review required");
    }
  }
  function analyze(text, options = {}) {
    const hasText = /\p{L}/u.test(text || "");
    const figures = hasText ? FigureDetector.detect(text, options.includeSupplementary !== false) : null;
    const tables = hasText ? TableDetector.detect(text, options.includeSupplementary !== false) : null;
    const statements = hasText ? StatementDetector.detect(text) : null;
    const algorithms = hasText ? AlgorithmDetector.detect(text) : null;
    const equations = hasText || /[\d]+\s*[=<>≤≥≠]/u.test(text || "") ? EquationDetector.detect(text) : null;
    const references = options.references && hasText ? ReferencesDetector.detect(text, { authorYear: options.authorYearReferences !== false })
      : { count: null, ids: [], style: "unknown", confidence: "disabled", reason: "Reference counting disabled or text unavailable" };
    return { words: hasText ? TextStatisticsService.count(text) : null,
      figures: figures?.count ?? null, tables: tables?.count ?? null, references: references.count,
      statements: statements?.count ?? null, algorithms: algorithms?.count ?? null, equations: equations?.count ?? null,
      statementIDs: statements?.ids || [], statementCounts: statements?.breakdown || null,
      algorithmIDs: algorithms?.ids || [], equationIDs: equations?.ids || [],
      equationScope: "Numbered display equations only; inline and unnumbered math excluded",
      figureIDs: figures?.ids || [], tableIDs: tables?.ids || [], referenceReason: references.reason,
      referenceIDs: references.ids, referenceStyle: references.style, referenceConfidence: references.confidence,
      detectionMethod: "caption-heuristic", noExtractableText: !hasText && !equations };
  }
  function settingsKey(o) { return `${o.includeSupplementary !== false}:${!!o.references}:${o.authorYearReferences !== false}`; }
  function parseManualValue(value) {
    if (value === null || value === undefined || typeof value === "string" && !value.trim()) return null;
    if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value.trim()))) throw new Error("请输入非负整数；留空表示使用自动值。");
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("请输入范围内的非负整数。");
    return n;
  }
  function applyManualStatistics(automatic, manual = {}) {
    const valid = Object.fromEntries(Object.entries(manual).filter(([key, entry]) => Object.hasOwn(METRICS, key)
      && Number.isSafeInteger(entry?.value) && entry.value >= 0));
    if (!automatic && !Object.keys(valid).length) return null;
    const result = { textCompleteness: "unknown", figureIDs: [], tableIDs: [], referenceIDs: [], statementIDs: [], algorithmIDs: [], equationIDs: [], ...automatic,
      manualMetrics: valid, automaticValues: Object.fromEntries(Object.keys(METRICS).map(key => [key, automatic?.[key] ?? null])) };
    for (const [metric, entry] of Object.entries(valid)) result[metric] = entry.value;
    return result;
  }
  function cacheValid(c, a, stat, options) {
    return !!c && c.attachmentID === a.id && c.attachmentKey === a.key && c.libraryID === a.libraryID
      && c.fileMTime === stat.lastModified && c.fileSize === stat.size
      && c.algorithmVersion === ALGORITHM_VERSION && c.settingsKey === settingsKey(options);
  }
  function encodeColumn(record, metric) {
    const n = record?.[metric];
    if (!Number.isSafeInteger(n) || n < 0) return "";
    const manual = record.manualMetrics?.[metric];
    const approximate = !manual && metric !== "pages" && (record.textCompleteness !== "complete" || metric === "references" && record.referenceConfidence === "estimated");
    const methods = { figures: "Caption heuristic", tables: "Caption heuristic", references: record.referenceReason || "Detected bibliography entries",
      statements: "Heading heuristic: Proposition + Theorem + Lemma + Corollary; Definition excluded",
      algorithms: "Algorithm heading heuristic", equations: "Numbered display equations only; inline and unnumbered math excluded; heuristic" };
    const coverage = record.textCompleteness === "partial"
      ? `Partial text: ${record.indexedPages ?? "?"} / ${record.totalPages ?? "?"} pages extracted`
      : `Text coverage: ${record.textCompleteness}`;
    return String(n).padStart(16, "0") + "|" + (approximate ? "~" : "") + n.toLocaleString("en-US") + (manual ? "*" : "")
      + "|" + (manual ? `人工值 / Manual override; automatic value: ${record.automaticValues?.[metric] ?? "unknown"}; recomputation preserves this override` : coverage + (methods[metric] ? "; " + methods[metric] : ""));
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
  const api = { ALGORITHM_VERSION, METRICS, DEFAULT_METRICS, normalizeText, removeRepeatedMargins, TextStatisticsService,
    FigureDetector, TableDetector, StatementDetector, AlgorithmDetector, EquationDetector, ReferencesDetector, analyze, settingsKey, cacheValid,
    encodeColumn, parseManualValue, applyManualStatistics, selectPrimaryPDF, BackgroundQueue, normalizedID };
  root.PaperStatsCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);

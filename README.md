# Paper Statistics for Zotero

**English** | [简体中文](README.zh-CN.md)

Paper Statistics for Zotero 0.4.1 is a local-only Zotero plugin that displays paper statistics in the item list and a statistics sidebar. The plugin does not upload PDFs or personal libraries, and it does not use LLMs, OCR, telemetry, or API keys.

This is an independent third-party plugin. It is not affiliated with or endorsed by Zotero.

[Latest download](https://github.com/LiamZhao710/paper-statistics-for-zotero/releases/latest)

## Compatibility

- Declared support for Zotero 10.0.x only.
- Installation file: `dist/paper-statistics-0.4.1.xpi`.
- Uses the same plugin ID as earlier releases, so it can be installed over an existing version without uninstalling first. Older release files are retained.

## Installation

1. Open Zotero and go to “工具 → 插件” (Tools → Plugins).
2. Click the gear button and choose “从文件安装” (Install from File).
3. Select `dist/paper-statistics-0.4.1.xpi` to complete installation.

## Interface language

Top-level menus have English and Simplified Chinese translations. Several settings, sidebar explanations, and manual-edit buttons are currently Chinese or bilingual. Their literal labels are included below to help you find them; a fully English interface is not yet available.

## Settings entry points

You can open display settings in any of the following ways:

- “工具 → Paper Statistics 显示设置…” (Tools → Paper Statistics Display Settings…)
- “Paper Statistics / 论文统计” in Zotero settings
- The collapsed “显示设置（只显示勾选项）” (Display Settings — show only checked items) section in the statistics sidebar

Settings are saved automatically, take effect immediately, and persist after restart. Toggling display options does not re-parse PDFs.

## Available statistics

By default, only **PDF Pages, Words, and References** are shown. The full set of eight optional statistics is:

- PDF Pages
- Words
- Figures
- Tables
- Statements
- Algorithms
- Numbered Equations
- References

The checkboxes control both the plugin list columns and the sidebar values. Unchecking an item unregisters the corresponding plugin column, so it does not occupy an empty column and does not appear in the host header property menu. Selected columns are managed by the plugin’s checkbox settings; Zotero’s built-in title, author, and year columns still use the host header menu. You may leave all statistics unchecked; the sidebar settings entry point remains available.

The settings page provides shortcuts for “常用三项” (Common Three), “全选” (Select All), and “全部隐藏” (Hide All). Detection details, coverage, PDF file name, timestamps, numbering, and related information are in the “检测明细与统计口径” (Detection Details and Counting Rules) section, which is collapsed by default.

## Counting rules

### References

References is enabled by default and ignores the old experimental toggle. It supports standalone reference headings: References, Bibliography, Literature cited, 参考文献, and numbered headings. Numeric entries such as `[1]`, `(1)`, `1.`, and `1)` are recognized; repeated citations in the body are not counted multiple times, and duplicate numbers are deduplicated. When numbering is complete and starts at 1, a normal number is shown. When a small number of numbers are missing but there is sufficient evidence, an estimate of recognized entries is shown with `~`. When numbering is sparse, conflicting, has no heading, or the document is a scan that cannot be recognized, the result is shown as unknown; the maximum number is not used as a substitute for the entry count. For author–year style references, an estimate is shown when at least three entries are recognized, always prefixed with `~` (for example, `~42`); this estimate can be disabled in settings. The sidebar details explain the detection method and the reason for unknown results.

References counts entries detected in the PDF bibliography. It is not a citation-impact metric and does not query Crossref or other online databases.

### Other statistics

- **PDF Pages**: the actual number of pages in the PDF, not the bibliographic page range.
- **Words**: based on extracted text, including references and figure captions; not a publisher-style body-text count.
- **Figures / Tables**: heuristic counts based on unique caption numbering.
- **Statements**: the total of Proposition / Theorem / Lemma / Corollary, excluding Definition; broken down by category in the details.
- **Algorithms**: deduplicated by heading.
- **Numbered Equations**: counts only numbered display equations; excludes inline, unnumbered, or image-based equations.

These detectors are text heuristics. Accuracy has not been evaluated on a large, manually verified sample of real papers.

## How it runs

- Runs entirely locally; does not upload PDFs or personal libraries.
- Prefers reusing a fresh, complete Zotero full-text cache; when incomplete, requests full text through Zotero’s native PDF worker without rewriting the user’s full-text index.
- Shows `~` or unknown when coverage is partial or unknown.
- Background concurrency is 2, and batches can be canceled; extraction already started by Zotero’s shared worker cannot be forcibly interrupted.
- The automatic cache is stored at `paper-statistics/cache-v1.json` in the Zotero data directory. It includes counts, detected labels, file paths/names, item and attachment identifiers, file fingerprints, timestamps, and extraction status; it does not store the extracted PDF text. The plugin does not write to Extra, bibliographic fields, or the main item table.
- Algorithm version 4 invalidates earlier automatic-analysis caches. File changes are detected using mtime and size; items accessed during the session are checked every 60 seconds.
- A missing PDF produces unknown values rather than zero. Missing text is not presented as a precise count.

If both mtime and size are deliberately kept unchanged when replacing a file, recalculate manually. There is no OCR and no performance benchmark against a large sample of real papers; very large PDFs remain subject to the memory limits of Zotero’s native worker. With all properties enabled, the list may require horizontal scrolling; use “常用三项” (Common Three) to restore a compact layout.

## Manual calculation

Right-click a single item or a multi-selection and choose “计算论文统计” (Calculate Paper Statistics) or “重新计算论文统计” (Recalculate Paper Statistics).

## Update notes

The plugin has no online update service. The host requires an HTTPS `update_url`, so the local distribution package uses loopback port 0 as a placeholder and updates are performed manually via XPI; checking for plugin updates may fail.

## Build and test

Requires Node 18+ and Python 3; no third-party dependencies.

```bash
node --test tests/*.test.cjs
python scripts/build.py
```

Host verification script:

```bash
python scripts/make_fixtures.py
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-host-test.ps1 -ZoteroExe 'C:\Path\To\Zotero\zotero.exe'
```

Host tests create synthetic items only in `tests/host/profile` and `tests/host/data`; test helpers must not be installed into a personal library. See `TEST-REPORT.md` for test details.

## Reference troubleshooting and manual editing

**Old caches and recalculation.** Old caches may still contain results from when reference counting was disabled. After installing 0.4.1, select the items, right-click, and choose “重新计算论文统计” (Recalculate Paper Statistics); you can also select all with Ctrl+A and recalculate. Recalculation updates plugin-owned statistics without changing bibliographic fields or PDF contents.

**Limitations of PDF text extraction.** Extraction may merge multiple reference entries into one paragraph or join a heading to the body text. Older versions recognized only line-start numbering or continuous numbering and left such cases blank. 0.4.1 can recognize bracketed numbers, numbers with spaces, and headings within merged paragraphs, and prefers the actual reference heading. When a small number of numbers are missing but the sequence is sufficiently coherent, only an approximate count of recognized entries (`~`) is shown; the total is not inferred from the maximum number. Scans, severely missing text, or unclear structure may still produce unknown. This plugin does not promise publisher-level accuracy.

**Manually entering statistics.** The default compact display and the eight optional statistics follow 0.3.0: pages, words, figures, tables, statements, algorithms, numbered equations, and references. All eight can be entered manually; first check the items you want to display or edit.

**How to edit.** Select an item, expand “手动修改统计（留空使用自动值）” (Manually Edit Statistics — leave blank to use automatic values) in the paper statistics sidebar, enter a non-negative integer, and click “保存人工值” (Save Manual Value). 0 is valid; negative numbers and decimals are rejected. Manual values are displayed as `42*` with a “人工” (Manual) marker, and the list still sorts by numeric value. Automatic extraction coverage is not changed to complete by manual entry; editing one metric does not change the others.

**Recalculation and restoration.** Recalculation does not overwrite manual values. Clearing the corresponding input and saving restores the automatic value for that item; “恢复全部自动统计” (Restore All Automatic Statistics) clears all manual overrides for the current item. You can enter values even without a PDF; after restoration, unknown items return to —. Background refreshes try to preserve unsaved input. Manual edits do not change Zotero’s native bibliographic fields or the PDF.

**Data storage.** Manual data is stored in `paper-statistics/manual-overrides-v1.json` in the Zotero data directory, separate from the rebuildable automatic cache. Data is bound to the current item by libraryID/itemKey; a parent paper and its attachment are different items and do not automatically share data. Data persists after restart; verify it yourself after replacing a PDF. Copying or exporting items, or syncing to other devices, does not automatically carry this file; it is stored only in the local plugin data.

**Local operation.** The plugin runs entirely locally, does not upload PDFs or libraries, and does not use LLMs. Development documentation assistance is not a plugin dependency.

## Privacy and support

Do not attach your Zotero database, PDFs, full-text caches, plugin cache, manual-override file, or unredacted logs to public issues. Local cache records can reveal document paths, titles, and item identifiers even though the plugin does not upload them. Use synthetic examples or redact personal information before reporting a problem.

## License

Starting with **0.4.1**, this project is licensed under the **GNU Affero General Public License v3.0 only (SPDX: AGPL-3.0-only)**. See [LICENSE](LICENSE) for the full text, and [NOTICE](NOTICE) for the project licensing statement and how to obtain the source code.

Use, modification, and commercial use are permitted; when distributing a version covered by this license, you must comply with obligations such as retaining notices, distributing under the same license, and providing corresponding source code. If a modified program interacts with users over a network, Section 13 also requires offering access to the corresponding source code. This is a summary only; the license text governs. Use does not require starring, donating, or logging in to GitHub.

**Historical versions 0.1.0–0.4.0 remain under the original MIT license**; their runtime sources and installation packages are preserved, and the old license text is preserved at [LICENSES/MIT.txt](LICENSES/MIT.txt). Changing the current license does not revoke licenses already granted for older versions.

The corresponding source code for 0.4.1 is provided in its Release as `paper-statistics-0.4.1-source.zip`, and is also available from the matching tag in the repository: <https://github.com/LiamZhao710/paper-statistics-for-zotero>. The source includes build scripts; run `python scripts/build.py` to generate the XPI.

If this plugin is useful, consider starring the repository or reporting an issue.
The version sequence is preserved. Commit and tag author metadata was rebuilt using the maintainer’s public GitHub identity before public release; runtime sources and XPI bytes were preserved.

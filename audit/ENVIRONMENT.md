# 技术审计（2026-10-22，Europe/Berlin）

## 0.3.0 增量（2026-10-23）

参考文献统计默认启用，支持方括号/圆括号/句点/右括号编号制和带估计标记的作者—年份制。算法版本升为 3，旧缓存自动失效；作者—年份估计可禁用。新增参考文献 style/confidence/IDs/reason 字段，未使用网络元数据或 LLM 处理用户文献。

显示设置统一管理八个插件统计项，默认 PDF Pages、Words、References。仅注册勾选项的官方 custom columns，取消项立即 unregister；新注册键使用 selected- 前缀，避免旧版 hidden 持久偏好干扰升级。showInColumnPicker=false 把控制集中到本插件的勾选框，避免继续挤占宿主的属性菜单。主侧栏只显示选中数值，明细与设置分别放在折叠 details 中。

直接核对本机 `xpcom/preferencePanes.js` 的 register/unregister 与 `preferences/preferences.js` 的 preference 属性绑定流程，使用官方 PreferencePanes 注册设置页；核对 `Utilities.Internal.openPreferences(paneID)` 的窗口返回值，用于工具菜单入口与独立 profile 中的真实 UI 测试。没有修改宿主 column prefs 文件、使用私有 schema，或 monkey patch item tree。

使用说明初稿按用户全局偏好交给已配置的 DeepSeek Flash API，主助手复核；仅发送非敏感功能规范，密钥未复制到项目，未发送用户 PDF 或文库。该开发辅助不进入插件运行时或依赖；调用元数据见 reports/deepseek-documentation.json。

## 0.2.0 增量

新增 StatementDetector、AlgorithmDetector、EquationDetector，在已有本地文本 worker 中运行，未增加 Zotero API、第三方依赖、网络接口或数据库写入。沿用原有官方列与侧栏接口，增加三列及明细。Statements 合计 Proposition/Theorem/Lemma/Corollary，排除 Definition；Algorithms 按标题识别；Numbered Equations 仅覆盖带编号独立公式。算法版本从 1 升为 2，使旧统计记录自动失效。通过独立 profile 中的真实 PDF 与 DOM 验证；完整结果见当前 TEST-REPORT.md。

## 已确认

- 原工作区只有文库维护脚本和报告，没有插件 scaffold、manifest、bootstrap 或 package.json。新项目独立放在 `paper-statistics/`，没有覆盖既有脚本。
- Windows 安装位置 `D:\Program Files\Zotero`。`app/application.ini` 显示 **10.0.6**，BuildID **20261007153950**，Firefox **140 ESR**。真实隔离宿主测试也读取 `Zotero.version`，不以过时的注册表 DisplayVersion 9.0 为准。
- 本地 API 探测在受限 shell 下遇到 WinError 10013；没有因此启用/修改用户 API 设置或重启个人 Zotero session。插件不依赖 HTTP API。
- 已查阅官方 [插件开发](https://www.zotero.org/support/dev/client_coding/plugin_development)、[Zotero 8 开发者说明](https://www.zotero.org/support/dev/zotero_8_for_developers)、[Zotero 9 开发者说明](https://www.zotero.org/support/dev/zotero_9_for_developers)、[Zotero 10 开发者说明](https://www.zotero.org/support/dev/zotero_10_for_developers)。后者说明全文索引与 item tree 在 10 中发生重构。
- 直接从本机 **`app/omni.ja` 和 `omni.ja`** 解出并检查实际 JavaScript 实现，避免仅依赖网上旧版示例。源码散列见 `source-hashes.json`，这些第三方源码快照只留在本地 audit 目录，不进入插件包/源码发行 ZIP。

## API 决策与源码位置

| 功能 | 实际 API / 实现位置 | 本插件处理 |
|---|---|---|
| 列 | `xpcom/pluginAPI/itemTreeManager.js`: `registerColumn`, `unregisterColumn`, `getCustomCellData` | 同步 provider 读缓存并安排队列；独立 renderCell |
| 排序 | `itemTree.js`: `_compareField` 把值转成 string 后调用 host collation | API 没有自定义 numeric comparator；固定 16 位十进制排序键，独立显示数值，真实宿主 collation 验证 7 < 12 < 100 |
| 侧栏 | `xpcom/pluginAPI/itemPaneManager.js`: `registerSection`, `onInit`, `onItemChange`, `onRender` | 使用 onInit 提供的 refresh 回调；未知/partial/编号/时间可见 |
| 菜单 | `xpcom/pluginAPI/menuManager.js`, `zoteroPane.js` 的 `main/library/item` context | 使用 `context.items`，不读取 10 中已移除的 singular collectionTreeRow |
| 页数 | `xpcom/fulltext.js`: `getPages(itemID)` | 返回字段是 **`total`、`indexedPages`**，不是 totalPages；仅信任新鲜缓存对应的元数据 |
| 全文 | `xpcom/pdfWorker/manager.js`: `getFullText(itemID, maxPages, isPriority, password)` | `maxPages=null` 得到全部页面；返回 `{text,extractedPages,totalPages}`；不调用 indexPDF |
| 提取格式 | `resource/document-worker/worker.js`: `getFulltext` | 保留段落换行和 `\f` 页间分隔；行内换行可能变空格，限制 caption 检测能力 |
| 全文缓存 | `FullText.getItemCacheFile(attachment).path` | 异步读取，且比较缓存 mtime 与 PDF mtime；不读取 SQLite schema |
| 附件 | `xpcom/data/item.js`: `getBestAttachment`, `getAttachments`, `getFilePathAsync`, `isPDFAttachment`, `isStoredFileAttachment` | deterministic 规则封装在 core.js |
| 通知 | `xpcom/notifier.js`: `registerObserver`, `trigger('refresh','item',ids,...)` | 合并刷新受影响行，不发送伪造 bibliographic modify |
| 生命周期 | `xpcom/plugins.js` | bootstrap startup/shutdown/main-window load/unload，注册 chrome 资源；disable 清理 observer、worker、timer、UI |
| Manifest | `modules/Extension.sys.mjs`, `modules/addons/XPIDatabase.sys.mjs` | 实机强制 id、update_url、strict_max_version；update URL 必须 HTTPS，否则 appDisabled |
| 本地偏好 | `Zotero.Prefs.get/set/registerObserver` 的 global=true | 仅写入本插件命名空间的选项 |

没有使用 windingwind 模板或 toolkit；无需引入它们的兼容性和供应链依赖。没有 XUL overlay、item-tree monkey patch、直接 DB SQL 或网络 PDF 处理。唯一手工 DOM 元素是可取消的批次进度按钮；列、侧栏和菜单均由官方 manager 管理。

列 API 的源码类型签名把 provider 返回值定义为 string，所以没有假装传入 number 就能数值排序。排序编码和真实显示分开，unknown 仍然是空字符串。

Zotero 10 的 `attachmentText` getter 在 cache 不完整时也会调用 PDF worker，但它只返回 string，不返回提取覆盖率，因此没有选它作为统计主路径。

## 测试隔离说明

仅向工作区 `tests/host/` 写入测试 profile、数据目录及合成 PDF；生产 XPI 通过 profile extensions 目录装入。测试过程中 AddonManager 的停用/启用只针对该隔离 profile 中的测试插件。初次启动独立 profile 时 Zotero 自身尝试初始化 Word 集成并报安装失败；后续测试显式设置该 profile 的 Word/LibreOffice `skipInstallation`，没有代用户操作个人文库或安装生产插件。

## 待核实

- 真实论文大样本的图表 precision/recall、复杂双栏/补充材料/多语言/OCR 场景；当前只声明 caption heuristic。
- Windows 以外平台与 Zotero 10 以外主版本。
- 1,000–10,000 条目端到端耗时与峰值内存。队列有界与 provider 不解析 PDF 有测试，但不是大型文库性能基准。
- 正式公开发布的更新域名、签名、维护者和更新服务。当前是本地可安装 MVP，手动更新。

## 已准备但未执行

已准备生产 XPI、源码、自动测试与安装说明；未向用户日常 profile 安装插件，未导入/合并/删除或修改现有文库条目。

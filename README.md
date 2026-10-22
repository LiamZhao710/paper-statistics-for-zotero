# Paper Statistics for Zotero

Zotero 10 的本地 PDF 统计插件，使用官方 item-tree columns、ItemPaneManager、MenuManager 和 Notifier。当前版本 **0.2.0**，安装文件位于 `dist/paper-statistics-0.2.0.xpi`。

## 从 0.1.0 升级

通过下面的“从文件安装”直接选择新版 XPI，可覆盖同 ID 的旧版，无需先卸载。新版新增 **Statements、Algorithms、Numbered Equations** 三列；安装后在列表表头勾选。旧统计缓存会因算法版本升级自动失效，在访问相应条目时后台重算，也可多选后右键“重新计算论文统计”。原版 XPI 与源码包仍保留在 dist 目录中。

## 安装与使用

1. 在 Zotero 打开 **工具 → 插件（Plugins）**。
2. 点击齿轮菜单，选择 **Install Add-on From File… / 从文件安装插件**，选择本项目的 XPI。
3. 在文库列表表头右键，勾选 **PDF Pages、Words、Figures、Tables、Statements、Algorithms、Numbered Equations**。
4. 选中论文，在右侧展开 **论文统计 / Paper Statistics**；也可以右键单篇或多选条目，选择 **计算论文统计** 或 **重新计算论文统计**。
5. 批次运行时，文库底部显示进度，点击即可取消；右键菜单及统计侧栏也可取消。

尚未计算时列为空，结果在后台完成后刷新；没有本地 PDF、扫描版没有可提取文字、损坏 PDF 的未知数值显示为空或 `—`。取消会跳过未开始的任务并丢弃本批次尚未提交的结果；Zotero 共享 PDF worker 已开始的任务会完成返回，不支持硬中断。

侧栏可勾选 **Include supplementary figures and tables**（默认开启）与 **Experimental references**（默认关闭）。开启 References 后，如需在列表中查看，还需勾选 References 列。本版本通过新 XPI 手动更新。

## 数值含义

| 指标 | 含义 |
|---|---|
| PDF Pages | 实际 PDF 总页数，绝不使用书目字段的 `123–137` 换算 |
| Words | PDF 提取文本中的词数，包含标题、图表说明和参考文献；不是出版社的正文专用字数 |
| Figures | caption 启发式检测得到的唯一图编号；`3(a)` 与 `3(b)` 合并为 `3` |
| Tables | caption 启发式检测得到的唯一表编号；`III` 与 `3` 合并 |
| Statements | Proposition + Theorem + Lemma + Corollary 合计；不计 Definition，侧栏按四类列出数量和编号 |
| Algorithms | 按 Algorithm 标题及唯一编号统计，Roman/Arabic 编号归一化 |
| Numbered Equations | 带编号的独立公式；需要公式编号旁有数学表达式证据，不包含无编号或行内公式 |
| References | 实验功能：独立 References/Bibliography 标题后的连续编号条目；不可靠时留空 |

英文、Unicode 字母、H2O 等含字母数字词、缩写、连字符词和缩合词可以计数；纯数字与明显 URL/DOI 不计入词数。执行 Unicode NFKC 归一化、明显换行断词修复，并在至少三页中尝试去掉高度重复的页眉页脚。不是中文分词器，也不保证数学公式、双栏阅读顺序或 PDF 字体编码异常时的人工计数一致性。

Words 等文字相关指标在提取覆盖不完整或未知时显示 `~`，鼠标悬停说明覆盖情况；侧栏显示例如 `Partial (100 / 184 pages extracted)`。`Complete` 仅表示所有页面已经过文字提取，**不表示 OCR 完整、图表检测准确或等同于出版社统计口径**。

图表检测支持 Fig./Figure/FIG.、S1 等补充编号，以及 TABLE I/II/III。它会避开常见正文引用，并按编号去重，但仍可能漏掉被提取器拆散的 caption，或把段首引用误识为 caption。侧栏列出检测到的编号，便于核对。无 caption 的图像不计数；有可提取正文但未找到 caption 时，0 表示“检测到 0 个 caption”。

**命题/定理类**：支持英文 Proposition、Theorem、Lemma、Corollary，以及中文命题、定理、引理、推论标题。Definition/定义、Assumption、Remark、Example、Proof 等不计入。编号条目按“类型 + 编号”去重，因此 Theorem 1 和 Lemma 1 各计一个；Theorem 1 重复提及不额外计数。支持 2.1、A.1 等编号，以及显式无编号标题（例如 `Theorem:` 或 `Lemma (Convergence).`）；无编号标题按出现位置计数。侧栏列出四类数量及检测标签。

**算法**：按段首 Algorithm/算法 标题识别；同编号的重复标题合并，Algorithm I 与 Algorithm 1 归一为一个。显式无编号 Algorithm 标题也可识别；普通“algorithm”单词或 `Algorithm 9 is used...` 等正文引用不会作为新算法统计。

**公式口径**：只统计文本中可识别的、带编号的独立公式，例如 `x = y + 1 (1)`、`f(x) ≤ 1 (A.1)`；编号被提取到紧邻的单独行时，会检查相邻数学表达式。重复编号只计一次，`(2a)` 和 `(2b)` 计两个。无编号公式、行内公式、图片中的公式不计入；单纯 `(1)` 引用、年份、列表标号不直接计数。因此 **Numbered Equations 不是论文中全部数学表达式的总数**。公式行被 PDF 提取器并入正文、符号丢失时可能漏计。

这三项均为本地文本结构启发式检测；段首引用措辞、独立编号、复杂跨栏顺序可能造成误判。侧栏提供检测编号与计数范围，便于人工复核。识别不到的编号不会根据“最大编号”推算总量；参考文献段中的标题不计入，附录中的结构继续统计。

References 只接受从 1 开始、至少三个、无间断无重复的 `[1]` 或 `1.` 条目；author-year、复杂跨栏重排和其他不确定情况返回未知。默认不运行，默认隐藏该列。

## PDF 选择与自动更新

封装的 primary-PDF 规则：优先采用 Zotero `getBestAttachment()` 给出的本地可用 PDF；否则优先 stored PDF，再按 attachment ID 升序选择本地可用 PDF。独立 PDF 附件也可统计。缺失的云端附件不会由插件主动下载；PDF 的选择和文件读取均在后台进行。

缓存先存内存，再原子写入 Zotero 数据目录的 `paper-statistics/cache-v1.json`，保存 attachment ID/key/library、mtime、size、算法版本、设置指纹和时间。**不保存 PDF 全文，不改写 Extra、书目字段或主数据库表。** 文件时间或大小变化、算法升级、设置变化时缓存失效；Notifier 响应附件/条目增删改，另外每 60 秒通过有界队列检查本会话已访问条目的本地文件。文字覆盖不完整/未知的记录每五分钟可重试。需要立即重算时使用右键菜单。

mtime 与 size 同时保持不变的刻意文件替换不会被自动发现；此时请手动重算。极大 PDF 的文件缓冲区仍受 Zotero 自身 worker 内存限制。队列最多两个任务并发，Zotero 自身的共享 PDF worker 还可能进一步串行化。

## 隐私与数据

统计完全在本机完成，不上传 PDF，不使用 LLM、云端 OCR、API key 或遥测。完整且新鲜的 Zotero 全文缓存会被复用；不完整时调用 Zotero 的全页 PDF worker，**不会为了统计而重新建立 Zotero 全文索引**。卸载插件不会删除 PDF；保留的插件缓存可在关闭 Zotero 后自行删除。

宿主强制要求 manifest 包含 HTTPS `update_url`。本地发行包使用端口 0 的 HTTPS loopback 占位地址，不连接外部更新服务；宿主的“检查插件更新”可能提示更新检查失败。正式公开发布时应替换为发行者自己的 HTTPS update manifest。没有更改宿主的更新安全检查设置。

## 构建与验证

无需 npm 安装或第三方依赖，Node 18+ 与 Python 3 即可：

```powershell
node --test tests/*.test.cjs
python scripts/build.py
```

build 生成确定性的 ZIP 格式 XPI 和 SHA-256；包根目录直接包含 `manifest.json` 与 `bootstrap.js`。源码在 `src/`，算法与提取服务测试在 `tests/`。安装包只包含 `src/` 的运行文件。

真实宿主测试（Windows、Zotero 10）：

```powershell
python scripts/make_fixtures.py
python scripts/build.py
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-host-test.ps1 -ZoteroExe 'D:\Program Files\Zotero\zotero.exe'
```

该测试在 **本项目 `tests/host/profile` 与 `tests/host/data`** 中装入生产 XPI 和独立测试 helper，创建合成测试条目，验证提取、列、侧栏、排序、缓存、取消及停用/启用。只停止命令行匹配此测试 profile 的进程。不要把测试 helper 安装到个人文库；不要把普通文库数据复制到该目录。测试宿主自身可能进行 Zotero 常规初始化联网，插件统计代码没有网络调用。

只读诊断可在 Zotero「工具 → 开发者 → Run JavaScript」运行：

```javascript
const api = Zotero.PaperStatistics;
return api ? { columns: api.columnIDs, section: api.sectionID,
  selected: Zotero.getActiveZoteroPane().getSelectedItems().map(item => ({
    id: item.id, statistics: api.getRow(item.id)
  })) } : "Paper Statistics is not active";
```

兼容范围仅声明 Zotero **10.0.x**；审计记录见 `audit/ENVIRONMENT.md`，验证结果见 `TEST-REPORT.md`。未对 Zotero 7–9、11 beta、其他操作系统及大规模真实论文集合进行完整回归。

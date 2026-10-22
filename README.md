# Paper Statistics for Zotero

Paper Statistics for Zotero 0.3.0 是一个本地运行的 Zotero 插件，用于在条目列表与统计侧栏中显示论文的统计信息。插件不上传 PDF 或个人文库，不使用 LLM、OCR、遥测或 API key。

## 兼容性

- 仅声明支持 Zotero 10.0.x。
- 安装文件：`dist/paper-statistics-0.3.0.xpi`。
- 与 0.1 / 0.2 使用同一插件 ID，可直接覆盖安装，无需先卸载；旧版本发行文件保留。

## 安装

1. 打开 Zotero，进入「工具 → 插件」。
2. 点击齿轮按钮，选择「从文件安装」。
3. 选择 `dist/paper-statistics-0.3.0.xpi` 完成安装。

## 设置入口

可通过以下任一方式打开显示设置：

- 「工具 → Paper Statistics 显示设置…」
- Zotero 设置中的「Paper Statistics / 论文统计」
- 统计侧栏中折叠的「显示设置（只显示勾选项）」

设置自动保存、立即生效，重启后保留。显示切换不会重新解析 PDF。

## 可显示的统计项

默认仅显示 **PDF Pages、Words、References** 三项。全部八个可选项为：

- PDF Pages
- Words
- Figures
- Tables
- Statements
- Algorithms
- Numbered Equations
- References

统一勾选同时控制插件列表列和侧栏数值。取消勾选会注销对应插件列，不占空列，也不出现在宿主表头属性菜单中。选中列由插件勾选设置统一管理；Zotero 自带的标题、作者、年份列仍使用宿主表头菜单。允许不勾选任何统计项，此时侧栏设置入口仍然保留。

设置页提供「常用三项」「全选」「全部隐藏」快捷操作。检测明细、覆盖率、PDF 文件名、时间、编号等信息位于默认折叠的「检测明细与统计口径」区域。

## 统计口径说明

### References

References 默认启用，忽略旧版实验开关。支持独立参考文献标题：References、Bibliography、Literature cited、参考文献及编号标题。数字条目 `[1]`、`(1)`、`1.`、`1)` 均可识别，正文中重复引用不会多算；相同编号去重。仅当编号连续从 1 开始时给出正常数字；编号空缺、冲突、无标题或扫描件无法识别时显示未知，不用最大编号冒充条目数。作者—年份制在至少识别出三个条目时给出估计数，始终带 `~`（例如 `~42`），可在设置中禁用该估计。侧栏明细会解释检测方法和未知原因。

References 不是从 Zotero 关联条目数、Crossref 或在线数据库读取的文献数。

### 其他统计

- **PDF Pages**：PDF 实际页数，不等于书目页码范围。
- **Words**：基于提取文本，包含参考文献与图注，非出版社正文口径。
- **Figures / Tables**：基于 caption 唯一编号的启发式统计。
- **Statements**：合计 Proposition / Theorem / Lemma / Corollary，排除 Definition，明细中分类展示。
- **Algorithms**：按标题去重。
- **Numbered Equations**：只统计带编号的独立公式，不包含行内、无编号或图片公式。

新检测仍为启发式，没有真实论文大样本准确率保证。

## 运行方式

- 完全本地运行，不上传 PDF 或个人文库。
- 优先复用新鲜完整的 Zotero 全文缓存；不完整时使用 Zotero 原生 PDF worker 请求全文，不重写用户全文索引。
- partial 或 unknown 覆盖时显示 `~` 或未知。
- 后台并发为 2，批次可取消；Zotero 共享 worker 已开始的提取不能硬中断。
- 缓存只保存统计、编号与文件指纹，位于数据目录 `paper-statistics/cache-v1.json`，不写入 Extra、书目字段或主表。
- 算法升级至 3 时缓存自动失效；替换文件由 mtime 和 size 失效；每 60 秒验证会话访问项。
- 无 PDF 不当作 0，无文字不假装准确。

如果替换文件时 mtime 与 size 都刻意保持不变，请手动重新计算。没有 OCR 或真实论文大样本性能基准，特别大的 PDF 仍受 Zotero 原生 worker 的内存限制。开启全部属性后列表可能需要横向滚动；可通过“常用三项”恢复简洁布局。

## 手动计算

右键单篇或多选条目，选择「计算论文统计」或「重新计算论文统计」。

## 更新说明

插件无网络在线更新服务。宿主需要 HTTPS `update_url`，因此本地发行包使用 loopback 端口 0 占位，采用手动 XPI 更新；检查插件更新可能失败。

## 构建与测试

依赖 Node 18+ 与 Python 3，无第三方依赖。

```bash
node --test tests/*.test.cjs
python scripts/build.py
```

宿主验证脚本：

```bash
python scripts/make_fixtures.py
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-host-test.ps1 -ZoteroExe 'D:\Program Files\Zotero\zotero.exe'
```

宿主测试仅在 `tests/host/profile` 与 `tests/host/data` 中创建合成条目，不能把测试 helper 装进个人文库。测试详情参见 `TEST-REPORT.md`。

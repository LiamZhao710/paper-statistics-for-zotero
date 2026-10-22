# Paper Statistics for Zotero

Paper Statistics for Zotero 0.4.1 是一个本地运行的 Zotero 插件，用于在条目列表与统计侧栏中显示论文的统计信息。插件不上传 PDF 或个人文库，不使用 LLM、OCR、遥测或 API key。

## 兼容性

- 仅声明支持 Zotero 10.0.x。
- 安装文件：`dist/paper-statistics-0.4.1.xpi`。
- 与 0.1 / 0.2 / 0.3 使用同一插件 ID，可直接覆盖安装，无需先卸载；旧版本发行文件保留。

## 安装

1. 打开 Zotero，进入「工具 → 插件」。
2. 点击齿轮按钮，选择「从文件安装」。
3. 选择 `dist/paper-statistics-0.4.1.xpi` 完成安装。

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

References 默认启用，忽略旧版实验开关。支持独立参考文献标题：References、Bibliography、Literature cited、参考文献及编号标题。数字条目 `[1]`、`(1)`、`1.`、`1)` 均可识别，正文中重复引用不会多算；相同编号去重。编号完整且从 1 开始时给出正常数字；少量编号缺失但证据足够时，给出带 ~ 的已识别条目数估计；编号稀疏、冲突、无标题或扫描件无法识别时显示未知，不用最大编号冒充条目数。作者—年份制在至少识别出三个条目时给出估计数，始终带 `~`（例如 `~42`），可在设置中禁用该估计。侧栏明细会解释检测方法和未知原因。

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
- 算法升级至 4 时缓存自动失效；替换文件由 mtime 和 size 失效；每 60 秒验证会话访问项。
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

## 参考文献排障与手动编辑

**旧缓存与重新计算。** 旧缓存可能仍保存早期“参考文献统计关闭”的结果。安装 0.4.1 后，选中文献，右键选择“重新计算论文统计”；也可 Ctrl+A 多选后重算。插件不会代用户操作文库。

**PDF 文字提取的局限。** 提取时可能把多个参考文献条目合并为同一段，或使标题与正文连在一起。旧版只认行首编号或连续编号，遇到这类情况会留空。0.4.1 能识别合并段中的方括号编号、带空格的编号与标题，并优先采用真实参考文献标题。编号有少量缺失但足够连贯时，只给出“已识别条目数”的约数（~），不根据最大编号推断总数。扫描件、严重缺字或结构不明时仍可能显示未知。本插件不承诺出版商级精度。

**手动填写统计项。** 默认紧凑显示与 8 个可选统计项沿用 0.3.0：页数、词数、图、表、命题类、算法、编号公式、参考文献。八项均可手动填数，需先勾选想显示或编辑的项。

**操作方式。** 选中条目，在论文统计侧栏展开“手动修改统计（留空使用自动值）”，填写非负整数，点击“保存人工值”。0 合法，负数与小数会被拒绝。人工值显示为 `42*` 并带“人工”标记，列表仍按数值排序。自动提取覆盖率不会因人工填写被改成 complete；单独填写某项不影响其他项。

**重新计算与恢复。** 重新计算不会覆盖人工值。清空对应输入并保存可恢复该项自动值；“恢复全部自动统计”清除当前条目所有人工覆盖。没有 PDF 也可填写，未知项恢复后回到 —。后台刷新尽量保留未保存输入。人工修改不改变 Zotero 原生书目字段和 PDF。

**数据存放。** 人工数据保存在 Zotero 数据目录的 `paper-statistics/manual-overrides-v1.json`，与可重建的自动缓存分离。数据按 libraryID/itemKey 绑定当前条目，父论文与附件是不同条目，不自动共享；重启后保留，更换 PDF 后请自行核对。复制或导出条目、同步到其他设备不会自动携带该文件，只保存在本机插件数据中。

**本地运行。** 插件完全本地运行，不上传 PDF 或文库，也不使用 LLM。开发文档辅助不构成插件依赖。

## 许可证

从 **0.4.1** 起，本项目采用 **GNU AGPL v3，仅此版本（SPDX：AGPL-3.0-only）**。完整正文见 [LICENSE](LICENSE)，项目许可声明和源码获取方式见 [NOTICE](NOTICE)。

允许使用、修改和商业使用；分发受本许可覆盖的版本时，应遵守保留声明、同许可分发和提供对应源码等义务。修改后的程序若通过网络与用户交互，还应按第 13 条提供对应源码的获取机会。此处仅为说明，具体以许可证正文为准。使用不要求 Star、捐赠或 GitHub 登录；私人仓库及下载文件的访问权限另行控制。

**0.1.0—0.4.0 历史版本仍采用原 MIT 许可**，原标签和安装包保持不变，旧许可文本另存于 [LICENSES/MIT.txt](LICENSES/MIT.txt)。更改当前许可证不撤销已授予的旧版本许可。

对应源码随同版本 Release 提供 `paper-statistics-0.4.1-source.zip`，也可从仓库的匹配标签获取：<https://github.com/LiamZhao710/paper-statistics-for-zotero>。源码包含构建脚本，运行 `python scripts/build.py` 可生成 XPI。

# 验证报告

日期：2026-10-22（Europe/Berlin）。生产版本：0.2.0。目标：Zotero 10.0.x。

## 已确认

- 28 项 Node 自动测试通过，覆盖原有统计、命题分类/定义排除、结构标题去重、Roman/分节/附录编号、正文引用排除、编号公式/子公式、跨页边界、partial/unknown 标识及旧算法缓存失效。
- **Zotero 10.0.6 真实宿主中 34 项集成断言通过**。直接加载生产 XPI，不是只运行 mock。
- 三页合成 PDF 提取结果：**3 pages / 43 words / 2 figures / 2 tables**。对应书目 pages 字段设置为 123–137，确认未用于页数统计。
- 新增合成 PDF 的实际提取结果：**4 statements（Proposition、Theorem、Lemma、Corollary 各 1）/ 2 algorithms / 4 numbered equations**；Definition 和普通正文引用被排除。新三列和侧栏分类/编号/范围说明已验证。
- 先将全文索引限制为 1/3 页；插件得到完整 3/3 页文本，同时原索引仍是 1/3，确认统计过程没有重写索引。
- 覆盖无附件、空白 PDF、损坏 PDF、外部替换 PDF、宿主 collation 数值顺序、实际 HTML cell、真实侧栏 DOM、批次取消、AddonManager 停用清理/重新启用及持久缓存命中。
- 所有写入测试只发生在工作区 tests/host 的独立数据目录；没有向用户日常 profile 安装生产插件。
- XPI ZIP 结构、完整性与 manifest 已检查。XPI SHA-256：`893ad87d06882924fcbb21ea49bbd507c2ad30055bd023648b988d88a3394804`。

## 发现并修复

- 以实际 application.ini / runtime 确认版本，避免使用过时的注册表 9.0 信息。
- 处理 Zotero 10 强制要求的 HTTPS update_url；本地包使用不可用的 loopback 端口 0，不依赖外部更新服务，不降低宿主更新安全检查。
- 对 stale fulltext cache 不复用旧页数元数据；partial/unknown 永不显示成精确文字统计。
- 修复 Fluent 正文值会替换 collapsible-section 子元素的问题；标题只提供属性型翻译，真实 DOM 回归通过。
- 区分停用与应用退出，避免应用退出期间发起不必要的列注册变更；停止操作幂等。
- 升级算法版本到 2，使 0.1.0 缓存不能冒充含新统计量的记录；原版发行文件保留。

## 待核实与限制

- Figures/Tables 是文本 caption 启发式结果，不是视觉检测或出版商级准确率保证。References 默认关闭，author-year 返回未知。
- 新增结构数量同样是文本启发式结果；Statements 包含四类、不含定义；公式仅为带编号独立公式，**未统计无编号/行内/图片公式**。尚未以真实论文大样本评估准确率。
- 空白页扫描件没有 OCR；完整覆盖只表示每页均尝试文字提取。
- 没有用个人 PDF 做统计回归；没有 10,000 篇端到端性能基准。最大并发为 2，原生 PDF worker 内存限制仍存在。
- 其他操作系统和 Zotero 主版本未声明兼容。宿主本身的初始化/退出警告不计为插件检测精度测试。

## 已准备但未执行

生产插件安装、向个人文库应用统计、公开发布与在线更新服务配置。

证据：`reports/unit-tests.txt`、`reports/host-integration.json`、`audit/source-hashes.json`；测试代码与合成 PDF 生成脚本一并提供。

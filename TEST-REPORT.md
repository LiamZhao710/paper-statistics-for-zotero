# 验证报告

日期：2026-10-23（Europe/Berlin）。生产版本：0.4.1。目标：Zotero 10.0.x。

0.4.1 起采用 AGPL-3.0-only，XPI 包含完整 LICENSE 与 NOTICE，源码发行包提供对应源码和构建脚本。0.1.0—0.4.0 原 MIT 发行包保持不变；此次功能与算法版本不变。

## 已确认

- 52 项 Node 自动测试通过，新增合并参考文献段落、空格标题/编号、不完整编号估计、人工值校验/标记/排序/未知恢复；同时回归原有统计与显示选择。
- **Zotero 10.0.6 真实宿主中 63 项集成断言通过**。直接加载生产 XPI，不是只运行 mock。
- 三页合成 PDF 提取结果：**3 pages / 43 words / 2 figures / 2 tables / 3 references**。对应书目 pages 字段设置为 123–137，确认未用于页数统计。
- 新增合成 PDF 的实际提取结果：**4 statements（Proposition、Theorem、Lemma、Corollary 各 1）/ 2 algorithms / 4 numbered equations**；Definition 和普通正文引用被排除。新三列和侧栏分类/编号/范围说明已验证。
- 作者—年份制 PDF 得到 **~3 References**，即使全文提取完整也保留估计标记；编号制参考文献默认启用。
- 真实侧栏勾选与 Zotero 设置页 preference 绑定均已验证；取消项不注册列表列、不显示侧栏数值，全部隐藏后保留设置入口。选项在插件停用/重新启用后保留，显示切换不重算 PDF。
- 真实侧栏人工填写 References=42 后显示 42*（人工），原始自动值仍为 3；错误负数被拒绝。重算、插件停用/重新启用后保留人工值；恢复操作回到原有 ~3 自动估计。无 PDF 可人工填写，清除后恢复未知；未修改书目字段。
- 人工值单独存于 manual-overrides-v1.json，按当前条目身份保存，父条目与附件不自动共享。后台刷新保留尚未保存的编辑草稿。
- 先将全文索引限制为 1/3 页；插件得到完整 3/3 页文本，同时原索引仍是 1/3，确认统计过程没有重写索引。
- 覆盖无附件、空白 PDF、损坏 PDF、外部替换 PDF、宿主 collation 数值顺序、实际 HTML cell、真实侧栏 DOM、批次取消、AddonManager 停用清理/重新启用及持久缓存命中。
- 所有写入测试只发生在工作区 tests/host 的独立数据目录；没有向用户日常 profile 安装生产插件。
- XPI ZIP 结构、完整性与 manifest 已检查。XPI SHA-256：`b17a6be40a19f965f7331832bc7ca3baeec006d6e512982f7f5187381570e9c9`。

## 发现并修复

- 以实际 application.ini / runtime 确认版本，避免使用过时的注册表 9.0 信息。
- 处理 Zotero 10 强制要求的 HTTPS update_url；本地包使用不可用的 loopback 端口 0，不依赖外部更新服务，不降低宿主更新安全检查。
- 对 stale fulltext cache 不复用旧页数元数据；partial/unknown 永不显示成精确文字统计。
- 修复 Fluent 正文值会替换 collapsible-section 子元素的问题；标题只提供属性型翻译，真实 DOM 回归通过。
- 区分停用与应用退出，避免应用退出期间发起不必要的列注册变更；停止操作幂等。
- 升级算法版本到 4，使旧参考文献检测缓存失效；修复只读行首编号导致合并段落遗漏的问题。原版发行文件保留，人工值不受自动算法升级影响。
- 说明文档初稿由 DeepSeek Flash API 根据非敏感功能规范生成，主助手复核，调用记录不含密钥。插件自身仍 local-only，不包含 LLM/API 依赖。

## 待核实与限制

- Figures/Tables 是文本 caption 启发式结果，不是视觉检测或出版商级准确率保证。References 默认开启，作者—年份或编号有少量缺失只提供带 ~ 标记的估计；冲突、稀疏或不足证据时返回未知。
- 新增结构数量同样是文本启发式结果；Statements 包含四类、不含定义；公式仅为带编号独立公式，**未统计无编号/行内/图片公式**。尚未以真实论文大样本评估准确率。
- 空白页扫描件没有 OCR；完整覆盖只表示每页均尝试文字提取。
- 其他操作系统和 Zotero 主版本未声明兼容。宿主本身的初始化/退出警告不计为插件检测精度测试。

## 已准备但未执行

生产插件安装、向个人文库重新计算或写入人工值、公开发布与在线更新服务配置。

证据：`reports/unit-tests.txt`、`reports/host-integration.json`、`audit/source-hashes.json`；测试代码与合成 PDF 生成脚本一并提供。

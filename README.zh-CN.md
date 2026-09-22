<div align="center">
  <img src="public/icons/paperflow-128.png" width="72" height="72" alt="PaperFlow AI 图标">
  <h1>PaperFlow AI</h1>
  <p><strong>陪伴每一篇论文的持久化 AI 研究助手。</strong></p>
  <p>保留浏览器原有 PDF 阅读体验，为论文增加理解、推理与记忆。</p>
  <p><a href="README.md">English</a> · <strong>简体中文</strong></p>
</div>

> [!IMPORTANT]
> PaperFlow AI 1.0.0 是本地优先的个人文献库、PDF 阅读与批注工作台和
> AI 研究助手。可选的 Google Drive 端到端加密同步无需 PaperFlow 后端，
> 即可在另一台电脑恢复同一资料库。

## 为什么做 PaperFlow

PaperFlow 不是普通的 ChatPDF。它既能通过 Chrome Side Panel 运行在现有阅读器旁边，也能在自己的集成式 Reader 中打开 PDF，让页码、划词、Citation 和 AI 上下文真正联动。

每一篇论文都将拥有独立且长期存在的工作空间：

```text
Paper
├── metadata 与统一身份
├── conversations
├── selections 与 notes
├── paper memory
└── reading state
```

即使几天后从另一个来源重新打开同一篇论文，只要身份可以识别，就能继续之前的思考。

## 个人文献库

- 集合/子集合、标签、星标、阅读状态、回收站、批量操作与重复项确认
- 面向大型资料库的虚拟化高密度表格与字段筛选语法
- Markdown 笔记、批注摘要、PDF 附件和每篇论文独立的 AI 记忆
- BibTeX/RIS 导入导出，以及 APA、MLA、Chicago、IEEE、BibTeX 复制
- AI 整理建议必须由用户确认，确认前不会修改分类
- IndexedDB + OPFS 本地优先存储；仅正式收藏的论文进入加密同步，
  临时 Workspace 只保留在当前设备

## 集成式 Reader

- 提供 `reader.html?url=<encoded-pdf-url>` 远程 PDF 入口和本地 PDF 选择器
- PDF.js 连续按需渲染，支持文字层、缩略图、目录、搜索跳页、缩放、适合宽度、下载和打印
- 当前页追踪、键盘操作、窄窗口自动适配，以及不改变 PDF 原色的浅色/深色阅读背景
- 右侧复用现有 PaperFlow AI 工作区，并支持拖动调整宽度
- 划词后可提问、解释、翻译、总结或保存
- 基于 PDF 原生坐标的高亮、下划线、删除线、文本、区域和手写六类批注
- 批注评论、颜色、删除、缩放后稳定定位和离线重开
- 使用 `pdf-lib` 导出带批注 PDF 副本，文本评论写入标准 PDF 注释，并提供 JSON/Markdown 降级
- 通过 OPFS 显式离线保存 PDF，支持本地全文检索与按需中英文 OCR
- 分页结构化 Chunk；上下文优先级为选中文字、当前页、相关论文片段
- Citation 包含页码、标签和摘录，点击可跳转 Reader 对应页
- 对跨域、登录墙、缺失文件、加密 PDF 和无文字层 PDF 显示明确错误
- 右键“使用 PaperFlow 打开”，以及默认接管直接 PDF 的可选开关

## Side Panel 与 AI

- Chrome Manifest V3 Side Panel
- 自动识别 arXiv、OpenReview、直接 PDF 和兼容的 PDF Reader 标签页
- 对可访问的 arXiv/OpenReview PDF 自动提取正文
- 在 ChatGPT 风格的 Composer 菜单中上传 PDF、TXT、Markdown 和图片
- 两种 Provider：通过官方 Codex CLI 使用 ChatGPT 订阅，或通过 Responses API 使用 OpenAI API Key
- API Key 存入操作系统凭据库，不进入 Chrome 扩展存储
- 可自定义 API Base URL、模型 ID，并切换 Responses / Chat Completions 格式
- 界面语言与回答提示词语言可以分别切换中文或英文
- 用户消息支持气泡边界、复制和编辑后重新发送；回答支持复制、重新生成、保存到记忆、标签与本地反馈
- ChatGPT 订阅模式显示实时运行阶段，API 模式逐字流式生成回答
- 订阅模式采用低推理延迟配置，并限制累计历史上下文，避免对话越长越慢
- 通过 IndexedDB 按论文保存 papers、aliases、threads、messages、memory、selections、annotations、settings 和阅读状态
- Google Drive `drive.file` 适配器与端到端加密保险库，支持独立密码、恢复密钥和可选的系统凭据库解锁
- 加密增量同步：不可变操作批次、快照、Drive Changes 游标、笔记冲突副本及 PDF 断点续传
- 自动迁移旧版 `localStorage` 对话与笔记
- 首次初始化与连接诊断页面
- 论文标题、作者、来源、页码和上下文状态
- 支持 Markdown 和表格的科研对话界面
- 论文页码 Citation 交互原型
- Selected Text 上下文预览
- Translate、Summarize、Key Points、Methodology、Limitations 快捷 Prompt
- 多 Thread 和 Conversation History 界面
- Paper Memory 页面
- Provider 与模型选择界面
- Light、Dark、System 主题
- 适配 360–440px 宽度
- 键盘导航、Focus 状态和 Reduced Motion

## 已知限制

- 订阅模式仍按请求调用 `codex exec`，后续应评估官方持久化 Codex App Server。
- 暂无可靠的停止生成与取消。
- 搜索可定位包含关键词的页面，但尚未实现完整结果列表和页内逐项跳转。
- 尚未实现 Citation 原文范围高亮。
- OCR 采用用户按需触发模式，单次最多处理 50 页。
- 登录墙或严格 CORS 限制的远程 PDF 需要先下载，再本地打开。
- 真实 Google Drive 双设备发布验收仍需要生产 OAuth Client ID；自动化测试使用内存双设备 Drive 适配器。
- 暂不包含团队协作、向量数据库和账号付费系统。

## 安装

### 环境要求

- Chrome 114 或更高版本（macOS、Windows 或 Linux）
- 订阅模式需要 ChatGPT 桌面应用或 Codex CLI；API 模式需要 OpenAI Platform API Key
- Node.js 20 或更高版本
- pnpm 10 或更高版本
- 从源码构建 Native Host 时需要 Rust stable

### 加载扩展

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/paperflow-ai.git
cd paperflow-ai
pnpm install
pnpm build
cargo build --release --locked --manifest-path native-host/Cargo.toml
# macOS
bash native-host/install/install-macos.sh
# Linux
sh native-host/install/install-linux.sh
# Windows PowerShell
.\native-host\install\install-windows.ps1
```

Google Drive 开发构建需要 Chrome Extension OAuth Client ID：

```bash
cp .env.example .env.local
# 在 .env.local 中设置 PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID
pnpm build
```

未设置 Client ID 时，本地开发构建仍可加载，但会明确显示 Drive
同步“未配置”；`vite build --mode release` 会直接失败。

然后：

1. 打开 `chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择生成的 `dist/` 文件夹
5. 固定 PaperFlow AI，点击工具栏图标打开 Side Panel
6. 右键 PDF 链接或 PDF 页面，选择“使用 PaperFlow 打开”进入集成式 Reader

安装脚本会为固定扩展 ID 注册 Rust Native Messaging Host。订阅模式仅使用固定参数调用官方 Codex CLI；API 密钥存入 macOS 钥匙串、Windows 凭据管理器或 Linux Secret Service。它不会读取 ChatGPT Cookie 或 Codex 认证文件。使用订阅模式前，请先在终端执行 `codex login`。

重新构建或安装后，请在 `chrome://extensions` 中点击 PaperFlow AI 的“重新加载”。如果 Chrome 找不到 Host，请重新运行对应平台安装器并重新加载扩展。安装路径、卸载命令和保留一个版本的 Python 回退说明见 [Native Host 文档](docs/native-host.md)。

开发预览：

```bash
pnpm dev
```

打开命令输出的 localhost 地址预览 Side Panel，或访问 `/reader.html` 查看 Reader 打开页；将宽度调整为 360–440px 可验证窄屏布局。

## ChatGPT 登录架构

PaperFlow 不会读取 ChatGPT Cookie、把 OAuth Token 交给扩展，也不会请求 ChatGPT 私有网页接口。

```text
Chrome Extension
       │ Chrome Native Messaging
       ▼
PaperFlow Rust Native Host
       │
       ├── codex login status
       ├── codex exec --json
       └── 系统凭据存储 → OpenAI 兼容 API
```

独立安装的本地 Bridge 将调用官方 Codex CLI，凭据由 Codex CLI 或操作系统凭据存储管理。详见[架构文档](docs/architecture.md)。

Google Drive 授权与 AI Provider 相互独立。OAuth Token 由 Chrome Identity
按 `drive.file` 范围管理；所有业务对象在上传前完成加密，保险库密码和恢复密钥不会发送给 Google。

## 隐私与安全

- 当前原型没有 Analytics 或 Telemetry
- Repository 不保存 API Key 或 OAuth Token
- 不读取 ChatGPT Cookie
- 不上传不必要的 PDF 内容
- 发送前清楚显示并允许控制 Paper Context
- 论文数据默认保存在本地
- Google Drive 同步为可选功能，仅使用 `drive.file`，上传内容为加密不透明对象
- 本地 OCR 不依赖运行时 CDN 或远程代码
- 数据库升级失败时进入只读恢复导出流程

请阅读[隐私说明](docs/privacy.md)、[安全策略](SECURITY.md)、
[保险库恢复指南](docs/vault-recovery.md)和
[迁移与回滚指南](docs/migration-and-rollback.md)。发布验证结果见
[v1.0.0 验收报告](docs/acceptance-report-v1.0.0.md)和
[发布检查清单](docs/release-checklist.md)。

## 开发

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm audit:release
pnpm test:e2e
pnpm package
```

欢迎贡献代码，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## Roadmap

- [x] Phase 1 — 高完成度 UI 原型
- [x] Phase 2 Alpha — 当前论文识别、本地存储和 PDF 附件
- [x] Phase 3 Alpha — Codex CLI Bridge 与 ChatGPT 登录
- [x] Phase 3.1 — 流式进度、API Provider 与双语提示词
- [x] Phase 4 MVP — Selection、Current Page、结构化 Paper Context
- [x] Phase 5 MVP — IndexedDB Memory、Citation、页码跳转
- [x] Phase 6 — PaperFlow Bridge 与 Codex CLI 登录
- [x] Phase 7 MVP — 集成式 PDF.js Reader

## 致谢

PaperFlow 的 Provider 与本地 Bridge 架构研究参考了开源项目 [AIdea for Zotero](https://github.com/Visterainer/aidea-zotero)。PaperFlow 是面向 Chrome 的独立实现，没有复制 AIdea 的源代码。

集成式 Reader 使用 Apache License 2.0 许可的 Mozilla PDF.js（`pdfjs-dist`），扩展包内包含 `pdfjs-LICENSE.txt`。Google Scholar PDF Reader 仅作为交互参考，本项目不包含 Google 扩展代码或资源。

## License

PaperFlow AI 源代码采用 Apache License 2.0，见 [LICENSE](LICENSE)。
打包的第三方依赖保留各自许可证，见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

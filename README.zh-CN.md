<div align="center">
  <img src="public/icons/paperflow-128.png" width="72" height="72" alt="PaperFlow AI 图标">
  <h1>PaperFlow AI</h1>
  <p><strong>陪伴每一篇论文的持久化 AI 研究助手。</strong></p>
  <p>保留浏览器原有 PDF 阅读体验，为论文增加理解、推理与记忆。</p>
  <p><a href="README.md">English</a> · <strong>简体中文</strong></p>
</div>

> [!IMPORTANT]
> PaperFlow AI 0.7.0 是本地 Reader MVP，同时提供原有 Side Panel 和扩展内 PDF.js 阅读器，并打通论文级 AI 上下文与持久化。

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

## Reader MVP

- 提供 `reader.html?url=<encoded-pdf-url>` 远程 PDF 入口和本地 PDF 选择器
- PDF.js 连续按需渲染，支持文字层、缩略图、目录、搜索跳页、缩放、适合宽度、下载和打印
- 当前页追踪、键盘操作、窄窗口自动适配，以及不改变 PDF 原色的浅色/深色阅读背景
- 右侧复用现有 PaperFlow AI 工作区，并支持拖动调整宽度
- 划词后可提问、解释、翻译、总结或保存
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
- API Key 存入 macOS 钥匙串，不进入 Chrome 扩展存储
- 可自定义 API Base URL、模型 ID，并切换 Responses / Chat Completions 格式
- 界面语言与回答提示词语言可以分别切换中文或英文
- 用户消息支持气泡边界、复制和编辑后重新发送；回答支持复制、重新生成、保存到记忆、标签与本地反馈
- ChatGPT 订阅模式显示实时运行阶段，API 模式逐字流式生成回答
- 订阅模式采用低推理延迟配置，并限制累计历史上下文，避免对话越长越慢
- 通过 IndexedDB 按论文保存 papers、aliases、threads、messages、memory、selections、annotations、settings 和阅读状态
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
- 选区与批注已持久化，但还没有绘制批注层或 Citation 原文范围高亮。
- 扫描型 PDF 可以阅读页面，但没有 OCR。
- 登录墙或严格 CORS 限制的远程 PDF 需要先下载，再本地打开。
- 暂不包含云同步、团队协作、向量数据库和账号付费系统。

## 安装原型

### 环境要求

- Chrome 114 或更高版本（macOS）
- 订阅模式需要 ChatGPT 桌面应用或 Codex CLI；API 模式需要 OpenAI Platform API Key
- Node.js 20 或更高版本
- pnpm 10 或更高版本

### 加载扩展

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/paperflow-ai.git
cd paperflow-ai
pnpm install
pnpm build
bash bridge/install.sh
```

然后：

1. 打开 `chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择生成的 `dist/` 文件夹
5. 固定 PaperFlow AI，点击工具栏图标打开 Side Panel
6. 右键 PDF 链接或 PDF 页面，选择“使用 PaperFlow 打开”进入集成式 Reader

安装脚本会把白名单 Native Messaging Host 复制到 `~/Library/Application Support/PaperFlow AI/` 并为固定扩展 ID 注册。订阅模式调用官方 Codex CLI，API 模式把密钥存入 macOS 钥匙串。它不会读取 ChatGPT Cookie 或 Codex 认证文件。

重新构建或安装后，请在 `chrome://extensions` 中点击 PaperFlow AI 的“重新加载”。如果看到 `Native host has exited`，再次运行 `bash bridge/install.sh`，重新加载扩展，并查看 `~/Library/Logs/PaperFlow AI/bridge.log`。

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
PaperFlow Bridge
       │
       ├── codex login
       ├── codex login status
       └── codex exec --json
```

独立安装的本地 Bridge 将调用官方 Codex CLI，凭据由 Codex CLI 或操作系统凭据存储管理。详见[架构文档](docs/architecture.md)。

## 隐私与安全

- 当前原型没有 Analytics 或 Telemetry
- Repository 不保存 API Key 或 OAuth Token
- 不读取 ChatGPT Cookie
- 不上传不必要的 PDF 内容
- 发送前清楚显示并允许控制 Paper Context
- 论文数据默认保存在本地
- 后续支持按论文导出和删除数据

接入 Provider 前请阅读 [SECURITY.md](SECURITY.md)。

## 开发

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
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

首次公开发布前确定开源许可证。

<div align="center">
  <a href="https://dai0-2.github.io/paperflow/">
    <img src="public/icons/paperflow-128.png" width="84" height="84" alt="PaperFlow 图标">
  </a>
  <h1>PaperFlow</h1>
  <p><strong>在发现论文的地方阅读，在阅读论文的地方思考。</strong></p>
  <p>为 Chrome 打造的浏览器原生研究工作区。</p>
  <p>无需离开浏览器，即可阅读、批注、提问、记忆和整理论文。</p>
  <p>
    <a href="https://chromewebstore.google.com/detail/paperflow-ai/dffiahjmpkmellmjijffpcofoahbccoc"><strong>添加到 Chrome</strong></a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="https://dai0-2.github.io/paperflow/"><strong>访问官网</strong></a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="#从源码构建"><strong>从源码构建</strong></a>
  </p>
  <p>
    <a href="README.md">English</a>
    &nbsp;·&nbsp;
    <strong>简体中文</strong>
  </p>
  <p>
    <a href="https://github.com/Dai0-2/paperflow/actions/workflows/build.yml"><img src="https://github.com/Dai0-2/paperflow/actions/workflows/build.yml/badge.svg" alt="构建状态"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-202020" alt="Apache 2.0 许可证"></a>
    <img src="https://img.shields.io/badge/version-1.0.10-326bd1" alt="版本 1.0.10">
    <img src="https://img.shields.io/badge/Chrome-MV3-347556" alt="Chrome Manifest V3">
    <img src="https://img.shields.io/badge/storage-local--first-606460" alt="本地优先存储">
  </p>
</div>

<a href="https://dai0-2.github.io/paperflow/">
  <img src="website/assets/paperflow-attention-reader.png" alt="PaperFlow Reader 正在显示 Attention Is All You Need，包含页面缩略图、批注工具与溯源助手">
</a>

## 让 PDF 成为工作区

研究过程常常被拆散在 PDF 阅读器、笔记、独立聊天窗口、浏览器标签页和文献管理器中。
PaperFlow 将这些环节重新组织在论文原文周围。

```text
Paper
├── 元数据与论文身份
├── 阅读状态
├── 批注与笔记
├── 与原文关联的对话
└── Paper Memory
```

在发现 arXiv 论文的地方直接打开，保留原始网址，并在同一个浏览器工作区中完成研究。
几天后再次打开，阅读位置、笔记、对话与保存的上下文仍然属于这篇论文。

## 始终连接原文的 AI

<img src="website/assets/paperflow-source-stage.png" alt="PaperFlow 展示问题、页码引用以及 PDF 中对应的原文位置">

划选文字、提出具体问题，并在文档旁获得简洁回答。PaperFlow 会结合选中文字、当前页与
论文相关片段构建上下文，结构化 Citation 可直接跳转到 Reader 中的引用页。

- 页码感知上下文，而不是脱离原文的聊天上传
- 支持 Markdown、表格与科研快捷提示的流式回答
- 通过官方 Codex CLI 使用 ChatGPT 订阅
- 支持自定义 Base URL 与模型 ID 的 OpenAI 兼容 API
- 扩展直连 API，API Key 仅保存在当前设备的浏览器配置中

## 直接在论文上思考

<img src="website/assets/paperflow-annotations.png" alt="PaperFlow 在论文原文上提供批注工具">

支持高亮、下划线、删除线、文本笔记、区域批注和手写。所有批注使用 PDF 坐标锚定，
缩放后仍能保持位置，并会随论文一起重新打开。

批注结果可导出为 PDF 副本、JSON 或 Markdown。对于需要处理的论文，还提供本地全文
搜索和按需中英文 OCR。

## 每篇论文都会记住

PaperFlow 将论文视为长期存在的研究对象，而不是一次性的聊天会话。

| 持久化上下文 | 保留内容 |
| --- | --- |
| 阅读 | 当前页、阅读位置和 Reader 状态 |
| 证据 | 划选、批注、评论与笔记 |
| 对话 | 多个 Thread、消息与页码引用 |
| 记忆 | 保存的洞见与精简论文上下文 |
| 身份 | 元数据与来源别名，用于识别同一篇论文 |

## 让论文形成研究系统

<img src="website/assets/paperflow-library-system.png" alt="PaperFlow 研究资料库，包含集合、标签、阅读状态、搜索与论文详情">

资料库采用适合扫描、比较和重复操作的高密度研究表格：

- 集合与子集合、标签、星标、阅读状态和阅读历史
- 字段搜索、重复项检查、回收站和批量操作
- BibTeX 与 RIS 导入导出
- APA、MLA、Chicago、IEEE 与 BibTeX 引用复制
- Markdown 笔记、批注摘要、附件与 Paper Memory
- 所有整理建议都必须经过用户确认，不会静默修改资料库

## 你的研究仍然属于你

PaperFlow 坚持本地优先，不运营文档后端。

```mermaid
flowchart LR
    B["Chrome + PaperFlow"] --> L["本地存储<br/>IndexedDB + OPFS"]
    L -. "可选 · 上传前加密" .-> D["你的 Google Drive"]
    B --> H["本地 Native Host"]
    H --> C["ChatGPT 订阅<br/>官方 Codex CLI"]
    B --> A["OpenAI 兼容 API"]
```

- 论文元数据、阅读状态、笔记、批注、对话和记忆默认保存在本地。
- 可选 Google Drive 同步仅申请最小 `drive.file` 权限，加密对象存放在用户自己的
  `PaperFlow` 文件夹中。
- 离线 PDF 备份独立控制，默认关闭。
- PaperFlow 不读取 ChatGPT Cookie，也不调用 ChatGPT 私有网页接口。
- 本地 OCR 不依赖运行时 CDN 或远程代码。

请阅读[隐私说明](docs/privacy.md)、[安全策略](SECURITY.md)和
[架构文档](docs/architecture.md)。

## 安装

### 使用核心工作区

[从 Chrome Web Store 安装 PaperFlow](https://chromewebstore.google.com/detail/paperflow-ai/dffiahjmpkmellmjijffpcofoahbccoc)。

PaperFlow 支持 macOS、Windows 和 Linux 上的 Chrome 114 或更高版本。
集成 Reader 可以打开本地与远程 PDF；arXiv PDF 会保留原始
`arxiv.org/pdf/...` 地址，PaperFlow 直接运行在页面中。

Reader、批注、研究资料库、本地存储和 Google Drive 同步安装扩展后即可使用，
不需要安装 Native Host。

### 选择 AI 连接方式

AI 是可选功能，只需选择一种方式：

| 连接方式 | 需要安装 |
| --- | --- |
| OpenAI 兼容 API，包括 DeepSeek | 只安装 Chrome Web Store 中的 PaperFlow |
| 通过 Codex 使用 ChatGPT 订阅 | PaperFlow、官方 Codex CLI、PaperFlow Native Host |

#### 方式 A：OpenAI 兼容 API

从 Chrome Web Store 安装 PaperFlow，打开“设置 > AI Provider”，选择
“OpenAI 兼容 API”，填写 Base URL、API Key 和模型即可。

不要下载 Native Host，不要克隆 GitHub 仓库，也不需要安装 Codex CLI、Rust 或
Visual Studio。API Key 只保存在当前设备的扩展本地存储中，不会同步。

#### 方式 B：Windows 使用 ChatGPT 订阅

1. 从 Chrome Web Store 安装 PaperFlow。
2. 如果执行 `npm.cmd --version` 提示找不到命令，先安装 Node.js：

   ```powershell
   winget install --id OpenJS.NodeJS.LTS -e
   ```

3. 重新打开 PowerShell，安装官方 Codex CLI：

   ```powershell
   npm.cmd install -g @openai/codex
   ```

4. 登录 GitHub，打开
   [main 分支成功的构建记录](https://github.com/Dai0-2/paperflow/actions/workflows/build.yml?query=branch%3Amain+is%3Asuccess)。
5. 点击第一条带绿色对勾的构建记录，滚动到页面底部的 **Artifacts** 区域，只下载
   **`paperflow-native-host-windows`**。
6. 解压下载的 ZIP，确认文件夹中包含 `paperflow-host.exe` 和
   `install-windows.ps1`。
7. 在这个解压后的文件夹中打开 PowerShell，执行：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1
   ```

8. 完全关闭并重新打开 Chrome，在 PaperFlow 中选择
   “ChatGPT 订阅 > 登录 ChatGPT”。

只下载 `paperflow-native-host-windows`。如果已经从 Chrome Web Store 安装
PaperFlow，不要下载 `paperflow-ai-extension`。这条 Windows 安装路线不需要 Git、
Cargo、Rust 或 Visual Studio。

GitHub Actions 提供的是未签名开发版，Windows 可能显示安全警告。Native Host
只调用官方 Codex CLI，不会向扩展暴露 Codex 的认证数据。

macOS、Linux、源码编译、卸载和故障排查请查看
[Native Host 文档](docs/native-host.md)。

### 从源码构建扩展

此路径供贡献者或测试未发布版本的用户使用。从 Chrome Web Store 安装后无需执行。

扩展构建环境要求：Node.js 20+ 和 pnpm 10+。

```bash
git clone https://github.com/Dai0-2/paperflow.git
cd paperflow
pnpm install
pnpm build
```

打开 `chrome://extensions`，启用“开发者模式”，选择“加载已解压的扩展程序”，
并选中 `dist/`。只有测试 ChatGPT 订阅模式时才需要 Rust，并执行 Native Host
构建与安装步骤。

## 开发

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm audit:release
pnpm test:e2e
```

扩展使用 React、TypeScript、PDF.js、Dexie、Zustand 与 Chrome Manifest V3；
本地 Bridge 使用 Rust。

## 当前限制

- 登录墙或严格 CORS 限制的远程 PDF 需要下载后从本地打开。
- OCR 采用按需处理方式，单次最多处理 50 页。
- 搜索可以定位匹配页面，但尚未提供完整页内结果逐项跳转。
- Citation 可跳转到引用页，但尚未实现精确的引用范围高亮。
- 当前不包含团队协作、向量数据库和账号付费系统。

## 参与贡献

欢迎提交 Issue 和 Pull Request。请先阅读
[CONTRIBUTING.md](CONTRIBUTING.md)，发布构建前请检查
[发布清单](docs/release-checklist.md)。

## 许可证

PaperFlow 基于 [Apache License 2.0](LICENSE) 开源。捆绑依赖保留各自许可证，
详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

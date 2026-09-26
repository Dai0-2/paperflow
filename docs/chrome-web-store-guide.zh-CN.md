# PaperFlow AI Chrome 应用商店填写教程

本教程使用中文说明操作步骤；所有需要提交给 Chrome 应用商店审核的正式文案均为英文，可直接复制。

## 一、当前发布信息

- 商店商品 ID：`dffiahjmpkmellmjijffpcofoahbccoc`
- 版本：`1.0.12`
- 价格：免费
- 发布范围：按当前商店发布策略选择

正式上传包为 `paperflow-ai-v1.0.12-chrome-web-store.zip`，可上传到上述现有
Chrome Web Store 商品。

点击“提请审核”前确认：

1. 发布者联系邮箱已经验证，隐私权政策网址可以公开访问。
2. Google Drive API 已启用，OAuth 客户端类型为 Chrome 扩展程序，并绑定上述商品 ID。
3. 确认生产 OAuth Client ID 已内置；只有使用其他已注册扩展 ID 时才配置
   `PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID`。
4. 上传 `paperflow-ai-v1.0.12-chrome-web-store.zip`，不要上传源码 ZIP 或 Native Host ZIP。
5. 完成真实 Google Drive 同步和核心 Reader 流程测试。

## 二、商品详情

进入左侧“商品详情”页面。

### 1. 类别

选择：

```text
效率
```

英文对应 `Productivity`。

### 2. 语言

正式文案使用英文，因此选择：

```text
英语（美国）
```

### 3. 说明

将下面整段英文复制到“说明”：

```text
PaperFlow is a local-first research workspace for reading, annotating, organizing, and discussing academic papers.

Open arXiv and direct PDF links in an integrated reader while preserving the original source URL. Highlight, underline, strike through, draw, add comments and area notes, search documents, and run local OCR for scanned pages.

Organize papers with nested collections, tags, favorites, and recently read views. Notes, annotations, conversations, and reading progress are stored locally.

AI features are optional. Users can connect an existing Codex subscription through the local Native Host or configure a direct OpenAI-compatible API connection without installing the host. Content is sent only when the user explicitly invokes an AI action.

Optional encrypted Google Drive synchronization keeps library records, notes, annotations, conversations, and selected offline PDFs available across devices. Data is encrypted on the device before upload.

PaperFlow contains no advertising, analytics, tracking, or telemetry.
```

### 4. 图片资源

- 商店图标：上传 `public/icons/paperflow-128.png`。
- 屏幕截图：PNG 或 JPEG，尺寸为 `1280 × 800` 或 `640 × 400`。
- 推荐依次上传：论文阅读器、批注流程、AI 对话、资料库。
- 截图不得包含邮箱、API Key、保险库密码、恢复密钥或私人论文。
- 宣传视频和宣传图块初期可以留空。

### 5. 其他字段

- 官方网址：填写 `https://dai0-2.github.io/paperflow/`。
- 首页网址：填写 `https://dai0-2.github.io/paperflow/`。
- 支持信息页面网址：填写 `https://github.com/Dai0-2/paperflow/issues`。
- 成人内容：关闭。

完成后点击“保存草稿”，不要提交审核。

## 三、隐私权

进入左侧“隐私权”页面。

### 1. 单一用途说明

粘贴：

```text
PaperFlow provides a local-first workspace for reading, annotating, organizing, and discussing academic research papers.
```

### 2. 权限理由

后台只显示清单中实际声明的权限。找到对应权限后粘贴以下英文说明。

#### sidePanel

```text
Displays the PaperFlow research workspace beside the paper being read.
```

#### storage

```text
Stores interface preferences, redirect-loop protection flags, and an optional user-provided API key locally on this device. The API key is not synchronized.
```

#### tabs

```text
Identifies the active PDF or research-paper tab and opens the Reader or Library when requested by the user.
```

#### nativeMessaging

```text
Communicates with the optional local PaperFlow Native Host for ChatGPT subscription access. The Host reads the local OAuth credential managed by the user-installed official Codex CLI and sends tool-free requests directly to the fixed ChatGPT Codex endpoint; credentials are never returned to the extension.
```

#### contextMenus

```text
Provides user-invoked commands for opening PDFs in PaperFlow, saving papers, and opening the Library.
```

#### identity

```text
Requests Google authorization for the optional encrypted Google Drive synchronization feature. OAuth tokens remain managed by Chrome Identity.
```

#### alarms

```text
Schedules bounded background synchronization and retry work for optional Google Drive sync.
```

#### arXiv 主机权限

```text
Mounts the integrated PaperFlow Reader on user-opened arXiv paper pages while preserving the original arXiv URL.
```

#### 可选 HTTP 和 HTTPS 主机权限

```text
Requested only for a user-selected API provider, a user-opened PDF, or an explicit metadata refresh. PaperFlow does not inspect arbitrary browsing activity.
```

### 3. 远程代码

选择“不使用远程代码”，英文说明粘贴：

```text
All executable application code, PDF.js, OCR components, and language resources are packaged inside the extension. AI and metadata HTTPS requests exchange data with user-selected services but do not download or execute code.
```

### 4. 数据使用披露

建议勾选以下数据类别：

- 网站内容（Website content）
- 个人通信（Personal communications）
- 身份验证信息（Authentication information）
- 用户活动（User activity）
- 网络浏览记录（Web history）

每个类别的用途只选择：

```text
App functionality
```

不要勾选个人身份、健康、财务、付款或位置信息。PaperFlow 不读取用户的 Google 个人资料或邮箱。

确认以下声明：

- 不出售用户数据。
- 不用于广告。
- 不用于信用评估或贷款。
- 不用于与产品单一用途无关的目的。
- 所有网络传输使用 HTTPS。
- Drive 数据在上传前于设备端加密。

### 5. 隐私政策

填写正式隐私政策网址：`https://dai0-2.github.io/paperflow/privacy.html`。

不要填写本地路径、临时预览网址或虚构网址。

完成后点击“保存草稿”。

## 四、测试说明

进入左侧“测试说明”，粘贴：

```text
No account is required to test the core Reader and Library.

1. Install the extension.
2. Open a public arXiv paper, for example https://arxiv.org/pdf/2507.16806.
3. Open the PaperFlow side panel or use a PaperFlow context-menu command.
4. Test PDF navigation, search, highlighting, comments, annotations, and saving the paper to the Library.
5. Open the PaperFlow Library from the extension menu and test collections, tags, search, and recently read items.

AI features are optional. ChatGPT subscription mode requires the separately installed PaperFlow Native Host with Codex authentication. A user-provided OpenAI-compatible API connects directly from the extension and does not require the Native Host.

Google Drive synchronization is optional. The user signs in with Google once; PaperFlow then synchronizes library records, notes, annotations, conversations, reading progress, and optional offline PDFs.
```

不要提供个人 Google 账号或 API Key。

## 五、分发

进入左侧“分发”并按发布计划设置：

- 公开范围：正式发布可选择公开；灰度验证可先选择非公开。
- 地区：所有地区。
- 价格：免费。

Native Host 下载包已提供 SHA-256，目前未签名，Windows/macOS 可能显示安全提醒；
面向大范围公开发布时仍建议完成平台代码签名。

## 六、Google OAuth

在 Google Cloud 中：

1. 启用 Google Drive API。
2. 将应用受众设置为“外部”，测试阶段添加自己的 Google 邮箱。
3. 数据访问范围只添加：

```text
https://www.googleapis.com/auth/drive.file
```

4. 创建 OAuth 客户端：
   - 应用类型：Chrome 扩展程序
   - 名称：`PaperFlow Chrome Extension`
   - 商品 ID：`dffiahjmpkmellmjijffpcofoahbccoc`

创建完成后保留以 `.apps.googleusercontent.com` 结尾的客户端 ID。Chrome 扩展程序 OAuth 客户端不需要 Client Secret。

## 七、最终提交检查

- [ ] 商店公钥已写入清单，扩展 ID 固定为
  `dffiahjmpkmellmjijffpcofoahbccoc`。
- [ ] Google OAuth 客户端使用相同商品 ID。
- [ ] Google Drive API 已启用，Drive 范围只有 `drive.file`。
- [ ] 最终上传的是 `paperflow-ai-v1.0.12-chrome-web-store.zip`。
- [ ] 隐私政策网址公开且稳定。
- [ ] 商店截图中不存在秘密或私人数据。
- [ ] 双 Chrome 配置或双设备加密同步验证通过。
- [ ] Native Host 已提供 SHA-256；公开推广前已评估未签名包的系统安全提醒。
- [ ] 商品详情、隐私权、测试说明和分发设置均已保存。
- [ ] 最终“提请审核”由发布者本人手动执行。

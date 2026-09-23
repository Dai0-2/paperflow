# PaperFlow AI Chrome 应用商店填写教程

本教程使用中文说明操作步骤；所有需要提交给 Chrome 应用商店审核的正式文案均为英文，可直接复制。

## 一、当前发布信息

- 商店商品 ID：`dffiahjmpkmellmjijffpcofoahbccoc`
- 版本：`1.0.0`
- 价格：免费
- 初始公开范围：非公开

当前上传包仅用于创建商店草稿和固定商品 ID，暂时不要点击“提请审核”。

正式提交前还需要：

1. 从商店“文件包”页面复制公钥，并写入 `manifest.base.json`。
2. 使用上述商品 ID 创建 Chrome 扩展程序类型的 Google OAuth 客户端。
3. 配置 `PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID`。
4. 构建并上传 `paperflow-ai-release.zip`。
5. 发布公开隐私政策，并完成真实 Google Drive 同步测试。

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

AI features are optional. Users can connect an existing Codex subscription through the local Native Host or configure an OpenAI-compatible API endpoint. Content is sent only when the user explicitly invokes an AI action.

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

- 官方网址：没有通过 Search Console 验证的网站时选择“无”。
- 首页网址：GitHub 仓库公开后填写项目首页。
- 支持信息页面网址：填写公开的 GitHub Issues 或支持页面。
- 成人内容：关闭。

暂时没有真实网址时请留空，不要填写虚构地址。

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
Stores lightweight interface preferences, language settings, and redirect-loop protection flags locally.
```

#### tabs

```text
Identifies the active PDF or research-paper tab and opens the Reader or Library when requested by the user.
```

#### nativeMessaging

```text
Communicates with the optional local PaperFlow Native Host to access the Codex CLI and store credentials in the operating-system credential store.
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
Schedules bounded background synchronization and retry work for the optional Google Drive vault.
```

#### arXiv 主机权限

```text
Mounts the integrated PaperFlow Reader on user-opened arXiv paper pages while preserving the original arXiv URL.
```

#### 可选 HTTP 和 HTTPS 主机权限

```text
Requested only when the user explicitly opens a PDF or refreshes paper metadata from its source. PaperFlow does not inspect arbitrary browsing activity.
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

代码仓库公开后，将 `docs/privacy.md` 发布为稳定的 HTTPS 页面，并填写其公开网址。

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

AI features are optional and require either the separately installed PaperFlow Native Host with Codex authentication or a user-provided OpenAI-compatible API endpoint.

Google Drive synchronization is optional and requires Google authorization plus a user-created encrypted vault password.
```

不要提供个人 Google 账号、API Key、保险库密码或恢复密钥。

## 五、分发

进入左侧“分发”，测试阶段设置：

- 公开范围：非公开。
- 地区：所有地区。
- 价格：免费。

等 OAuth 正式构建、隐私政策、真实同步测试、Native Host 签名下载和商店图片全部完成后，再改为公开。

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
- [ ] 最终上传的是 `paperflow-ai-release.zip`。
- [ ] 隐私政策网址公开且稳定。
- [ ] 商店截图中不存在秘密或私人数据。
- [ ] 双 Chrome 配置或双设备加密同步验证通过。
- [ ] Native Host 安装包已经签名并提供 SHA-256。
- [ ] 商品详情、隐私权、测试说明和分发设置均已保存。
- [ ] 最终“提请审核”由发布者本人手动执行。

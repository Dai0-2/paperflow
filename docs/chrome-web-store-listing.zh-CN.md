# PaperFlow AI Chrome 应用商店填写清单

本文档中的内容可直接复制到 Chrome 应用商店开发者后台。

## 当前发布信息

- 商店商品 ID：`dffiahjmpkmellmjijffpcofoahbccoc`
- 版本：`1.0.1`
- 价格：免费
- 初始公开范围：非公开

当前草稿暂时不要提交审核。提交前必须完成：

1. 将商店公钥写入 `manifest.base.json`，确保本地版和商店版使用相同 ID。
2. 使用上述商品 ID 创建“Chrome 扩展程序”类型的 Google OAuth 客户端。
3. 配置 `PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID`，构建并上传
   `paperflow-ai-release.zip`。
4. 将 `docs/privacy.md` 发布到稳定的公开网址。
5. 完成真实 Google Drive 同步验证和 Native Host 签名发布。

## 商品详情

### 类别

选择：

```text
效率
```

### 语言

选择：

```text
中文（中国）
```

### 详细说明

```text
PaperFlow 是一个本地优先的学术研究工作台，用于阅读、批注、整理和讨论学术论文。

在保留原始来源网址的同时，通过集成阅读器打开 arXiv 论文和直接 PDF 链接。支持高亮、下划线、删除线、自由绘制、区域批注、文字评论、文档搜索，以及扫描页本地 OCR。

使用嵌套文件夹、标签、收藏和最近阅读视图管理论文。笔记、批注、对话和阅读进度默认保存在本地。

AI 功能完全可选。用户可以通过本地 Native Host 连接已有的 Codex 订阅，也可以配置兼容 OpenAI API 的自定义服务。只有当用户主动发送问题或执行 AI 操作时，PaperFlow 才会向用户选择的服务发送相关内容。

可选的 Google Drive 加密同步可在不同设备之间同步资料库记录、笔记、批注、对话和用户选择离线备份的 PDF。所有同步内容都会先在设备端加密，再上传到 Google Drive。

PaperFlow 不包含广告、行为分析、跟踪或遥测功能。
```

### 图片资源

- 商店图标：使用 `public/icons/paperflow-128.png`。
- 屏幕截图：PNG 或 JPEG，尺寸为 `1280 × 800` 或 `640 × 400`。
- 建议截图：论文阅读器、批注流程、AI 对话、资料库。
- 截图中不得出现邮箱、API Key、保险库密码、恢复密钥或私人论文内容。
- 宣传视频、小型宣传图块和顶部宣传图块初期可以不上传。

### 其他字段

- 官方网址：`https://dai0-2.github.io/paperflow-ai/`
- 首页网址：`https://dai0-2.github.io/paperflow-ai/`
- 支持信息页面网址：`https://github.com/Dai0-2/paperflow-ai/issues`
- 成人内容：关闭。

## 隐私权

### 单一用途说明

```text
PaperFlow 提供一个本地优先的学术研究工作台，帮助用户阅读、批注、整理和讨论学术论文。
```

### 权限理由

#### sidePanel

```text
在用户正在阅读的论文旁边显示 PaperFlow 研究工作区。
```

#### storage

```text
在本地保存轻量级界面偏好、语言设置和防止重复重定向所需的状态。
```

#### tabs

```text
识别当前活动的 PDF 或论文标签页，并在用户要求时打开阅读器或资料库。
```

#### nativeMessaging

```text
与用户可选安装的 PaperFlow Native Host 通信，用于访问 Codex CLI，并将凭据安全存储在操作系统凭据存储中。
```

#### contextMenus

```text
提供由用户主动触发的右键菜单命令，用于在 PaperFlow 中打开 PDF、保存论文和打开资料库。
```

#### identity

```text
为可选的 Google Drive 加密同步功能请求 Google 授权。OAuth 访问令牌始终由 Chrome Identity 管理。
```

#### alarms

```text
为可选的 Google Drive 同步安排有限的后台同步和失败重试任务。
```

#### arXiv 主机权限

```text
在用户主动打开的 arXiv 论文页面中加载 PaperFlow 集成阅读器，同时保留原始 arXiv 地址。
```

#### 可选 HTTP 和 HTTPS 主机权限

```text
仅当用户主动打开某个 PDF 或主动刷新论文元数据时请求对应来源的访问权限。PaperFlow 不检查用户的任意浏览活动。
```

### 远程代码

选择：

```text
否，我没有使用远程代码。
```

补充说明：

```text
所有可执行应用代码、PDF.js、OCR 组件和语言资源均打包在扩展程序内部。AI 和论文元数据请求只与用户选择的服务交换数据，不会下载或执行远程代码。
```

### 数据使用披露

由于用户主动使用 AI 或加密 Drive 同步时，部分数据可能离开设备，建议披露：

- 网站内容：用户选中的文字、当前页文字、相关论文片段、论文元数据及用户主动选择的附件。
- 个人通信：用户问题、AI 对话记录和笔记。
- 身份验证信息：通过 Native Host 处理的用户 API 凭据，以及由 Chrome Identity 管理的 OAuth 授权。
- 用户活动：可选 Google Drive 同步中的阅读状态和最近阅读记录。
- 网络浏览记录：可选 Google Drive 同步中的论文来源网址和访问时间。

不要选择：

- 个人身份信息
- 健康信息
- 财务和付款信息
- 位置信息

PaperFlow 不请求用户的 Google 个人资料或邮箱地址。

上述每个数据类别的用途只选择：

```text
应用功能
```

确认所有适用声明：

- 不出售用户数据。
- 不将用户数据用于广告。
- 不将用户数据用于信用评估或贷款。
- 不将用户数据用于与 PaperFlow 单一用途无关的目的。
- 网络传输使用 HTTPS。
- Drive 资料库记录和可选 PDF 备份在上传前于设备端加密。

### 隐私政策网址

填写 `https://dai0-2.github.io/paperflow-ai/privacy.html`。

## 测试说明

```text
测试核心阅读器和资料库功能不需要账号。

1. 安装扩展程序。
2. 打开一篇公开的 arXiv 论文，例如：https://arxiv.org/pdf/2507.16806
3. 打开 PaperFlow 侧边栏，或使用 PaperFlow 右键菜单命令。
4. 测试 PDF 翻页、缩放、搜索、高亮、评论、批注及保存到资料库。
5. 从扩展菜单打开 PaperFlow 资料库，测试文件夹、标签、搜索和最近阅读。

AI 功能是可选功能，需要安装独立的 PaperFlow Native Host 并完成 Codex 身份验证，或者由用户提供兼容 OpenAI API 的服务地址和 API Key。

Google Drive 同步是可选功能。用户只需登录一次 Google 账号，PaperFlow
随后会同步资料库、笔记、批注、对话、阅读进度和可选的离线 PDF。
```

不要向审核人员提供个人 Google 账号或 API Key。

## 分发

私下测试阶段：

- 公开范围：非公开。
- 地区：所有地区。
- 价格：免费。

只有在 OAuth 正式构建、隐私政策、真实 Drive 测试、已签名 Native Host
下载、支持网址和商店图片全部准备好之后，才能改为公开发布。

## 最终提交检查

- [ ] 商店公钥使本地构建 ID 固定为
  `dffiahjmpkmellmjijffpcofoahbccoc`。
- [ ] Google OAuth 客户端类型为 Chrome 扩展程序，并使用相同商品 ID。
- [ ] Google Drive API 已启用，Drive 权限范围只有 `drive.file`。
- [ ] 最终上传包是 `paperflow-ai-release.zip`，不是用于占位和获取 ID
  的无 OAuth 包。
- [ ] 隐私政策网址公开、稳定且可以直接访问。
- [ ] 商店截图中不存在凭据或私人数据。
- [ ] 双 Chrome 用户配置或双设备加密同步测试通过。
- [ ] Native Host 下载包已经签名、生成校验值并可公开下载。
- [ ] 商品详情、隐私声明、分发设置和测试说明均已保存。
- [ ] 最终“提请审核”操作由发布者本人手动执行。

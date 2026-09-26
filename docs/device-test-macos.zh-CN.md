# PaperFlow AI macOS 跨设备测试

此包用于 Apple Silicon Mac。扩展目录包含固定扩展 ID 和 Google Drive OAuth 配置；Native Host 仅用于 ChatGPT/Codex 登录。OpenAI 兼容 API 由扩展直连，不需要 Host。

## 1. 安装 Native Host

打开“终端”，进入解压后的目录并执行：

```bash
bash native-host-macos/install-macos.sh
```

脚本会将 Host 安装到当前用户目录，不需要管理员密码。若 macOS 因文件隔离阻止测试版二进制，请先在“系统设置 > 隐私与安全性”中允许，或在确认压缩包校验值后移除本目录的隔离属性。

## 2. 加载扩展

1. 打开 `chrome://extensions`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本包中的 `extension` 文件夹。
5. 确认扩展 ID 为 `dffiahjmpkmellmjijffpcofoahbccoc`。

不要选择仓库中的普通 `dist`，它不保证包含 Google OAuth 配置。

## 3. 登录

- Google 同步：打开 PaperFlow 设置，点击“使用 Google 账号登录”。
- ChatGPT：先确认 `codex --version` 可运行，再执行 `codex login` 并完成官方浏览器授权。PaperFlow Native Host 会使用该本机凭据直连 Codex Responses 服务，不会启动用户的 MCP、插件或工具，也不会将访问令牌发送给扩展。

可随时在 PaperFlow 的“设置 > AI 服务”中切换 ChatGPT 订阅与 OpenAI 兼容 API；
两种模式会分别保留自己的模型设置。

完成安装或更新后，在 `chrome://extensions` 中重新加载 PaperFlow。

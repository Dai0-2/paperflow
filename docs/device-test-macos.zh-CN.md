# PaperFlow AI macOS 跨设备测试

此包用于 Apple Silicon Mac。扩展目录包含固定扩展 ID 和 Google Drive OAuth 配置；Native Host 用于 ChatGPT/Codex 登录与系统钥匙串中的 API Key。

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
- ChatGPT：先安装官方 ChatGPT/Codex CLI，再点击 PaperFlow 中的“登录 ChatGPT”。PaperFlow 会运行固定的 `codex login` 并打开官方浏览器授权。

完成安装或更新后，在 `chrome://extensions` 中重新加载 PaperFlow。

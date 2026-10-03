# AI Usage Bar Local

macOS 菜单栏 Codex 额度查看器。当前版本 **2.3.0**。

## 功能

- 5 小时 / 7 天额度窗口：剩余百分比、环形进度、准确重置时间及倒计时。
- Credits 余额、可用重置券数量和接口提供的到期信息。
- 蓝紫渐变 / 双胶囊原生界面；每 60 秒刷新数据，每 15 秒刷新倒计时。
- 菜单栏显示周额度和余额；支持手动刷新、详情和官方用量页面。

接口没有返回的信息显示“暂未提供”，不会按零或无限处理。独立 ChatGPT 聊天限额并非本接口提供。Credits 可能包含赠送额度，服务端未提供购买总额、已用比例或完整到期明细。消息次数如有返回属于估算。

## 安装

在 Releases 下载 `AI-Usage-Bar-Local-2.3.0.dmg`，将应用拖入 Applications 并打开。

此版本需要本机存在 `/usr/local/bin/python3`（Python 3.10+），并已通过 Codex 登录，生成当前用户拥有、仅本人可读写的 `~/.codex/auth.json`。应用不提供登录界面，也不会修改凭证。Apple Silicon/macOS 27 上已实机验证，其他 macOS 版本尚未实测。

应用使用本地 ad-hoc 签名，未通过 Apple Developer ID 公证。从互联网下载后可能触发 Gatekeeper；可按系统“隐私与安全性”的提示允许打开，或自行从源码构建。不需要关闭系统安全机制。

安装包不配置开机启动；如需要，可在系统“登录项”中添加应用。应用退出后停止刷新。额度数据自动刷新，**软件版本手动更新**。

## 从源码构建

安装 Apple Command Line Tools 和 Python 后，在源码目录运行：

```sh
python3 -m unittest -v test_collector.py
python3 build.py '/tmp/AI Usage Bar Local.app'
```

输出路径必须不存在。构建使用系统 JXA 编译器、AppKit 和 codesign；无第三方 Python/JavaScript 依赖，不联网下载构建代码。`BUILD.json` 固定来源及源码哈希。开发时修改其中列出的文件后，需要重新计算对应 SHA-256 才能构建。

## 隐私与网络

只读本机 Codex 登录状态，在内存中使用令牌访问固定 HTTPS 端点：

- `https://chatgpt.com/backend-api/wham/usage`
- `https://chatgpt.com/backend-api/wham/rate-limit-reset-credits`

禁止 HTTP 重定向，使用系统证书校验；不会调用重置券兑换接口。不读取浏览器 Cookie 或 Keychain，无遥测、无自动更新或远程代码执行。不使用 sudo。

应用仅将经过字段筛选的用量信息保存到 `~/Library/Application Support/AI Usage Bar Local/`（目录 0700，数据文件 0600）。该目录含用量快照和用于本机检查的窗口截图，**不要分享该目录**。凭证和原始 API 响应不会写入这些文件。API 属于未保证稳定性的服务端接口，未来变化可能需要更新。

## 来源与许可

基于 [liamlai88/ai-usage-bar](https://github.com/liamlai88/ai-usage-bar) 的思路及 MIT 许可代码，来源提交 `5109cc192f36d782a57f2a3c1c8e6eadc8995b1a`。这是本地加固的原生 JXA/AppKit 移植版本，不是上游官方发行版。保留上游 MIT 许可和版权声明。应用图标为本项目生成的图标。

## 后续研究与测试

开发入口、测试场景及反馈要求见 [RESEARCH.md](RESEARCH.md)。安装包请从本仓库 Releases 获取；核对随附 SHA-256 清单，避免使用来历不明的重打包。

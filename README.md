# AI Usage Bar Local

macOS 菜单栏 Codex 额度查看器。当前源码版本 **2.4.4**。

## 功能

- 每周额度：单圆环显示剩余百分比、已用比例及准确重置时间。
- 紧凑浅色原生窗口，固定内容区 320×300（窗口 320×332），禁止拖拽缩放，重开保持尺寸，正式应用限制单实例；Credits 余额与可用重置券分列显示。
- 收到额度通知立即更新；启动、重连、唤醒及重置时核对，每 10 分钟补查；支持手动刷新、详情和官方用量页面。
- 菜单栏五柱各代表 20% 剩余额度，按真实比例填充；例如剩余 95% 为四柱全满、第五柱 75%。
- 圆环与菜单栏颜色一致：剩余 ≥50% 绿色，≥25% 且 <50% 蓝色，<25% 红色。缺失或过期数据使用灰色，刷新失败保留上次数据并标记。
- 主界面、菜单与详情仅显示每周额度，不显示短时窗口。

接口没有返回的信息显示“暂未提供”，不会按零或无限处理。独立 ChatGPT 聊天限额并非本接口提供。Credits 可能包含赠送额度，服务端未提供购买总额、已用比例或完整到期明细。消息次数如有返回属于估算。

## 安装

2.4.4 的最新源码已在本仓库更新，可按下方步骤构建应用。现有 Releases 安装包可能仍是较早版本，请核对版本号；本次源码更新不发布新的安装包。将构建的应用放入 Applications 并打开。

此版本需要本机存在 `/usr/local/bin/python3`（Python 3.10+），及兼容的 Codex CLI（当前使用 `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`），并已通过 Codex 登录，生成当前用户拥有、仅本人可读写的 `~/.codex/auth.json`。本工具不提供登录界面、不创建登录凭据，不改变凭证权限；复用当前 Codex 登录状态。Apple Silicon/macOS 27 上已实机验证，其他 macOS 版本尚未实测。

应用使用本地 ad-hoc 签名，未通过 Apple Developer ID 公证。从互联网下载后可能触发 Gatekeeper；可按系统“隐私与安全性”的提示允许打开，或自行从源码构建。不需要关闭系统安全机制。

安装包不配置开机启动；如需要，可在系统“登录项”中添加应用。应用退出后停止刷新。额度数据自动刷新，**软件版本手动更新**。

## 从源码构建

安装 Apple Command Line Tools、Python 和用于界面逻辑测试的 Node.js 后，在源码目录运行：

```sh
python3 -m unittest -v test_collector.py test_indicator.py test_usage_service.py
node tests/ui-state.test.cjs
python3 build.py '/tmp/AI Usage Bar Local.app'
```

输出路径必须不存在。构建使用系统 JXA 编译器、AppKit 和 codesign；无第三方 Python/JavaScript 依赖，不联网下载构建代码。`BUILD.json` 固定来源及源码哈希。开发时修改其中列出的文件后，需要重新计算对应 SHA-256 才能构建。

## 隐私与网络

观察器通过既有 Codex CLI 的 stdio app-server 连接读取额度，只有初始化和 `account/rateLimits/read` 请求，不发送对话或工具任务。使用稀疏 `account/rateLimits/updated` 事件更新已知字段；缺失字段保留上次值并核对。补查所需字段缺失或通知连接不可用时，原有采集器只读本机登录状态，在内存中使用令牌访问固定 HTTPS 端点：

- `https://chatgpt.com/backend-api/wham/usage`
- `https://chatgpt.com/backend-api/wham/rate-limit-reset-credits`

禁止 HTTP 重定向，使用系统证书校验；不会调用重置券兑换接口。不读取浏览器 Cookie 或 Keychain，无遥测、无自动更新或远程代码执行。不使用 sudo。

应用仅将经过字段筛选的用量信息保存到 `~/Library/Application Support/AI Usage Bar Local/`（目录 0700，数据文件 0600）。该目录含用量快照和用于本机检查的窗口截图，**不要分享该目录**。凭证和原始 API 响应不会写入这些文件。API 属于未保证稳定性的服务端接口，未来变化可能需要更新。

## 来源与许可

基于 [liamlai88/ai-usage-bar](https://github.com/liamlai88/ai-usage-bar) 的思路及 MIT 许可代码，来源提交 `5109cc192f36d782a57f2a3c1c8e6eadc8995b1a`。这是本地加固的原生 JXA/AppKit 移植版本，不是上游官方发行版。保留上游 MIT 许可和版权声明。应用图标为本项目生成的图标。

## 后续研究与测试

开发入口、测试场景及反馈要求见 [RESEARCH.md](RESEARCH.md)。安装包请从本仓库 Releases 获取；核对随附 SHA-256 清单，避免使用来历不明的重打包。

### 菜单栏指示灯

每柱代表 20% 的每周剩余额度，最后一柱支持部分填充。0% 时五柱都不填充，未知或过期使用独立灰色状态；不把未知当作零。关闭或最小化窗口后继续刷新，选择“退出”才停止。


### 2.4.4 已验证及限制
额度通知立即更新；启动、重连、Mac 唤醒、额度重置时核对，每 10 分钟补查。保持 320×332 固定窗口和原图标。
使用已安装 Codex 的只读 stdio app-server；不创建登录或远程控制凭据，不安装 daemon，不开放监听端口，不发送对话。未知事件字段保留上次值；余额和重置券补读。完整核对超过 12 分钟或失败时标为上次数据。
公开协议未保证跨设备或跨 app-server 实例事件送达；这类变化依靠十分钟补查。CLI 协议仍标为 experimental，连接异常会恢复，并通过既有只读接口补查。

28 项 Python 测试及 30 项纯界面逻辑检查通过，覆盖稀疏事件、静默、缺失与零值、乱序响应、重连／唤醒／重置核对、十分钟调度、独占锁及原有显示。原生构建与严格签名验证通过。实际后台已验证启动读取、断开后重连、唤醒标记补查、第二观察器被拒绝、正常静默期间不报过期，以及多次实际十分钟自动补查并更新界面。

验证期间尚未观察到真实额度事件；事件合并使用隔离测试数据验证，不能把接口连接成功称为已实测跨设备推送。未执行整机休眠；唤醒集成测试使用与系统唤醒处理相同的补查标记。

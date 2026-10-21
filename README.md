# dsh-mcp-rea

> 把 [rea](https://github.com/morluto/rea) 的 207 个 MCP 工具，变成 DeepSeek Harness 里**一个可以随手开关的插件包**。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 为什么需要它

`rea` 是个很强的逆向分析工具集，但它的 MCP server 一次会暴露 **207 个工具**。Harness 每一轮请求都要把这些工具定义完整发给模型：

| 状态 | 工具数 | 每步请求的工具定义 |
|---|---|---|
| 默认挂载 rea | 262 | **836,511 B（约 20 万 token）** |
| 关掉 rea | 55 | 42,308 B |

也就是说，**哪怕这次只是在改一个 CSS，你也要为 790 KB 的逆向工具定义付钱**。而卸载起来并不方便：它往往挂在 loader patch 里，界面上没有开关。

这个 bundle 就是把这个开关补上：

- 打开：rea 的工具出现，随时可用
- 关闭：工具归零，上下文立刻省下约 790 KB
- 开关状态持久化在 profile 配置里，重启后仍然有效

## 它做了什么（以及没做什么）

**做了**：插入一行 loader patch，用 `@deepseek-ai/dsh-mcp-client` 以 stdio 方式启动你本机已安装的 `rea-agents` MCP server。

**没做**：

- 不包含 rea 的源码，只链接上游
- 不修改任何模型、账号或路由配置
- 不发任何网络请求（除了 MCP server 自身的本地进程通信）

## 前置条件

| 依赖 | 说明 |
|---|---|
| DeepSeek Harness | 在 Desktop 0.2.x 上实测 |
| Node.js | `node` 可执行文件，Windows 下通常是 `C:\Program Files\nodejs\node.exe` |
| rea-agents | `npm install -g rea-agents`（实测 6.5.0） |

确认 rea 的入口位置：

```powershell
# Windows
%APPDATA%\npm\node_modules\rea-agents\scripts\rea.mjs

# macOS / Linux
/usr/local/lib/node_modules/rea-agents/scripts/rea.mjs
```

## 安装

在 Harness 侧边栏「插件」页安装本目录（选它的绝对路径），或者：

```powershell
dsh plugin --profile <profile> add "link:<本目录绝对路径>"
```

然后把 `@local/dsh-mcp-rea` 加进 `<profile>/package.json` 的 `dsh.profile.bundles` 列表。

安装后编辑 [cordis.patch.yml](cordis.patch.yml)，把两处路径改成你机器上的实际值：

```yaml
command: 'C:\Program Files\nodejs\node.exe'                                   # node 可执行文件
args:
  - 'C:\Users\<you>\AppData\Roaming\npm\node_modules\rea-agents\scripts\rea.mjs'
  - mcp
```

## 自动安装（可选，默认关闭）

默认**不会**改动你的环境：缺 rea 时只在日志里提示一句。

想让它自己装，打开 `cordis.patch.yml` 里预检行的开关：

```yaml
- id: rea-preflight
  config:
    autoInstall: true
```

行为：入口文件缺失 → 执行 `npm install -g rea-agents` → 装好后再由 MCP 行启动。已经装过的机器完全零副作用（检测到入口存在就直接返回）。

> ⚠️ 风险：`npm install` 会执行该包的生命周期脚本，等于在你机器上运行第三方代码。所以这个开关默认关闭，责任在使用者。安装位置是 npm 的默认全局前缀；如果你改过 prefix，请在预检行里显式写 `entry`。

## 开关

侧边栏 **「插件」** → **「rea MCP 服务器」** → 拨动开关。

开关状态写入 `<profile>/cordis.patch.yml`：

```yaml
- id: rea-mcp
  disabled: true    # true = 关，false = 开
```

> 注意：Web 端「设置」里的插件列表是只读的，开关在侧边栏「插件」页。

## 配置

完整可用的配置行见 [cordis.patch.yml](cordis.patch.yml)。如果你想保持 bundle 通用、把本机路径留在本地，可以用同 id 覆盖：

```yaml
- id: rea-mcp
  disabled: false
  config:
    serverName: rea
    transport: stdio
    command: 'C:\Program Files\nodejs\node.exe'
    args:
      - 'C:\Users\<you>\AppData\Roaming\npm\node_modules\rea-agents\scripts\rea.mjs'
      - mcp
```

换成 HTTP 传输的 MCP server 时，把 `transport` 改为 `streamable-http` 并去掉 `command`/`args`、改为 `url`。

## 安全说明

- 本仓库**只有配置，没有可执行 JS**：安装时不会执行任意代码。
- 但 DSH 的 bundle 生效于 Host 进程，安装任何第三方 bundle 都属于信任行为；装之前请先读一遍 `cordis.patch.yml`（只有十几行）。
- 它会启动你本机 `npm -g` 安装的 `rea-agents`。rea 的能力和合规边界（仅限合法授权的分析场景：安全研究、恶意样本分析、漏洞研究、CTF、互操作性等）见上游的 [DISCLAIMER](https://github.com/morluto/rea/blob/main/DISCLAIMER.md)。
- 仓库内不包含任何凭据、token 或个人路径；`cordis.patch.yml` 里是占位符，请替换为本机实际路径。

## 没装 rea 会怎样

**不会把 Harness 弄坏。** `failOnStartupError` 默认为 `false`，所以初始连接失败时：

- Harness 正常启动，插件行照旧存在、开关照旧可拨
- 只是不会出现任何 `mcp__rea__*` 工具，日志里多一条连接错误
- 装好 rea（或把路径改对）后重启 Harness 即可，不需要重装 bundle

对应地，[cordis.patch.yml](cordis.patch.yml) 里显式写了 `failOnStartupError: false`，把这个"失败也不阻塞启动"的行为固定下来。

## 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 插件页能看到「rea MCP 服务器」，但没有任何 `mcp__rea__*` 工具 | rea 没装，或路径不对 | `npm ls -g rea-agents` 确认已安装；检查 `command` / `args[0]` 是否指向真实存在的文件 |
| 日志里出现 `spawn ... ENOENT` | `command` 里的 node 路径不对 | 换成 `where node` 输出的绝对路径 |
| 工具都出现了但调用报错 | rea 版本不兼容 | 升级 `npm i -g rea-agents@latest` |
| 想让 rea 完全不加载 | — | 插件页把开关拨到关，比卸载更省事 |

## 已知限制

- 只在 Windows + DSH Desktop profile 上验证过；macOS/Linux 需要把 `command`/`args` 换成对应路径（逻辑一致）。
- 工具定义在**每一步请求**里都会重发，所以开关的收益是持续的，反之成本也是持续的。
- rea 的工具粒度很细（207 个），Harness 侧目前无法按工具过滤，只能整包开关。

## 许可

MIT，见 [LICENSE](LICENSE)。

本仓库不包含 `rea` 的源码。`rea` 由 [morluto](https://github.com/morluto) 开发，MIT 许可，版权归原作者所有。

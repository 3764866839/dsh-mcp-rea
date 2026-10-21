/**
 * rea 预检：入口不存在且 autoInstall 为真时，先全局安装 rea-agents，再让 MCP 行去启动它。
 *
 * 设计要点：
 * - 不导出 `Config`：cordis 的 resolveConfig 在插件没有 schema 时原样透传 config，
 *   所以这里不需要任何 @deepseek-ai 依赖，模块只 import node: 内置模块。
 * - 默认 autoInstall = false：装包会在用户机器上执行 npm 生命周期脚本，
 *   必须由使用者显式开启。
 * - 只在入口文件确实缺失时才动手，已安装的机器零副作用。
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** npm 全局安装后 rea 的默认入口位置（与 README 里的路径一致）。 */
function defaultEntry() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    return appData ? join(appData, 'npm', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs') : ''
  }
  const prefix = process.env.npm_config_prefix || '/usr/local/lib'
  return join(prefix, 'node_modules', 'rea-agents', 'scripts', 'rea.mjs')
}

const log = (message) => console.warn(`[dsh-mcp-rea] ${message}`)

export function apply(_ctx, config) {
  const cfg = config || {}
  const entry = typeof cfg.entry === 'string' && cfg.entry ? cfg.entry : defaultEntry()
  const spec = typeof cfg.packageSpec === 'string' && cfg.packageSpec ? cfg.packageSpec : 'rea-agents'
  const timeout = Number.isFinite(cfg.installTimeoutMs) ? cfg.installTimeoutMs : 300_000

  // 入口已存在：什么都不做。
  if (entry && existsSync(entry)) return

  if (!cfg.autoInstall) {
    log(`未找到 rea（期望路径：${entry || '未知'}），跳过自动安装。`)
    log('先运行 `npm install -g rea-agents`，或在本插件的 config 里设置 autoInstall: true。')
    return
  }

  const args = ['install', '-g', spec, '--no-fund', '--no-audit']

  if (cfg.dryRun) {
    log(`dryRun：将执行 npm ${args.join(' ')}`)
    return
  }

  log(`未找到 rea，正在安装 ${spec}（首次可能需要几十秒）…`)
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    stdio: 'inherit',
    timeout,
    // Windows 下 npm 是 .cmd，必须经 shell 才能拉起。
    shell: process.platform === 'win32',
    windowsHide: true,
  })

  if (result.error) {
    log(`安装失败：${result.error.message}`)
    return
  }
  if (result.status !== 0) {
    log(`安装失败：npm 退出码 ${result.status}`)
    return
  }
  if (!entry || !existsSync(entry)) {
    log(`安装命令已执行，但仍未找到 ${entry}；如果你的 npm 全局前缀不是默认值，请手动安装并在 cordis.patch.yml 里写绝对路径。`)
    return
  }
  log('rea 安装完成，继续启动 MCP server。')
}

/* ================================================================
 * 一键启动本地联调服务器（前端 1 台 + 内网 API 2 台实例，验证高可用切换）：
 *   1) 前端 H5（uni dev server）      → http://localhost:5173
 *   2) 内网打卡 API 实例1             → http://127.0.0.1:8080
 *   3) 内网打卡 API 实例2             → http://127.0.0.1:8081
 * 用法：npm run dev:all（Ctrl+C 同时退出全部）
 * 高可用验证：停掉 8080（Ctrl+C 该进程），前端打卡会自动切到 8081。
 * 只跑单实例：npm run dev:h5 + npm run dev:api。
 * ================================================================ */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const isWin = process.platform === 'win32'
const npmCmd = isWin ? 'npm.cmd' : 'npm'

const children = []
function run(name, cmd, args) {
  const child = spawn(cmd, args, { cwd: root, shell: isWin, stdio: 'inherit' })
  children.push(child)
  child.on('exit', (code) => {
    console.log(`[dev-all] ${name} 退出 (code=${code})`)
    shutdown()
  })
  return child
}

function shutdown() {
  for (const c of children) { try { c.kill() } catch (e) {} }
  setTimeout(() => process.exit(0), 300)
}

console.log('')
console.log('  [dev-all] 正在启动 2 台本地服务器…')
console.log('  前端:    http://localhost:5173')
console.log('  内网API: http://127.0.0.1:8080')
console.log('  Ctrl+C 同时退出')
console.log('')

run('前端H5', npmCmd, ['run', 'dev:h5'])
run('内网API-1', process.execPath, [join('scripts', 'intranet-api.mjs')])
run('内网API-2', process.execPath, [join('scripts', 'intranet-api.mjs'), '8081'])

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

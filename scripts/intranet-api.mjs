/* ================================================================
 * 本地模拟「内网打卡 API」服务器（Node 内置模块，零依赖）
 * ----------------------------------------------------------------
 * 用途：本地联调 2 台服务器——
 *   1) 前端 H5：npm run dev:h5        → http://localhost:5173
 *   2) 本模拟内网API：npm run dev:api → http://127.0.0.1:8080
 *   或一条命令：npm run dev:all
 * 接口与 src/config.js 顶部约定一致（上线由 springboot2-dkxt 实现）：
 *   GET  /api/attendance/ping       探活，返回 2xx
 *   POST /api/attendance/clock-in   提交打卡（ts 时间差<=5s + nonce 一次性 + status 判定）
 * 打卡记录写入 .intranet-data/clock-in.log（JSONL），方便核对后端收到了什么。
 * 环境变量：
 *   PORT   监听端口，默认 8080
 * ================================================================ */
import http from 'node:http'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.argv[2] || process.env.PORT || 8080)   // 支持 node scripts/intranet-api.mjs 8081
const DATA_DIR = join(__dirname, '..', '.intranet-data')
const LOG_FILE = join(DATA_DIR, 'clock-in.log')

/* 班次表（与前端 src/config.js 保持一致；迟到=晚于start上班，早退=早于end下班） */
const SHIFTS = {
  am: { name: '上午班', start: '08:00', end: '12:00' },
  pm: { name: '下午班', start: '15:00', end: '18:00' }
}
const MAX_TS_DRIFT = 5 * 1000   // 与前端约定：时间戳差 <=5 秒
const usedNonce = new Set()     // 防重放：一次性 nonce

let seq = 0                     // recordId 自增

function toHM(ms) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

function logToFile(line) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    appendFileSync(LOG_FILE, line + '\n', 'utf8')
  } catch (e) { /* 写盘失败不影响响应 */ }
}

const server = http.createServer((req, res) => {
  /* CORS（内网接口约定，本地联调用 * 放宽） */
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const url = new URL(req.url, 'http://x')
  const from = req.socket.remoteAddress
  console.log(`[intranet-api] ${req.method} ${url.pathname}  from ${from}`)

  /* 1) 探活（打卡前置检查） */
  if (req.method === 'GET' && url.pathname === '/api/attendance/ping') {
    json(res, 200, { code: 200, message: 'ok', ts: Date.now() })
    return
  }

  /* 2) 提交打卡 */
  if (req.method === 'POST' && url.pathname === '/api/attendance/clock-in') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let p
      try { p = JSON.parse(body || '{}') } catch (e) { return json(res, 400, { code: 400, message: '请求体不是合法 JSON' }) }

      if (!['clockIn', 'clockOut'].includes(p.type)) return json(res, 400, { code: 400, message: 'type 非法' })
      if (!SHIFTS[p.shift]) return json(res, 400, { code: 400, message: 'shift 非法' })
      if (!p.nonce || usedNonce.has(p.nonce)) return json(res, 400, { code: 400, message: 'nonce 重复或缺失（防重放）' })
      const drift = Math.abs(Date.now() - Number(p.ts || 0))
      if (drift > MAX_TS_DRIFT) return json(res, 400, { code: 400, message: `ts 与服务端时间差 ${Math.round(drift / 1000)}s，超过 5s（疑似重放）` })

      usedNonce.add(p.nonce)
      seq += 1
      const now = new Date()
      const hm = toHM(now.getTime())
      const shift = SHIFTS[p.shift]
      let status = 'normal'
      if (p.type === 'clockIn' && hm > shift.start) status = 'late'
      if (p.type === 'clockOut' && hm < shift.end) status = 'early'

      const recordId = `R-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`
      const resp = {
        code: 200, message: 'ok',
        data: {
          recordId,
          time: now.toISOString().slice(0, 19).replace('T', ' '),
          status
        }
      }
      logToFile(JSON.stringify({ at: new Date().toISOString(), from, ...p, recordId, serverStatus: status }))
      console.log(`  ✔ ${shift.name} ${p.type === 'clockIn' ? '上班' : '下班'} ${p.userId || 'guest'} → ${recordId} (${status})`)
      json(res, 200, resp)
    })
    return
  }

  /* 3) 根路径帮助 */
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end([
      '本地模拟内网打卡 API 服务器',
      `监听 http://127.0.0.1:${PORT}`,
      'GET  /api/attendance/ping       探活',
      'POST /api/attendance/clock-in   提交打卡',
      `打卡记录落盘: ${LOG_FILE}`
    ].join('\n'))
    return
  }

  json(res, 404, { code: 404, message: 'not found' })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('')
  console.log('  本地模拟「内网打卡 API」已启动')
  console.log(`  监听:   http://127.0.0.1:${PORT}`)
  console.log('  探活:   GET  /api/attendance/ping')
  console.log('  打卡:   POST /api/attendance/clock-in')
  console.log(`  记录:   ${LOG_FILE}`)
  console.log('  提示:   前端 npm run dev:h5 后打开 http://localhost:5173 即可联调')
  console.log('')
})

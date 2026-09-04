/* ================================================================
 * 全局共享状态与本地存储（tabBar 页面间共享，模块级单例）
 * ----------------------------------------------------------------
 * 存储说明：本项目仅面向 H5（嵌入融媒App WebView），直接使用 localStorage
 * 并全量 try-catch 降级内存，与旧版静态页的存储键完全兼容。
 * 打卡方案：内网可达性打卡（组合A）——不依赖定位/围栏/考勤点，
 * 只维护"内网连通性"状态（net），连通即可打卡。
 * ================================================================ */
import { reactive } from 'vue'
import { todayKey, pad2 } from './bridge.js'

/* ---------------- 桥接调用日志（开发辅助，仅控制台输出） ---------------- */
export function logBridge(name, detail, isErr) {
  if (isErr) console.warn(`[bridge] ${name}: ${detail}`)
  else console.log(`[bridge] ${name}: ${detail}`)
}

/* ---------------- 页面调试日志（开发辅助，页面内可查看） ----------------
 * 记录探测/打卡等关键事件：time 时间、target 目标、srcIp 源IP、ok 结果、ms 耗时、detail 说明。
 * 内存环形缓冲（最多 50 条），页面「调试日志」面板展示，清空按钮可重置。 */
export function pushDebugLog(entry) {
  const d = new Date()
  const log = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`,
    ok: true,
    srcIp: '',
    ms: 0,
    detail: '',
    ...entry
  }
  state.debug.logs.unshift(log)
  if (state.debug.logs.length > 50) state.debug.logs.length = 50
}
export function clearDebugLogs() {
  state.debug.logs = []
}

/* ---------------- 浏览器 console → 页面调试日志 ----------------
 * 包装 console.log/info/warn/error/debug：保留原控制台输出，同时写入页面调试日志，
 * 便于在真机（无法开 DevTools）上排查问题。模块级标记只 hook 一次，避免重复包装。 */
let consoleHooked = false
export function hookConsoleToDebugLogs() {
  if (consoleHooked || typeof console === 'undefined') return
  consoleHooked = true
  const levels = ['log', 'info', 'warn', 'error', 'debug']
  for (const level of levels) {
    const orig = console[level]
    if (typeof orig !== 'function') continue
    console[level] = function (...args) {
      try { orig.apply(console, args) } catch (e) { /* 保留原输出，异常忽略 */ }
      try {
        pushDebugLog({
          type: 'console',
          level: level,
          ok: level !== 'warn' && level !== 'error',
          detail: args.map((a) => {
            if (typeof a === 'string') return a
            try { return JSON.stringify(a) } catch (e) { return String(a) }
          }).join(' ')
        })
      } catch (e) { /* 忽略 */ }
    }
  }
}

/* ---------------- 调试手机号（浏览器调试面板专用，App 内不使用） ----------------
 * 打卡身份临时调试：页面「调试手机号」面板可随时修改，
 * 持久化到 localStorage（刷新不丢）；未设置时退回 config.js 的 TEST_MOBILE。 */
const DEBUG_MOBILE_KEY = 'dk_debug_mobile'
export function loadDebugMobile() {
  try { return localStorage.getItem(DEBUG_MOBILE_KEY) || '' } catch (e) { return '' }
}
export function saveDebugMobile(mobile) {
  try { localStorage.setItem(DEBUG_MOBILE_KEY, mobile) } catch (e) { /* webview禁localStorage时忽略 */ }
}

/* ---------------- 全局状态（单一 reactive 对象，避免布尔汤） ---------------- */
export const state = reactive({
  env: { mode: 'browser', platform: 'other', appVersion: '', bridgeReady: false }, // mode: app | browser
  user: { raw: '', parsed: null, source: '' },
  // 调试（仅浏览器）：mobile 可随时改，panel 面板开关；App 内不使用
  debug: { mobile: loadDebugMobile(), panel: false, logs: [], logPanel: false },
  // App 登录流程状态（阻断遮罩用）
  auth: { logining: false },
  // 内网连通性（组合A：连上公司 WiFi 才能访问内网 API = 在岗，替代定位/围栏/考勤点）
  net: { status: 'idle', api: '', checkedAt: 0, error: '' }, // idle | loading | ok | error
  clock: { status: 'idle' }, // idle | locating(检测内网) | submitting | success
  // 今日打卡计划（后端时刻表下发，替代原双班次写死模型）
  punch: {
    loading: false,
    user: null,        // 后端用户 {userId,userName,deptName,phone,ruleId}
    times: [],         // 今日时刻表 [{timeId,expectTime,startTime,endTime,timeRemark}]
    punched: 0,        // 今日已打卡次数（服务端）
    required: 0,       // 今日应打卡次数
    todayRecords: [],  // 今日服务端打卡记录 [{recordId,userId,punchTime}]
    rest: false        // 今日休息（无细则/无时刻）
  },
  records: []           // 全部本地打卡记录 [{seq,timeRemark,expectTime,status,date,time,ts,source,recordId,...}]
})

export function getTodayRecords() {
  return state.records.filter((r) => r.date === todayKey())
}

/* ---------------- 打卡记录存储（全量记录，跨天累积） ----------------
 * 旧版静态页按天存键 dkxt_records_YYYY-MM-DD，这里首次加载时自动迁移合并。 */
const RecordStore = {
  mem: [],
  KEY: 'dkxt_records_all',
  loadRaw() {
    try {
      const s = localStorage.getItem(this.KEY)
      return s ? JSON.parse(s) : []
    } catch (e) { return this.mem }
  },
  save(records) {
    this.mem = records
    try { localStorage.setItem(this.KEY, JSON.stringify(records)) } catch (e) { /* webview禁localStorage时降级内存 */ }
  }
}

/* 旧版按天存储 → 新版全量存储 一次性迁移 */
function migrateOldRecords() {
  try {
    const oldKey = 'dkxt_records_' + todayKey()
    const old = localStorage.getItem(oldKey)
    if (!old) return
    const arr = JSON.parse(old).map((r) => ({ ...r, date: r.time ? String(r.time).split(' ')[0] : todayKey(), time: r.time ? String(r.time).split(' ')[1] : '' }))
    const existing = RecordStore.loadRaw()
    const knownTs = new Set(existing.map((r) => r.ts))
    for (const r of arr) {
      if (!knownTs.has(r.ts)) existing.push(r)
    }
    RecordStore.save(existing)
    localStorage.removeItem(oldKey)
  } catch (e) { /* 迁移失败不阻塞主流程 */ }
}

/* 旧记录班次归一化：单班次时代的记录没有 shift 字段
 * （clockIn → am，clockOut → pm），归一化后统一按双班次模型处理 */
function normalizeShift(r) {
  if (r.shift) return r
  return { ...r, shift: r.type === 'clockIn' ? 'am' : 'pm' }
}

export const Records = {
  load() {
    migrateOldRecords()
    return RecordStore.loadRaw().map(normalizeShift)
  },
  save(records) { RecordStore.save(records) }
}

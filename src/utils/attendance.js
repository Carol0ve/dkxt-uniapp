/* ================================================================
 * 考勤业务层：内网可达性打卡（组合A）
 * ----------------------------------------------------------------
 * 方案：云端 H5（HTTP，仅 UI）+ 公司内网打卡 API（HTTP，数据层）。
 * 员工只有连上公司 WiFi 才能访问内网 API——"网络可达"即视为在岗，
 * 不再依赖定位 / 围栏 / 考勤点。
 * 流程：探活内网(3s超时) → 不可达提示"请连接公司WiFi后重试"
 *      → 可达则携带 ts + nonce + sign 提交内网 API。
 * 接口约定详见 config.js 顶部注释（springboot2-dkxt 侧实现）。
 * ================================================================ */
import { CONFIG } from '../config.js'
import { Env, Bridge, delay, todayKey, nowHM, parseUserInfoRaw, getNoLoginUserInfo, getUserInfoWithLogin, isEmptyUserInfo, setMockDebugEnabled } from './bridge.js'
import { state, logBridge, Records, getTodayRecords, pushDebugLog, hookConsoleToDebugLogs } from './store.js'

export function toast(msg) {
  uni.showToast({ title: String(msg), icon: 'none', duration: 2200 })
}

/* ---------------- 防重放随机串（时间戳36进制 + 随机段） ---------------- */
function genNonce() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

/* ---------------- 本机源IP（WebRTC 尽力而为，调试日志用） ----------------
 * 仅 HTTPS 或 localhost（安全上下文）可用；http://192.168.x.x 真机访问取不到。
 * 优先用后端 ping 返回的 clientIp（服务端视角的源IP），此函数仅作探测失败的兜底。 */
function getLocalIPs() {
  return new Promise((resolve) => {
    let ips = []
    let done = false
    const finish = (list) => { if (!done) { done = true; resolve(list) } }
    try {
      const pc = new RTCPeerConnection({ iceServers: [] })
      pc.createDataChannel('')
      pc.onicecandidate = (e) => {
        if (!e.candidate) { try { pc.close() } catch (_) {} finish(ips); return }
        const m = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(e.candidate.candidate || '')
        if (m && !ips.includes(m[1])) ips.push(m[1])
      }
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => finish(ips))
      setTimeout(() => { try { pc.close() } catch (_) {} finish(ips) }, 2000)
    } catch (e) { finish(ips) }
  })
}

/* ---------------- 内网可达性探测（多实例高可用） ----------------
 * 打卡前置检查：能连上内网 API 的 ping 端点 = 在公司 WiFi 内。
 * 遍历 CONFIG.INTRANET_APIS，按顺序逐个探活，第一台可达即选中为当前实例
 * （写入 state.net.api），后续打卡请求直连该实例；全部失败才视为"未连接公司网络"。
 * 任何失败（超时 / 拒绝 / 非2xx）都记为不可达。mock 模式直接模拟通过。
 * 每次探测写页面调试日志：目标IP（内网API地址）+ 源IP（后端 clientIp / WebRTC 兜底）。 */
export async function probeInternalNet() {
  state.net.status = 'loading'
  state.net.error = ''
  state.net.api = ''

  if (CONFIG.USE_MOCK) {
    await delay(400)
    state.net.checkedAt = Date.now()
    state.net.status = 'ok'
    state.net.api = (CONFIG.INTRANET_APIS || [CONFIG.INTRANET_API])[0]
    pushDebugLog({ type: 'probe', target: state.net.api, srcIp: '（mock）', ok: true, detail: '演示模式：模拟内网可达' })
    logBridge('probeInternalNet(mock)', `模拟内网可达（${state.net.api}）`)
    return true
  }

  const list = CONFIG.INTRANET_APIS && CONFIG.INTRANET_APIS.length
    ? CONFIG.INTRANET_APIS
    : [CONFIG.INTRANET_API]
  for (const api of list) {
    // debug=ON：告知后端本请求处于调试模式（后端据此开放调试接口）
    const url = api + CONFIG.INTRANET_PING_PATH + (CONFIG.DEBUG ? '?debug=ON' : '')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), CONFIG.INTRANET_TIMEOUT)
    const t0 = Date.now()
    try {
      const res = await fetch(url, { method: 'GET', signal: ctrl.signal, cache: 'no-store' })
      clearTimeout(timer)
      const ms = Date.now() - t0
      if (res.ok) {
        // 源IP：后端 ping 返回的 clientIp（服务端视角本机IP）
        let srcIp = ''
        try {
          const j = await res.json()
          srcIp = (j && j.data && j.data.clientIp) || ''
        } catch (_) { /* 忽略解析失败 */ }
        state.net.checkedAt = Date.now()
        state.net.api = api
        state.net.status = 'ok'
        pushDebugLog({ type: 'probe', target: api, srcIp: srcIp || '未知', ok: true, ms, detail: `内网可达 耗时${ms}ms` })
        logBridge('probeInternalNet', `内网可达（${api}）耗时${ms}ms clientIp=${srcIp}`)
        return true
      }
      state.net.error = `内网响应异常 HTTP ${res.status}（${api}）`
      pushDebugLog({ type: 'probe', target: api, srcIp: '未知', ok: false, ms, detail: `HTTP ${res.status}` })
      logBridge('probeInternalNet', state.net.error, true)
    } catch (e) {
      clearTimeout(timer)
      const ms = Date.now() - t0
      state.net.error = e.name === 'AbortError'
        ? `连接超时（${CONFIG.INTRANET_TIMEOUT}ms）`
        : (e && e.message ? e.message : '内网不可达')
      // 源IP兜底：探测失败时尝试 WebRTC 取本机 IP（非安全上下文可能为空）
      const localIPs = await getLocalIPs()
      const srcIp = localIPs.length ? localIPs.join(',') : '未知（非安全上下文）'
      pushDebugLog({ type: 'probe', target: api, srcIp, ok: false, ms, detail: state.net.error })
      logBridge('probeInternalNet', `实例不可用（${api}）: ${state.net.error}，尝试下一台`, true)
    }
  }
  state.net.checkedAt = Date.now()
  state.net.status = 'error'
  return false
}

/* 对外入口：手动重新检测（页面按钮 / 调试面板） */
export function checkNet() {
  probeInternalNet()
  toast('正在检测公司网络…')
}

/* ---------------- 当前打卡手机号 ----------------
 * 身份以手机号为准（后台录入考勤人员必有手机号）。
 * App 内取桥接用户手机号；浏览器调试用 CONFIG.TEST_MOBILE。
 * 拿不到手机号 = 未录入考勤系统，禁止打卡并提示联系管理员。 */
export function getMobile() {
  const p = state.user.parsed
  // App：桥接手机号为准（不允许调试面板覆盖）
  if (p && p.phone && Env.isApp()) return p.phone
  // 浏览器：调试面板手机号优先（可随时改），其次 mockUser 注入，最后 config 默认
  const dm = state.debug && state.debug.mobile ? String(state.debug.mobile).trim() : ''
  if (dm) return dm
  if (p && p.phone) return p.phone
  return CONFIG.TEST_MOBILE || ''
}

/* ---------------- 打卡流程 idle → locating(检测内网) → submitting → success ----------------
 * 双班次模型：按班次顺序推进（上午上班→上午下班→下午上班→下午下班），
 * 返回可辨识结构而非裸布尔/字符串，杜绝「上半天没打却打下午」这类非法状态。 */
export function getNextClockAction() {
  const today = getTodayRecords()
  for (let i = 0; i < state.shifts.length; i++) {
    const shift = state.shifts[i]
    const hasIn = today.some((r) => r.type === 'clockIn' && r.shift === shift.id)
    const hasOut = today.some((r) => r.type === 'clockOut' && r.shift === shift.id)
    if (!hasIn) return { type: 'clockIn', shiftIndex: i, shift }
    if (!hasOut) return { type: 'clockOut', shiftIndex: i, shift }
  }
  return { type: 'done' }
}

function buildRecord() {
  const d = new Date()
  const action = getNextClockAction()
  if (action.type === 'done') return null
  const hm = nowHM(d)
  /* 迟到=晚于本班次start打上班卡；早退=早于本班次end打下班卡（班次内独立判定） */
  let status = 'normal'
  if (action.type === 'clockIn' && hm > action.shift.start) status = 'late'
  if (action.type === 'clockOut' && hm < action.shift.end) status = 'early'
  return {
    type: action.type, shift: action.shift.id, status,
    date: todayKey(), time: hm, ts: d.getTime(),
    network: 'intranet',                        /* 新方案固定标记：经内网可达性校验 */
    source: CONFIG.USE_MOCK ? 'demo' : 'intranet',
    recordId: ''
  }
}

async function submitClock(record) {
  /* 加密串：App内取 getUserInfo(needSign=1)，后台验签防伪造 */
  let sign = ''
  if (Env.isApp()) {
    const r = Bridge.getUserInfo(1)
    logBridge('getUserInfo(sign=1)', r.ok ? '已获取加密串(' + String(r.data || '').length + '字符)' : r.error, !r.ok)
    if (r.ok) sign = String(r.data || '')
  }
  const body = {
    mobile: getMobile(),          // 手机号（后台唯一身份，必带；未录入已在前置拦截）
    userId: state.user.parsed && state.user.parsed.uid ? state.user.parsed.uid : 'guest',
    sign,
    type: record.type,
    shift: record.shift,          // am 上午班 / pm 下午班
    clientTime: new Date().toISOString(),
    ts: Date.now(),               // 时间戳(毫秒)，后台校验与服务端时间差<=5秒
    nonce: genNonce(),            // 防重放随机串，后台记录一次性使用
    network: 'intranet',          // 标记：已通过内网可达性校验
    debug: CONFIG.DEBUG ? 'ON' : 'OFF'   // 调试模式标记：后端据此开放调试接口
  }

  if (CONFIG.USE_MOCK) {
    logBridge('submitClock(mock)', JSON.stringify(body).slice(0, 160))
    await delay(700) // 模拟网络延迟
    return { ok: true, recordId: 'MOCK-' + Date.now() }
  }

  /* 多实例高可用：优先当前探活选中的实例（state.net.api），
   * 网络异常（fetch 抛错/响应非 JSON）时自动切换到下一台重试；
   * 业务错误（nonce 重复、参数非法等）不换机，直接返回，避免重复提交。 */
  const list = CONFIG.INTRANET_APIS && CONFIG.INTRANET_APIS.length
    ? CONFIG.INTRANET_APIS
    : [CONFIG.INTRANET_API]
  const apis = state.net.api
    ? [state.net.api, ...list.filter((a) => a !== state.net.api)]
    : list
  let lastErr = ''
  for (const api of apis) {
    try {
      const res = await fetch(`${api}/api/attendance/clock-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const json = await res.json()
      /* 兼容后端响应字段：RuoYi 的 R 用 msg，Node 模拟服务器用 message */
      const errMsg = json.msg || json.message || ''
      if (json.code === 200) {
        state.net.api = api
        logBridge('submitClock', `提交成功 recordId=${json.data && json.data.recordId}（${api}）`)
        return { ok: true, recordId: json.data && json.data.recordId, remoteStatus: json.data && json.data.status }
      }
      logBridge('submitClock', `业务失败(${api}): ${errMsg}`, true)
      return { ok: false, error: errMsg || 'code ' + json.code }
    } catch (e) {
      lastErr = e.message || '网络异常'
      logBridge('submitClock', `实例不可用(${api}): ${lastErr}，自动切换下一台`, true)
    }
  }
  return { ok: false, error: lastErr || '内网 API 全部不可用' }
}

export async function doClock() {
  if (state.clock.status === 'locating' || state.clock.status === 'submitting') return

  const action = getNextClockAction()
  if (action.type === 'done') { toast('今日全部班次打卡已完成'); return }

  /* 0) 前置：手机号（未录入考勤系统则拒绝打卡，提示联系管理员） */
  if (!getMobile()) {
    toast('未获取到手机号，请联系管理员')
    return
  }

  /* 1) 前置：内网可达性（未连接公司 WiFi 则拒绝提交） */
  state.clock.status = 'locating'
  const reachable = await probeInternalNet()
  if (!reachable) {
    state.clock.status = 'idle'
    toast('未连接公司网络，请连接公司 WiFi 后重试')
    return
  }

  /* 2) 提交打卡 */
  state.clock.status = 'submitting'
  const record = buildRecord()
  const submitRes = await submitClock(record)

  if (submitRes.ok) {
    state.clock.status = 'success'
    record.recordId = submitRes.recordId || ''
    state.records.push(record)
    Records.save(state.records)
    toast(`${action.shift.name}${action.type === 'clockIn' ? '上班' : '下班'}打卡成功`)
    setTimeout(() => { state.clock.status = 'idle' }, 2200)
  } else {
    state.clock.status = 'idle'
    toast('打卡提交失败：' + submitRes.error)
  }
}

/* ---------------- 用户信息（桥接，先等安卓桥注入） ---------------- */
async function waitForAndroidBridge(maxWaitMs) {
  if (!Env.isAndroid() || Env.androidBridgeReady()) return Env.androidBridgeReady()
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    await delay(200)
    if (Env.androidBridgeReady()) return true
  }
  return false
}

/* ---------------- App 登录拦截（对齐食堂阻断方案） ----------------
 * App 内未登录 → state.user.source='unlogin'，打卡页显示全屏阻断遮罩，
 * 点击"重新登录"走 loginApp() 拉起 App 原生登录。
 * 浏览器（调试）不阻断：URL 带合法 mockUser（调试开关开启）时模拟用户，
 * 否则保持演示模式，手机号由调试面板提供。 */
export async function initUser() {
  /* 浏览器调试模式：URL 显式注入 mockUser 才模拟登录用户，否则演示模式 */
  setMockDebugEnabled(CONFIG.DEBUG)
  if (!Env.isApp()) {
    const mock = await getNoLoginUserInfo(0)
    if (!isEmptyUserInfo(mock)) {
      state.user = { raw: JSON.stringify(mock), parsed: parseUserInfoRaw(mock), source: 'mock' }
      logBridge('initUser(mock)', `模拟用户 ${mock.mobile || ''}`)
    } else {
      // 浏览器无合法 mockUser：视为"未登录"，打卡页显示阻断遮罩（拦截非正常进入）
      state.user = { raw: '(非App环境未注入模拟用户)', parsed: null, source: 'none' }
      logBridge('initUser', '浏览器未携带 mockUser，进入阻断', true)
    }
    return
  }
  if (Env.isAndroid() && !Env.androidBridgeReady()) {
    await waitForAndroidBridge(5000)
  }
  const info = await getNoLoginUserInfo(0)
  if (!isEmptyUserInfo(info)) {
    state.user = { raw: JSON.stringify(info), parsed: parseUserInfoRaw(info), source: 'app' }
    logBridge('initUser', `已登录 ${parseUserInfoRaw(info).phone || info.uid || ''}`)
  } else {
    state.user = { raw: '(未登录)', parsed: null, source: 'unlogin' }
    logBridge('initUser', 'App 未登录，进入阻断页', true)
  }
}

/* 拉起 App 原生登录（阻断遮罩"重新登录"按钮调用） */
export async function loginApp() {
  if (state.auth.logining) return false
  state.auth.logining = true
  try {
    const loginRes = await getUserInfoWithLogin(0)
    if (!isEmptyUserInfo(loginRes)) {
      // 登录成功：重新静默拉取完整用户信息（含 mobile）
      const info = await getNoLoginUserInfo(0)
      if (!isEmptyUserInfo(info)) {
        state.user = { raw: JSON.stringify(info), parsed: parseUserInfoRaw(info), source: 'app' }
        logBridge('loginApp', `登录成功 ${parseUserInfoRaw(info).phone || info.uid || ''}`)
        return true
      }
    }
    toast('登录未生效，请重试')
    return false
  } catch (e) {
    logBridge('loginApp', '登录失败: ' + (e && e.message), true)
    toast('登录失败：' + ((e && e.message) || '未知错误'))
    return false
  } finally {
    state.auth.logining = false
  }
}

/* ---------------- 页面可见性：WebView 显示瞬间重新检测内网 ----------------
 * App 打开网页时 WebView 有一段隐藏期，期间 JS 执行会被系统挂起。
 * 解冻后若内网状态不是 ok（例如切网络/回前台），主动重新探测。 */
let visHooked = false
export function setupVisibilityHook() {
  if (visHooked || typeof document === 'undefined') return
  visHooked = true
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return
    if (state.net.status !== 'ok') {
      logBridge('visibilityChange', `页面转为可见（内网状态=${state.net.status}），重新检测`)
      probeInternalNet()
    }
  })
}

/* ---------------- 应用初始化（打卡页挂载时执行一次） ---------------- */
let inited = false
export async function initApp() {
  if (inited) return
  inited = true
  // 挂接 console → 页面调试日志（页面「调试日志」面板可查看浏览器控制台输出）
  hookConsoleToDebugLogs()
  state.env = {
    mode: Env.isApp() ? 'app' : 'browser',
    platform: Env.isAndroid() ? 'android' : Env.isIOS() ? 'ios' : 'other',
    appVersion: Env.appVersion(),
    bridgeReady: Env.androidBridgeReady()
  }
  logBridge('envDetect', `${state.env.mode} / ${state.env.platform} / ${state.env.appVersion || 'no-version'}`)

  state.records = Records.load()

  setupVisibilityHook()
  await Promise.all([initUser(), probeInternalNet()])
}

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
import { Env, Bridge, delay, todayKey, parseUserInfoRaw, getNoLoginUserInfo, getUserInfoWithLogin, isEmptyUserInfo, setMockDebugEnabled } from './bridge.js'
import { state, logBridge, Records, pushDebugLog, hookConsoleToDebugLogs } from './store.js'

export function toast(msg) {
  uni.showToast({ title: String(msg), icon: 'none', duration: 2200 })
}

/* ---------------- 通用后端请求（多实例高可用） ----------------
 * 优先使用探活选中的实例（state.net.api），网络异常（fetch 抛错/无 JSON）
 * 自动切换下一台重试；业务错误（code!==200）不换机直接返回，避免重复提交。 */
async function apiRequest(path, options = {}) {
  const list = CONFIG.INTRANET_APIS && CONFIG.INTRANET_APIS.length
    ? CONFIG.INTRANET_APIS
    : []
  const apis = state.net.api
    ? [state.net.api, ...list.filter((a) => a !== state.net.api)]
    : list
  let lastErr = ''
  for (const api of apis) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), CONFIG.INTRANET_TIMEOUT)
      const res = await fetch(api + path, { ...options, signal: ctrl.signal })
      clearTimeout(timer)
      let json = null
      try { json = await res.json() } catch (_) { /* 非 JSON 响应 */ }
      state.net.api = api
      if (json && typeof json.code !== 'undefined') {
        /* 标准 R 结构：业务成败以 code 为准（R.fail 也是 HTTP 200） */
        return { ok: json.code === 200, code: json.code, msg: json.msg || '', data: json.data }
      }
      if (res.ok) return { ok: true, code: 200, msg: '', data: json }
      lastErr = 'HTTP ' + res.status
    } catch (e) {
      lastErr = e.name === 'AbortError'
        ? `请求超时（${CONFIG.INTRANET_TIMEOUT}ms）`
        : (e && e.message ? e.message : '网络异常')
      logBridge('api', `实例不可用(${api}): ${lastErr}，切换下一台`, true)
    }
  }
  return { ok: false, code: -1, msg: lastErr || '后端不可用', data: null }
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
        state.net.checkedAt = Date.now()
        state.net.api = api
        state.net.status = 'ok'
        pushDebugLog({ type: 'probe', target: api, srcIp: '内网', ok: true, ms, detail: `内网可达 耗时${ms}ms` })
        logBridge('probeInternalNet', `内网可达（${api}）耗时${ms}ms`)
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
      pushDebugLog({ type: 'probe', target: api, srcIp: '未知', ok: false, ms, detail: state.net.error })
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

/* ---------------- 手机号 → 后端用户（同时校验是否录入） ---------------- */
async function fetchUserByPhone(mobile) {
  const res = await apiRequest(`/api/user/phone?phone=${encodeURIComponent(mobile)}`)
  if (res.ok && res.data) {
    state.punch.user = res.data
    return res.data
  }
  state.punch.user = null
  return null
}

/* ---------------- 解析后端 punchTime（兼容 ISO 与空格分隔） ---------------- */
function splitPunchTime(pt) {
  if (!pt) return { date: todayKey(), time: '' }
  const s = String(pt).replace('T', ' ')
  const parts = s.split(' ')
  return { date: parts[0] || todayKey(), time: parts[1] ? parts[1].slice(0, 8) : '' }
}

/* ---------------- 拉取今日打卡计划 ----------------
 * 依次：用户 → 今日已打卡 → 当日规则细则 → 打卡时刻表，
 * 汇总出「今日应打几次 / 已打几次 / 下一次打什么」，供打卡页渲染。 */
export async function refreshTodaySchedule() {
  const mobile = getMobile()
  if (!mobile) return
  state.punch.loading = true
  try {
    const user = await fetchUserByPhone(mobile)
    if (!user) {
      state.punch.times = []
      state.punch.punched = 0
      state.punch.required = 0
      state.punch.rest = false
      return
    }
    /* 今日已打卡 */
    const todayRes = await apiRequest(`/api/punch/today?userId=${user.userId}`)
    const todayList = (todayRes.ok && Array.isArray(todayRes.data)) ? todayRes.data : []
    state.punch.todayRecords = todayList
    state.punch.punched = todayList.length

    /* 当日细则（1-7 = 周一~周日） */
    const wd = new Date().getDay()
    const weekDay = wd === 0 ? 7 : wd
    const detailRes = await apiRequest(`/api/rule/detail/week?ruleId=${user.ruleId}&weekDay=${weekDay}`)
    if (!detailRes.ok || !detailRes.data) {
      state.punch.rest = true
      state.punch.times = []
      state.punch.required = 0
      return
    }
    const detail = detailRes.data
    const timeRes = await apiRequest(`/api/rule/time/list?detailId=${detail.detailId}`)
    const times = (timeRes.ok && Array.isArray(timeRes.data)) ? timeRes.data : []
    state.punch.times = times
    state.punch.required = (detail.punchCount && detail.punchCount > 0) ? detail.punchCount : times.length
    state.punch.rest = false
  } finally {
    state.punch.loading = false
  }
}

/* ---------------- 提交打卡（后端全权判定） ---------------- */
async function submitClock(mobile) {
  const res = await apiRequest('/api/punch/clock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: mobile })
  })
  if (res.ok) return { ok: true, data: res.data || {}, msg: res.msg }
  return { ok: false, error: res.msg || '打卡失败' }
}

/* 打卡成功：后端返回转本地记录并落 localStorage（含状态/时刻，供历史展示） */
function pushLocalRecord(data) {
  const { date, time } = splitPunchTime(data.punchTime)
  const rec = {
    recordId: data.recordId || '',
    seq: data.seq,
    total: data.total,
    timeRemark: data.timeRemark || '',
    expectTime: data.expectTime || '',
    status: data.status || 'normal',
    userName: data.userName || '',
    date,
    time,
    ts: Date.now(),
    source: 'server'
  }
  state.records.push(rec)
  Records.save(state.records)
  return rec
}

/* ---------------- 打卡流程 idle → locating → submitting → success ---------------- */
export async function doClock() {
  if (state.clock.status === 'locating' || state.clock.status === 'submitting') return

  /* 0) 手机号前置 */
  const mobile = getMobile()
  if (!mobile) {
    toast('未获取到手机号，请联系管理员')
    return
  }

  /* 1) 内网可达性 */
  state.clock.status = 'locating'
  const reachable = await probeInternalNet()
  if (!reachable) {
    state.clock.status = 'idle'
    toast('未连接公司网络，请连接公司 WiFi 后重试')
    return
  }

  /* 2) 提交打卡（后端判定报备/规则/窗口/迟到） */
  state.clock.status = 'submitting'
  const res = await submitClock(mobile)

  if (res.ok) {
    state.clock.status = 'success'
    const data = res.data || {}
    pushLocalRecord(data)
    await refreshTodaySchedule()
    const late = data.status === 'late'
    toast(late ? '打卡成功（迟到）' : (res.msg || '打卡成功'))
    setTimeout(() => { state.clock.status = 'idle' }, 2200)
  } else {
    state.clock.status = 'idle'
    toast(res.error) // 后端 msg 已是友好文案
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

  // 拉取今日打卡计划（用户就绪后，得到今日时刻表与已打卡次数）
  await refreshTodaySchedule()
}

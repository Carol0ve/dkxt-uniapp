/* ================================================================
 * 融媒 App JSBridge 封装（对齐官方 gxrbBridge.js / 食堂报餐系统方案）
 * ----------------------------------------------------------------
 * 重要：所有桥方法都可能不存在（window.imagelistner is not defined），
 * 必须包在 try-catch 里使用 —— 官方注释原话。
 *
 * 用户信息字段（App 返回 JSON）：
 *   {avatar_path, birthday, invitcode, mediatype, mobile, qqBind, region,
 *    sex, token, uid, ulevel, username, wbBind, wxBind}
 *   - 手机号字段为 mobile（打卡身份以此为准）
 *   - 未登录返回空对象 {}
 *
 * 浏览器调试（非 App）：
 *   - 仅当 URL 显式携带合法 ?mockUser={"mobile":"..."}（必含 mobile）
 *     且调试开关已开启（setMockDebugEnabled(true)）时才模拟用户；
 *   - 否则一律视为"未登录/演示模式"，靠打卡页调试面板提供手机号。
 * ================================================================ */

export const UA = (typeof navigator !== 'undefined' ? navigator.userAgent : '')

export const Env = {
  ua: UA,
  isApp() { return UA.toLowerCase().indexOf('gxrbapp') > -1 },
  isAndroid() { return UA.indexOf('Android') > -1 || UA.indexOf('Adr') > -1 },
  isIOS() { return /iphone|ipad|ipod|macintosh/gi.test(UA) && /mobile|ios|gxrbapp/gi.test(UA + ' ') },
  appVersion() {
    const m = UA.match(/gxrbapp\/\d+\.\d+\.\d+/gi)
    return m ? m[0] : ''
  },
  androidBridgeReady() {
    return typeof window !== 'undefined' && !!window.imagelistner
  }
}

export const Bridge = {
  /**
   * 统一桥调用入口。
   * @param {string} fnName 原生方法名（如 getLocationH5 / getUserInfo）
   * @param {object|undefined} args 参数对象；undefined 表示安卓端无参调用
   * @returns {{ok: boolean, data?: string, error?: string}}
   */
  call(fnName, args) {
    if (!Env.isApp()) return { ok: false, error: '非App环境，桥接不可用' }
    try {
      if (Env.isAndroid()) {
        if (!window.imagelistner || typeof window.imagelistner[fnName] !== 'function') {
          return { ok: false, error: `安卓桥方法不存在: imagelistner.${fnName}` }
        }
        const result = (args === undefined)
          ? window.imagelistner[fnName]()
          : window.imagelistner[fnName](JSON.stringify(args))
        return { ok: true, data: (result === undefined || result === null) ? '' : String(result) }
      }
      if (Env.isIOS()) {
        // iOS 协议：prompt(JSON.stringify({type:'JSbridge', functionName, arguments}))
        const payload = { type: 'JSbridge', functionName: fnName, arguments: args || {} }
        const result = prompt(JSON.stringify(payload))
        return { ok: true, data: result || '' }
      }
      return { ok: false, error: '未识别的App平台' }
    } catch (e) {
      return { ok: false, error: '桥接调用异常: ' + (e && e.message) }
    }
  },
  /* 获取定位：返回原始字符串（JSON可解析），与官方 getAppLocationInfo 对齐 */
  getLocationRaw() { return this.call('getLocationH5') },
  /* 获取用户信息 needSign: 0明文 1加密（安卓包成JSON串参数，iOS放进arguments） */
  getUserInfo(needSign) { return this.call('getUserInfo', { needSign: String(needSign) }) },
  getMultiUserInfo(needSign) { return this.call('getMultiUserInfo', { needSign: String(needSign) }) },
  getUserInfoWithOutLogin(needSign) { return this.call('getUserInfoWithOutLogin', { needSign: String(needSign) }) }
}

/* ================================================================
 * 浏览器调试：URL 注入模拟用户（对齐食堂方案）
 * ================================================================ */

/**
 * 调试开关：是否允许 URL 注入模拟用户（?mockUser=...）
 * 由调用方（config DEBUG / 后端 debugSwitch）启动时设置，默认关闭。
 * 关闭时一律拦截 mockUser 参数，浏览器视为"未登录/演示"。
 */
let mockDebugEnabled = false
export function setMockDebugEnabled(enabled) {
  mockDebugEnabled = !!enabled
}

/* mockUser 参数必须包含的字段：mobile 手机号（唯一必填） */
const MOCK_REQUIRED_FIELDS = ['mobile']

function parseUrlParam(name) {
  try {
    const search = typeof window !== 'undefined' ? window.location.search : ''
    const match = search.match(new RegExp('[?&]' + name + '=([^&]+)'))
    return match ? decodeURIComponent(match[1]) : null
  } catch (e) {
    return null
  }
}

/**
 * 解析 URL 注入的模拟用户 —— 仅支持显式注入，绝不默认模拟
 * @returns {Object|null} 合法模拟用户；无参数/不合法/开关关闭返回 null
 */
function resolveMockUser() {
  const urlParam = parseUrlParam('mockUser')
  if (urlParam === null || urlParam === '') return null
  // 调试开关拦截：未开启则忽略 mockUser
  if (!mockDebugEnabled) {
    console.warn('[bridge] 调试开关未开启，已拦截 mockUser 参数')
    return null
  }
  if (urlParam === 'none') return {} // 显式模拟未登录
  try {
    const obj = JSON.parse(urlParam)
    if (obj && typeof obj === 'object') {
      const hasRequired = MOCK_REQUIRED_FIELDS.every((key) => {
        const v = obj[key]
        return v !== undefined && v !== null && String(v).trim() !== ''
      })
      if (hasRequired) {
        const mobile = String(obj.mobile).trim()
        if (obj.uid === undefined || obj.uid === null || String(obj.uid).trim() === '') {
          obj.uid = 'mock-' + mobile
        }
        if (obj.username === undefined || obj.username === null || String(obj.username).trim() === '') {
          obj.username = obj.nickName || obj.realName || '模拟用户'
        }
        return obj
      }
      console.warn('[bridge] mockUser 缺少必要字段(mobile)，已忽略')
      return null
    }
  } catch (e) {
    console.warn('[bridge] mockUser 不是合法 JSON，已忽略')
    return null
  }
  return null
}

/** 用户信息是否为空（未登录/空对象） */
export function isEmptyUserInfo(userInfo) {
  return !userInfo || (typeof userInfo === 'object' && Object.keys(userInfo).length === 0)
}

/**
 * 静默获取用户信息（不触发 App 登录）
 * - App 内：已登录返回完整用户信息（含 mobile）；未登录返回 {}
 * - 浏览器：URL 带合法 mockUser（开关开启）时模拟用户；否则返回 {}
 * @param {string} needSign '0'不加密 '1'加密
 * @returns {Promise<Object>}
 */
export function getNoLoginUserInfo(needSign = '0') {
  return new Promise((resolve) => {
    if (!Env.isApp()) {
      resolve(resolveMockUser() || {})
      return
    }
    try {
      const r = Bridge.getUserInfoWithOutLogin(needSign)
      if (r.ok && r.data) {
        try { resolve(JSON.parse(r.data)) } catch (e) { resolve(r.data) }
      } else {
        resolve({})
      }
    } catch (e) {
      resolve({})
    }
  })
}

/**
 * 获取用户信息（未登录会拉起 App 原生登录页）
 * - App 内：已登录返回 {uid, token, device}；未登录自动弹登录页，返回后
 *   需再次 getNoLoginUserInfo 确认
 * - 浏览器：仅 mockUser 有效时模拟"已登录"；否则返回 {}（浏览器无原生登录页）
 * @param {string} needSign '0'不加密 '1'加密
 * @returns {Promise<Object>}
 */
export function getUserInfoWithLogin(needSign = '0') {
  return new Promise((resolve, reject) => {
    if (!Env.isApp()) {
      const mock = resolveMockUser()
      if (mock && Object.keys(mock).length > 0) {
        resolve({ uid: mock.uid || mock.mobile || 'dev-user', token: mock.token || 'dev-token-' + Date.now(), device: 'web' })
      } else {
        resolve({})
      }
      return
    }
    try {
      const r = Bridge.getUserInfo(needSign)
      if (r.ok && r.data) {
        try { resolve(JSON.parse(r.data)) } catch (e) { resolve(r.data) }
      } else {
        resolve({})
      }
    } catch (e) {
      reject(e)
    }
  })
}

/* ================================================================
 * 通用工具函数
 * ================================================================ */
export function pad2(n) { return String(n).padStart(2, '0') }
export function nowHM(d) { d = d || new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) }
export function todayKey(d) {
  d = d || new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
export function delay(ms) { return new Promise((r) => setTimeout(r, ms)) }

/* Haversine 两点距离（米）。同坐标系内计算，不受 GCJ-02/WGS-84 差异影响 */
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

/* 时间字符串 HH:MM 合法性 */
export function isValidHM(s) { return typeof s === 'string' && /^\d{2}:\d{2}$/.test(s) && s < '24:00' }

/* 安全解析定位原始返回：可能是 JSON 字符串/对象，多字段命名兼容
 * 已实测融媒App返回结构：{"lat":"23.388972...","lng":"110.0692615","location":"广西...桂贵路"} */
export function parseLocationRaw(raw) {
  if (raw === null || raw === undefined) return null
  let obj = raw
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return null
    try { obj = JSON.parse(s) } catch (e) { return { __unparsed: raw } }
  }
  if (typeof obj !== 'object') return { __unparsed: String(raw) }
  const pick = (...keys) => {
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]
    }
    return null
  }
  const lat = parseFloat(pick('lat', 'latitude', 'la', 'y'))
  const lng = parseFloat(pick('lng', 'lon', 'longitude', 'lngs', 'x'))
  const address = pick('location', 'address', 'addr', 'formatted_address', 'formattedAddress', 'description', 'poi')
  const accuracy = parseFloat(pick('accuracy', 'radius', 'precision'))
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    address: address ? String(address) : '',
    accuracy: Number.isFinite(accuracy) ? accuracy : null
  }
}

/* 用户信息解析（字段命名兼容） */
export function parseUserInfoRaw(raw) {
  let obj = raw
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch (e) { return { name: '', uid: '' } }
  }
  if (!obj || typeof obj !== 'object') return { name: '', uid: '' }
  const pick = (...keys) => { for (const k of keys) { if (obj[k]) return obj[k] } return '' }
  return {
    uid: String(pick('uid', 'userId', 'user_id', 'id') || ''),
    name: String(pick('nickName', 'nickname', 'name', 'userName', 'username') || ''),
    phone: String(pick('phone', 'mobile', 'tel') || ''),
    avatar: String(pick('avatar', 'avatarUrl', 'headImg', 'headimgurl') || ''),
    dept: String(pick('dept', 'department', 'orgName', 'org') || '')
  }
}

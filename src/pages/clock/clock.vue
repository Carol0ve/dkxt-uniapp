<template>
  <view class="page">
    <!-- 环境状态条 -->
    <view class="env-bar">
      <view class="env-left">
        <view class="env-dot" :class="envDotClass"></view>
        <text class="env-text">{{ envText }}</text>
      </view>
      <text class="env-date num">{{ envDate }}</text>
    </view>

    <!-- 蓝色 Hero -->
    <view class="hero">
      <view class="hero-user">
        <view class="avatar">
          <image v-if="userAvatar" class="avatar-img" :src="userAvatar" mode="aspectFill" />
          <text v-else>{{ avatarChar }}</text>
        </view>
        <view class="hero-user-info">
          <text class="hero-name">{{ userName }}</text>
          <text class="hero-dept">{{ userDept }}</text>
        </view>
        <text class="hero-greet">{{ greetText }}</text>
      </view>
      <view class="hero-clock">
        <!-- <text class="hero-clock-label">CURRENT TIME</text>
        <text class="hero-time num">{{ timeText }}</text> -->
        <view class="hero-shift">
          <text>今日班次 · 行政班</text>
          <text v-for="(s, i) in state.shifts" :key="s.id" class="shift-tag num" :class="{ active: i === activeShiftIndex }">
            {{ s.name }} {{ s.start }}-{{ s.end }}
          </text>
        </view>
      </view>
    </view>

    <!-- 打卡圆环卡片 -->
    <view class="clock-card">
      <button class="ring-btn" :class="ringClass" :aria-label="ringAria" @click="doClock">
        <view class="ring-inner">
          <template v-if="clockStatus === 'locating' || clockStatus === 'submitting'">
            <text class="ring-sub">{{ clockStatus === 'locating' ? '检测中' : '提交中' }}</text>
            <view class="ring-spinner"></view>
          </template>
          <template v-else-if="clockStatus === 'success'">
            <svg class="check-svg" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="24" stroke-width="2.5" />
              <path class="check-path" d="M15 27l7.5 7.5L37 20" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </template>
          <template v-else>
            <text class="ring-sub">{{ ringSubText }}</text>
            <text class="ring-main">{{ ringMainText }}</text>
            <text class="ring-time num">{{ timeText }}</text>
          </template>
        </view>
      </button>

      <view class="fence-tip" :class="fenceClass">
        <view class="fence-ico">
          <svg v-if="fenceIcon === 'wifi'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" />
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 9v4" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="9" />
          </svg>
        </view>
        <text>{{ fenceText }}</text>
      </view>
    </view>

    <!-- 网络状态卡 -->
    <view class="card">
      <view class="card-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" />
        </svg>
        <text>公司网络</text>
        <text class="title-right">{{ netSourceText }}</text>
      </view>
      <view class="loc-row">
        <view class="loc-pin">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" />
          </svg>
        </view>
        <view class="loc-main">
          <text class="loc-address">{{ netAddress }}</text>
          <view class="loc-meta">
            <text v-for="(chip, i) in netChips" :key="i" class="meta-chip" :class="chip.cls">{{ chip.text }}</text>
          </view>
        </view>
      </view>
      <view class="loc-actions">
        <button class="ghost-btn" aria-label="重新检测公司网络" @click="checkNetNow">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
          </svg>
          <text>重新检测</text>
        </button>
        <button v-if="state.env.mode !== 'app'" class="ghost-btn" aria-label="调试打卡手机号" @click="openDebug">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          <text>调试手机号</text>
        </button>
        <button class="ghost-btn" aria-label="查看调试日志" @click="state.debug.logPanel = !state.debug.logPanel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" />
          </svg>
          <text>调试日志</text>
        </button>
      </view>
    </view>

    <!-- 今日打卡记录 -->
    <view class="card">
      <view class="card-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
        </svg>
        <text>今日打卡</text>
        <text class="title-right">{{ todaySummary }}</text>
      </view>
      <view class="tl-item" v-for="row in timelineRows" :key="row.key">
        <view class="tl-rail">
          <view class="tl-dot" :class="row.rec ? (row.rec.status === 'normal' ? 'done' : 'late') : ''"></view>
        </view>
        <view class="tl-body">
          <view class="tl-head">
            <text class="tl-label">{{ row.label }}</text>
            <text class="tl-time num">{{ row.rec ? row.rec.time : '' }}</text>
            <text v-if="row.rec" class="tl-badge" :class="row.rec.status">{{ statusText[row.rec.status] || row.rec.status }}</text>
          </view>
          <text class="tl-sub">{{ row.rec ? recordSub(row.rec) : '未打卡' }}</text>
        </view>
      </view>
    </view>

    <!-- Mock 模式提示 -->
    <view class="mode-banner" v-if="CONFIG.USE_MOCK">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
      </svg>
      <text>演示模式：后台 springboot2-dkxt 接口未接入，当前使用静态数据演示（内网连通性模拟通过）。上线时把 USE_MOCK 改为 false 并填 INTRANET_APIS，打卡改为真实内网校验——连接公司 WiFi 才能提交，否则提示重试。接口约定见 config.js 注释。</text>
    </view>

    <view class="footer-note">桂平市融媒体中心 · 考勤系统</view>

    <!-- App 未登录阻断遮罩（参考食堂报餐阻断页）：非正常进入网页/未登录一律拦截去登录 -->
    <view v-if="showAuthBlock" class="auth-block">
      <view class="auth-block-content">
        <view class="auth-block-icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
          </svg>
        </view>
        <view class="auth-block-title">考勤打卡系统</view>
        <view class="auth-block-desc">{{ authBlockDesc }}</view>
        <view class="auth-block-btn-wrap">
          <view class="auth-block-btn" @click="handleAppLogin">{{ authBlockBtn }}</view>
          <view class="auth-block-hint">{{ authBlockHint }}</view>
        </view>
      </view>
    </view>

    <!-- 调试面板：临时修改打卡手机号（仅浏览器模式，App 内使用桥接手机号） -->
    <view v-if="state.env.mode !== 'app' && state.debug.panel" class="debug-mask" @click.self="state.debug.panel = false">
      <view class="debug-panel">
        <view class="debug-panel-head">
          <text class="debug-panel-title">调试打卡手机号</text>
          <text class="debug-panel-sub">仅浏览器调试用，可随时修改；App 内自动使用桥接手机号</text>
        </view>
        <text class="debug-cur">当前：{{ debugMobileText }}</text>
        <input class="debug-input num" type="number" maxlength="11" v-model="debugInput" placeholder="输入 11 位手机号" />
        <view class="debug-actions">
          <button class="debug-btn cancel" @click="state.debug.panel = false">取消</button>
          <button class="debug-btn save" @click="saveDebug">保存</button>
        </view>
      </view>
    </view>

    <!-- 调试日志面板：探测内网时记录 目标IP / 源IP / 结果 -->
    <view v-if="state.debug.logPanel" class="debug-mask" @click.self="state.debug.logPanel = false">
      <view class="debug-panel log-panel">
        <view class="debug-panel-head log-panel-head">
          <text class="debug-panel-title">调试日志</text>
          <text class="debug-panel-sub">探测内网记录：目标IP=内网API地址，源IP=后端clientIp（失败时WebRTC兜底）</text>
        </view>
        <view class="log-status">
          <text>网络状态：{{ logNetStatusText }}</text>
          <text v-if="state.net.api" class="log-api">当前实例 {{ state.net.api }}</text>
        </view>
        <view class="log-list" v-if="state.debug.logs.length">
          <view class="log-item" v-for="log in state.debug.logs" :key="log.id">
            <text class="log-time num">{{ log.time }}</text>
            <text class="log-tag" :class="logTagCls(log)">{{ logTagText(log) }}</text>
            <view class="log-body">
              <template v-if="!log.level">
                <text class="log-line">目标IP {{ log.target }}</text>
                <text class="log-line">源IP {{ log.srcIp || '未知' }}<text v-if="log.ms" class="log-ms num"> · {{ log.ms }}ms</text></text>
              </template>
              <text :class="log.level ? 'log-line' : 'log-line dim'">{{ log.detail }}</text>
            </view>
          </view>
        </view>
        <view v-else class="log-empty">暂无日志（进入页面/点重新检测后生成）</view>
        <view class="debug-actions">
          <button class="debug-btn cancel" @click="state.debug.logPanel = false">关闭</button>
          <button class="debug-btn save" @click="clearLogs">清空</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { CONFIG } from '@/config.js'
import { state, getTodayRecords, saveDebugMobile, clearDebugLogs } from '@/utils/store.js'
import { initApp, checkNet, doClock, getNextClockAction, loginApp, toast } from '@/utils/attendance.js'
import { Env, pad2, todayKey } from '@/utils/bridge.js'

const statusText = { normal: '正常', late: '迟到', early: '早退' }

/* 时钟 */
const timeText = ref('--:--:--')
const envDate = ref('')
let timer = null

/* 环境状态 */
const envDotClass = computed(() => {
  if (state.env.mode === 'app') {
    const bridgeOk = state.env.platform === 'android' ? state.env.bridgeReady : true
    return bridgeOk ? 'ok' : 'warn'
  }
  return 'warn'
})
const envText = computed(() => {
  if (state.env.mode === 'app') {
    const bridgeOk = state.env.platform === 'android' ? state.env.bridgeReady : true
    return `融媒App · ${state.env.platform === 'android' ? '安卓' : 'iOS'}${state.env.appVersion ? ' · ' + state.env.appVersion.replace('gxrbapp/', 'v') : ''}${bridgeOk ? '' : ' · 桥未注入'}`
  }
  return '浏览器模式 · 内网可达性打卡（演示）'
})

/* 用户信息 */
const userName = computed(() => {
  const p = state.user.parsed
  if (p && (p.name || p.uid)) return p.name || ('用户 ' + p.uid)
  if (state.env.mode === 'app') return '未获取到用户'
  return '演示用户'
})
const userDept = computed(() => {
  const p = state.user.parsed
  if (p && (p.name || p.uid)) return p.dept || '桂平市融媒体中心'
  if (state.env.mode === 'app') return '请先在融媒App内登录'
  return '浏览器环境 · App内将自动获取身份'
})
const avatarChar = computed(() => {
  const p = state.user.parsed
  if (p && (p.name || p.uid)) return (p.name || '融').slice(0, 1)
  return state.env.mode === 'app' ? '融' : '演'
})
const userAvatar = computed(() => (state.user.parsed && state.user.parsed.avatar) || '')

const greetText = computed(() => {
  const h = new Date().getHours()
  return h < 6 ? '夜班辛苦了' : h < 12 ? '上午好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'
})

/* 班次（双班次：下一个打卡动作所在的班次高亮） */
const nextAction = computed(() => getNextClockAction())
const clockType = computed(() => nextAction.value.type)
const activeShiftIndex = computed(() => nextAction.value.type === 'done' ? -1 : nextAction.value.shiftIndex)

/* 打卡圆环 */
const clockStatus = computed(() => state.clock.status)
const ringClass = computed(() => {
  const cls = []
  const st = state.clock.status
  if (st === 'success') cls.push('success')
  if (st === 'idle') {
    const blocked = state.net.status === 'error' || clockType.value === 'done'
    if (blocked) cls.push('disabled')
  }
  return cls.join(' ')
})
const ringSubText = computed(() => {
  const a = nextAction.value
  if (a.type === 'done') return '今日打卡'
  return `${a.shift.name}${a.type === 'clockIn' ? '上班' : '下班'}打卡`
})
const ringMainText = computed(() => {
  const t = clockType.value
  return t === 'clockIn' ? '上 班' : t === 'clockOut' ? '下 班' : '已完成'
})
const ringAria = computed(() => ringSubText.value + '按钮')

/* 网络状态提示（内网可达性打卡） */
const fenceClass = computed(() => (state.net.status === 'error' ? 'err' : ''))
const fenceText = computed(() => {
  if (state.net.status === 'loading') return '正在检测公司网络…'
  if (state.net.status === 'ok') return '已连接公司网络，可以打卡'
  if (state.net.status === 'error') return '未连接公司网络，请连接公司 WiFi 后重试'
  return '正在检测公司网络…'
})
const fenceIcon = computed(() => (state.net.status === 'error' ? 'warn' : 'wifi'))

/* 网络状态信息 */
const netSourceText = computed(() => {
  const N = state.net
  if (N.status === 'loading') return '检测中'
  if (N.status === 'ok') return '已连通'
  if (N.status === 'error') return '不可达'
  return '未检测'
})
const netAddress = computed(() => {
  const N = state.net
  if (N.status === 'loading') return '正在探测内网 API…'
  if (N.status === 'error') return N.error || '内网不可达'
  return N.api || (CONFIG.INTRANET_APIS || [CONFIG.INTRANET_API])[0]
})
const netChips = computed(() => {
  const N = state.net
  const chips = []
  if (N.checkedAt) {
    const d = new Date(N.checkedAt)
    chips.push({ text: `检测于 ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`, cls: '' })
  }
  if (N.status === 'ok') chips.push({ text: '打卡将直连内网服务器', cls: '' })
  if (CONFIG.USE_MOCK) chips.push({ text: '演示模式(模拟连通)', cls: 'warn' })
  return chips
})

/* 今日记录（双班次：上午上班/上午下班/下午上班/下午下班 四行时间线） */
const timelineRows = computed(() => {
  const today = getTodayRecords()
  const rows = []
  for (const s of state.shifts) {
    rows.push({
      key: `${s.id}-in`,
      label: `${s.name}上班`,
      rec: today.find((r) => r.type === 'clockIn' && r.shift === s.id)
    })
    rows.push({
      key: `${s.id}-out`,
      label: `${s.name}下班`,
      rec: today.find((r) => r.type === 'clockOut' && r.shift === s.id)
    })
  }
  return rows
})
const todaySummary = computed(() => {
  const total = state.shifts.length * 2
  const n = getTodayRecords().length
  return n >= total ? '已完成' : `${n} / ${total}`
})
function recordSub(rec) {
  /* 新方案记录只有 network 标记；兼容旧版含地址的打卡记录 */
  if (rec.address) return `${rec.address}${rec.distance != null ? ' · 距考勤点' + rec.distance + 'm' : ''}`
  return rec.network === 'intranet' ? '公司内网打卡' : '演示打卡'
}

function checkNetNow() {
  checkNet()
}

/* ---------------- 登录阻断（未登录全屏遮罩，对齐食堂方案） ----------------
 * App 内未登录、浏览器未注入合法 mockUser：一律拦截，非正常进入无法使用打卡 */
const showAuthBlock = computed(() => {
  if (state.env.mode === 'app') return state.user.source === 'unlogin'
  // 浏览器：无合法 mockUser（未带参数 / 调试开关未开）视为"未登录"，拦截
  return state.user.source === 'none'
})
const authBlockDesc = computed(() => {
  if (state.env.mode === 'app') {
    return state.auth.logining ? '正在拉起 App 登录...' : '未登录无法使用打卡功能，请登录后使用'
  }
  return '非 App 正常入口访问已拦截：请在融媒App内打开本系统；浏览器调试请在地址栏追加 ?mockUser={"mobile":"手机号"}'
})
const authBlockBtn = computed(() => {
  if (state.env.mode === 'app') return state.auth.logining ? '登录中...' : '重新登录'
  return '刷新重试'
})
const authBlockHint = computed(() => {
  if (state.env.mode === 'app') return '未登录无法使用打卡功能，请先登录'
  return '仅支持 URL 注入 mockUser 调试（需开启调试开关 DEBUG）'
})
async function handleAppLogin() {
  if (state.env.mode === 'app') {
    const ok = await loginApp()
    if (ok) toast('登录成功')
    /* 失败时 loginApp 已 toast 提示，遮罩保持 */
  } else {
    toast('浏览器调试请携带 ?mockUser={"mobile":"手机号"} 访问')
  }
}

/* ---------------- 调试手机号面板（浏览器模式） ---------------- */
const debugInput = ref('')
const debugMobileText = computed(() => state.debug.mobile || CONFIG.TEST_MOBILE || '未设置')
function openDebug() {
  debugInput.value = state.debug.mobile || CONFIG.TEST_MOBILE || ''
  state.debug.panel = true
}
function saveDebug() {
  const m = String(debugInput.value || '').trim()
  if (!/^\d{11}$/.test(m)) { toast('请输入 11 位手机号'); return }
  state.debug.mobile = m
  saveDebugMobile(m)
  state.debug.panel = false
  toast(`调试手机号已设为 ${m}`)
}

/* ---------------- 调试日志面板 ---------------- */
const logNetStatusText = computed(() => {
  const N = state.net
  if (N.status === 'loading') return '检测中'
  if (N.status === 'ok') return '已连通'
  if (N.status === 'error') return `不可达（${N.error || ''}）`
  return '未检测'
})
function clearLogs() {
  clearDebugLogs()
  toast('日志已清空')
}
/* console 日志显示 INFO/WARN/ERROR 标签；探测日志显示 成功/失败 */
function logTagText(log) {
  if (log.level) return log.level.toUpperCase()
  return log.ok ? '成功' : '失败'
}
function logTagCls(log) {
  if (log.level === 'warn' || log.level === 'error') return 'fail'
  return log.ok ? 'ok' : 'fail'
}

function fmtTime(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

onMounted(async () => {
  timer = setInterval(() => { timeText.value = fmtTime(new Date()) }, 1000)
  timeText.value = fmtTime(new Date())
  const d = new Date()
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  envDate.value = `${d.getMonth() + 1}月${d.getDate()}日 星期${week}`
  await initApp()
})

onShow(() => {
  if (typeof document !== 'undefined') document.title = '考勤打卡'
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.page {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  padding-bottom: 80px; /* 让出底部 tabBar */
}

/* 环境状态条 */
.env-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; font-size: 12px; color: var(--muted);
  background: var(--seed-surface); border-bottom: 1px solid var(--border);
}
.env-left { display: flex; align-items: center; }
.env-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); margin-right: 6px; }
.env-dot.ok { background: var(--seed-accent); }
.env-dot.warn { background: var(--warn); }
.env-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.env-date { color: var(--faint); white-space: nowrap; }

/* Hero（浅主色下渐变起点加深一档，保证白字可读） */
.hero {
  background: linear-gradient(158deg, var(--seed-primary) 0%, var(--primary-deep) 100%);
  color: var(--on-primary); padding: 22px 20px 72px;
  text-shadow: 0 1px 2px rgba(0, 24, 64, 0.22);
}
@supports (color: color-mix(in srgb, red 50%, blue)) {
  .hero {
    background: linear-gradient(158deg, color-mix(in srgb, var(--seed-primary) 84%, var(--primary-shadow)) 0%, var(--primary-deep) 100%);
  }
}
.hero-user { display: flex; align-items: center; }
.avatar {
  width: 44px; height: 44px; border-radius: 50%; flex: none;
  background: rgba(255, 255, 255, 0.18);
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; font-weight: 600; color: var(--on-primary);
  overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.28);
  margin-right: 12px;
}
.avatar-img { width: 100%; height: 100%; }
.hero-user-info { flex: 1; min-width: 0; }
.hero-name { font-size: calc(16px * var(--seed-type-scale)); font-weight: 600; letter-spacing: 0.01em; display: block; }
.hero-dept { font-size: 12px; opacity: 0.82; letter-spacing: 0.01em; margin-top: 1px; display: block; }
.hero-greet { font-size: 12px; opacity: 0.85; letter-spacing: 0.02em; white-space: nowrap; }
.hero-clock { margin-top: 26px; }
.hero-clock-label { font-size: 12px; letter-spacing: 0.08em; opacity: 0.78; }
.hero-time {
  font-size: calc(56px * var(--seed-type-scale));
  font-weight: 600; letter-spacing: -0.02em; line-height: 1.05;
  font-variant-numeric: tabular-nums; margin-top: 4px; display: block;
}
.hero-shift { margin-top: 8px; font-size: 13px; opacity: 0.9; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 0; }
.shift-tag {
  font-size: 11px; padding: 2px 8px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.16); letter-spacing: 0.02em; margin-left: 6px;
}
.shift-tag.active { background: rgba(255, 255, 255, 0.34); font-weight: 600; }

/* 打卡圆环卡片 */
.clock-card {
  background: var(--seed-surface);
  margin: -52px 16px 0;
  border-radius: var(--seed-radius);
  box-shadow: var(--shadow-card);
  padding: 26px 20px 22px;
  display: flex; flex-direction: column; align-items: center;
  position: relative; z-index: 2;
}
.ring-btn {
  position: relative; width: 196px; height: 196px;
  border-radius: 50%;
  background: linear-gradient(165deg, var(--seed-primary), var(--primary-deep));
  color: var(--on-primary);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  box-shadow: var(--shadow-ring);
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.2s ease;
  -webkit-user-select: none; user-select: none;
  padding: 0; line-height: inherit;
}
.ring-btn::after { border: none; }
.ring-btn:active { transform: scale(0.965); }
.ring-btn:focus-visible { outline: 2px dashed rgba(255, 255, 255, 0.85); outline-offset: 4px; }
.ring-inner {
  position: absolute; inset: 14px; border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
}
.ring-main { font-size: calc(22px * var(--seed-type-scale)); font-weight: 600; letter-spacing: 0.04em; }
.ring-sub { font-size: 12px; opacity: 0.85; letter-spacing: 0.02em; }
.ring-time { font-size: 13px; opacity: 0.9; font-variant-numeric: tabular-nums; margin-top: 2px; }

/* 呼吸波纹 */
.ring-btn::before,
.ring-btn::after {
  content: ""; position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid var(--seed-primary);
  opacity: 0; pointer-events: none;
  animation: breathe calc(2.6s / var(--seed-motion, 1)) ease-out infinite;
}
.ring-btn::after { animation-delay: calc(1.3s / var(--seed-motion, 1)); }
@keyframes breathe {
  0% { transform: scale(1); opacity: calc(0.42 * var(--seed-motion, 1)); }
  70% { transform: scale(calc(1 + 0.14 * var(--seed-motion, 1))); opacity: 0; }
  100% { transform: scale(calc(1 + 0.14 * var(--seed-motion, 1))); opacity: 0; }
}
/* 状态变体 */
.ring-btn.disabled { background: var(--ring-disabled); box-shadow: 0 8px 20px rgba(23, 32, 64, 0.10); }
.ring-btn.disabled::before, .ring-btn.disabled::after { animation: none; opacity: 0; }
.ring-btn.success { background: linear-gradient(165deg, var(--seed-accent), color-mix(in srgb, var(--seed-accent) 72%, var(--accent-shadow))); }
@supports not (color: color-mix(in srgb, red 50%, blue)) {
  .ring-btn.success { background: linear-gradient(165deg, var(--accent-fallback), var(--accent-deep)); }
}
.ring-btn.success::before, .ring-btn.success::after { animation: none; opacity: 0; }
.ring-spinner {
  width: 26px; height: 26px; border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.3); border-top-color: var(--on-primary);
  animation: spin calc(0.8s / var(--seed-motion, 1)) linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
/* 成功对勾 */
.check-svg { width: 54px; height: 54px; }
.check-svg circle { stroke: rgba(255, 255, 255, 0.4); }
.check-svg path { stroke: var(--on-primary); }
.check-svg path {
  stroke-dasharray: 60; stroke-dashoffset: 60;
  animation: draw calc(0.5s * var(--seed-motion, 1)) 0.1s ease-out forwards;
}
@keyframes draw { to { stroke-dashoffset: 0; } }

/* 范围判定提示 */
.fence-tip {
  margin-top: 18px; width: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; border-radius: 12px; padding: 10px 12px;
  background: var(--accent-weak); color: var(--seed-accent);
  letter-spacing: 0.01em;
}
.fence-tip.out { background: var(--warn-weak); color: var(--warn-text); }
.fence-tip.err { background: var(--danger-weak); color: var(--danger); }
.fence-ico { margin-right: 8px; display: flex; }

/* 网络状态卡 */
.loc-row { display: flex; align-items: flex-start; }
.loc-pin { color: var(--seed-primary); margin-right: 10px; margin-top: 2px; display: flex; }
.loc-main { flex: 1; min-width: 0; }
.loc-address { font-size: 14px; line-height: 1.5; display: block; }
.loc-meta { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.meta-chip {
  font-size: 11px; padding: 3px 9px; border-radius: 999px;
  background: var(--primary-weak); color: var(--primary-text); letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.meta-chip.warn { background: var(--warn-weak); color: var(--warn-text); }
.loc-actions { margin-top: 12px; display: flex; }
.ghost-btn {
  flex: 1; min-height: 40px; border-radius: 12px;
  border: 1px solid var(--border); color: var(--seed-fg);
  font-size: 13px; display: flex; align-items: center; justify-content: center;
  background: var(--seed-surface);
  transition: background 0.15s ease; padding: 0;
}
.ghost-btn::after { border: none; }
.ghost-btn:active { background: var(--seed-bg); }
.ghost-btn:focus-visible { outline: 2px dashed var(--seed-primary); outline-offset: 2px; }

/* 今日打卡时间线 */
.tl-item { display: flex; gap: 14px; position: relative; padding-bottom: 18px; }
.tl-item:last-child { padding-bottom: 4px; }
.tl-rail { display: flex; flex-direction: column; align-items: center; flex: none; }
.tl-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border); margin-top: 6px; flex: none; }
.tl-dot.done { background: var(--seed-accent); }
.tl-dot.late { background: var(--warn); }
.tl-item:not(:last-child) .tl-rail::after {
  content: ""; width: 1.5px; flex: 1; background: var(--border); margin-top: 4px;
}
.tl-body { flex: 1; min-width: 0; }
.tl-head { display: flex; align-items: baseline; }
.tl-label { font-size: 14px; font-weight: 500; margin-right: 8px; }
.tl-time { font-size: 14px; font-variant-numeric: tabular-nums; font-weight: 500; }
.tl-badge {
  margin-left: auto; font-size: 11px; padding: 1px 8px; border-radius: 999px; letter-spacing: 0.02em;
}
.tl-badge.normal { background: var(--accent-weak); color: var(--seed-accent); }
.tl-badge.late { background: var(--warn-weak); color: var(--warn-text); }
.tl-badge.early { background: var(--warn-weak); color: var(--warn-text); }
.tl-sub {
  font-size: 12px; color: var(--muted); margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block;
}

/* 调试手机号面板（仅浏览器模式） */
.debug-mask {
  position: fixed; inset: 0; z-index: 99;
  background: rgba(12, 20, 40, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 0 28px;
}
.debug-panel {
  width: 100%; max-width: 360px;
  background: var(--seed-surface); border-radius: var(--seed-radius);
  box-shadow: var(--shadow-card); padding: 22px 20px;
}
.debug-panel-head { display: flex; flex-direction: column; gap: 4px; }
.debug-panel-title { font-size: 16px; font-weight: 600; }
.debug-panel-sub { font-size: 12px; color: var(--muted); line-height: 1.5; }
.debug-cur { display: block; margin-top: 14px; font-size: 12px; color: var(--seed-accent); }
.debug-input {
  margin-top: 10px; width: 100%; height: 44px; border-radius: 12px;
  border: 1px solid var(--border); background: var(--seed-bg);
  padding: 0 14px; font-size: 16px; letter-spacing: 0.05em;
}
.debug-actions { margin-top: 18px; display: flex; gap: 10px; }
.debug-btn {
  flex: 1; height: 42px; border-radius: 12px; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
}
.debug-btn::after { border: none; }
.debug-btn.cancel { background: var(--seed-bg); color: var(--muted); border: 1px solid var(--border); }
.debug-btn.save { background: var(--seed-primary); color: var(--on-primary); font-weight: 600; }
.debug-btn.save:active { filter: brightness(0.94); }

/* App 未登录阻断遮罩（对齐食堂阻断页） */
.auth-block {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999;
  background: linear-gradient(158deg, var(--seed-primary) 0%, var(--primary-deep) 100%);
  display: flex; align-items: center; justify-content: center;
}
.auth-block-content { text-align: center; color: var(--on-primary); padding: 0 40px; }
.auth-block-icon { font-size: 56px; margin-bottom: 20px; display: flex; justify-content: center; }
.auth-block-title { font-size: 24px; font-weight: 600; margin-bottom: 12px; letter-spacing: 0.02em; }
.auth-block-desc { font-size: 14px; opacity: 0.8; padding: 0 20px; line-height: 1.6; }
.auth-block-btn-wrap { margin-top: 28px; }
.auth-block-btn {
  display: inline-block; padding: 10px 40px; background: #ffffff; color: var(--seed-primary);
  font-size: 15px; font-weight: 600; border-radius: 40px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.auth-block-btn:active { transform: scale(0.97); }
.auth-block-hint { margin-top: 16px; font-size: 12px; opacity: 0.7; }

/* 调试日志面板 */
.log-panel { display: flex; flex-direction: column; max-height: 76vh; }
.log-panel-head { flex: none; }
.log-status {
  margin-top: 12px; padding: 8px 12px; border-radius: 10px;
  background: var(--seed-bg); font-size: 12px; color: var(--muted);
  display: flex; flex-direction: column; gap: 4px; flex: none;
}
.log-api { color: var(--seed-accent); font-variant-numeric: tabular-nums; }
.log-list {
  margin-top: 12px; overflow-y: auto; flex: 1; min-height: 0;
  display: flex; flex-direction: column; gap: 8px; padding-right: 2px;
}
.log-item {
  display: flex; align-items: flex-start; gap: 8px;
  border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px;
  background: var(--seed-surface);
}
.log-time { font-size: 11px; color: var(--faint); font-variant-numeric: tabular-nums; margin-top: 1px; flex: none; }
.log-tag {
  flex: none; font-size: 10px; padding: 1px 6px; border-radius: 999px; margin-top: 1px;
}
.log-tag.ok { background: var(--accent-weak); color: var(--seed-accent); }
.log-tag.fail { background: var(--danger-weak); color: var(--danger); }
.log-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.log-line {
  font-size: 12px; line-height: 1.5; word-break: break-all;
  font-variant-numeric: tabular-nums;
}
.log-line.dim { color: var(--faint); font-size: 11px; }
.log-ms { color: var(--faint); }
.log-empty { margin-top: 16px; text-align: center; font-size: 12px; color: var(--faint); }
</style>

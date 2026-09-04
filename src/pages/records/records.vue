<template>
  <view class="page">
    <!-- 顶部统计 -->
    <view class="rec-hero">
      <text class="rec-title">打卡记录</text>
      <text class="rec-sub">{{ rangeText }}</text>
      <view class="stats-row">
        <view class="stat">
          <text class="stat-num num">{{ stats.days }}</text>
          <text class="stat-label">出勤(天)</text>
        </view>
        <view class="stat">
          <text class="stat-num num">{{ stats.normal }}</text>
          <text class="stat-label">正常(次)</text>
        </view>
        <view class="stat">
          <text class="stat-num num" :class="{ 'num-warn': stats.late > 0 }">{{ stats.late }}</text>
          <text class="stat-label">迟到</text>
        </view>
        <view class="stat">
          <text class="stat-num num" :class="{ 'num-warn': stats.early > 0 }">{{ stats.early }}</text>
          <text class="stat-label">早退</text>
        </view>
      </view>
    </view>

    <!-- 演示模式提示 -->
    <view class="mode-banner" v-if="CONFIG.USE_MOCK">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
      </svg>
      <text>演示模式：带「演示」标记的历史记录为模拟数据，今日打卡为真实本地数据。接入后台 kaoqin-backend 后由服务端下发今日打卡记录。</text>
    </view>

    <!-- 按日分组的记录列表 -->
    <view class="card day-card" v-for="g in groups" :key="g.date">
      <view class="day-head">
        <text class="day-date num">{{ g.dateLabel }}</text>
        <text class="day-week">{{ g.week }}</text>
        <text class="day-today-tag" v-if="g.isToday">今天</text>
      </view>
      <view class="day-row" v-for="(r, i) in g.rows" :key="i">
        <view class="day-rail">
          <view class="day-dot" :class="r.status === 'normal' ? 'ok' : 'warn'"></view>
          <view class="day-line" v-if="i === 0 && g.rows.length > 1"></view>
        </view>
        <view class="day-body">
          <view class="day-line-head">
            <text class="day-label">{{ rowLabel(r) }}</text>
            <text class="day-time num">{{ r.time }}</text>
            <text class="tl-badge" :class="r.status">{{ statusText[r.status] || r.status }}</text>
            <text class="mock-tag" v-if="r.mock">演示</text>
          </view>
          <text class="day-sub">{{ r.address }}{{ r.distance != null ? ' · 距考勤点' + r.distance + 'm' : '' }}</text>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view class="empty" v-if="!groups.length">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
      </svg>
      <text class="empty-title">暂无打卡记录</text>
      <text class="empty-sub">{{ CONFIG.USE_MOCK ? '演示数据加载失败，请下拉刷新' : '暂无打卡记录，去打卡页打卡后此处展示' }}</text>
    </view>

    <view class="footer-note">桂平市融媒体中心 · 考勤系统</view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import { CONFIG } from '@/config.js'
import { state, logBridge } from '@/utils/store.js'
import { refreshTodaySchedule } from '@/utils/attendance.js'
import { pad2 } from '@/utils/bridge.js'

const statusText = { normal: '正常', late: '迟到', early: '早退' }

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function srvTime(pt) {
  if (!pt) return ''
  const s = String(pt).replace('T', ' ')
  const t = s.split(' ')[1]
  return t ? t.slice(0, 8) : ''
}

/* ---------------- 演示历史数据（仅 USE_MOCK，标注 mock:true，不入库） ----------------
 * 双班次：每个工作日4条（上午上班/上午下班/下午上班/下午下班） */
function seedMockHistory() {
  const out = []
  const now = new Date()
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now.getTime() - i * 86400000)
    const wd = d.getDay()
    if (wd === 0 || wd === 6) continue // 周末不上班
    const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    const push = (type, shift, time, status) => out.push({ type, shift, status, date, time, address: '桂平市融媒体中心', mock: true })
    // 第5天上午迟到、第9天下午早退，其余正常
    push('clockIn', 'am', i === 5 ? '08:23' : `07:${pad2(38 + ((i * 7) % 18))}`, i === 5 ? 'late' : 'normal')
    push('clockOut', 'am', `12:${pad2(1 + ((i * 3) % 20))}`, 'normal')
    push('clockIn', 'pm', i === 5 ? '15:26' : `15:0${(i % 5)}`, 'normal')
    push('clockOut', 'pm', i === 9 ? '17:31' : `18:${pad2(2 + ((i * 5) % 26))}`, i === 9 ? 'early' : 'normal')
  }
  return out
}
const mockRecords = CONFIG.USE_MOCK ? seedMockHistory() : []

/* ---------------- 数据合并：本地记录（含状态）为主 + 服务端今日记录（仅时间）兜底 ---------------- */
const merged = computed(() => {
  if (CONFIG.USE_MOCK) {
    /* Mock 模式：真实记录优先，演示数据补充没有真实记录的日期（不含今天） */
    const real = state.records.slice()
    const realDates = new Set(real.map((r) => r.date))
    const fill = mockRecords.filter((m) => !realDates.has(m.date) && m.date !== todayStr())
    return real.concat(fill)
  }
  /* 真实模式：本地记录为准；本地今日记录少于服务端时用服务端补齐（换机/清缓存场景） */
  const real = state.records.slice()
  const srvToday = (state.punch.todayRecords || []).slice()
  const localTodayCount = real.filter((r) => r.date === todayStr()).length
  if (srvToday.length > localTodayCount) {
    for (let i = localTodayCount; i < srvToday.length; i++) {
      real.push({
        recordId: srvToday[i].recordId,
        seq: i + 1,
        timeRemark: '',
        expectTime: '',
        status: 'normal',
        date: todayStr(),
        time: srvTime(srvToday[i].punchTime),
        source: 'server'
      })
    }
  }
  return real
})

/* ---------------- 按日分组（倒序） ---------------- */
const groups = computed(() => {
  const byDate = {}
  for (const r of merged.value) {
    if (!byDate[r.date]) byDate[r.date] = []
    byDate[r.date].push(r)
  }
  const today = `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}-${pad2(new Date().getDate())}`
  const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  /* 班次内排序：按 seq（后端第几次打卡），兼容旧版双班次 type/shift */
  const rowOrder = (r) => {
    if (r.seq != null) return r.seq
    return ((r.shift === 'pm' ? 1 : 0) * 2) + (r.type === 'clockOut' ? 1 : 0)
  }
  return Object.keys(byDate).sort().reverse().map((date) => {
    const rows = byDate[date].slice().sort((a, b) => rowOrder(a) - rowOrder(b))
    const d = new Date(date.replace(/-/g, '/'))
    const [y, m, day] = date.split('-')
    return {
      date,
      dateLabel: `${+m}月${+day}日${d.getFullYear() !== new Date().getFullYear() ? ' · ' + d.getFullYear() + '年' : ''}`,
      week: weeks[d.getDay()],
      isToday: date === today,
      rows
    }
  })
})

/* ---------------- 统计 ---------------- */
const stats = computed(() => {
  const days = new Set()
  let normal = 0, late = 0, early = 0
  for (const r of merged.value) {
    if (r.time) days.add(r.date)
    if (r.status === 'normal') normal++
    else if (r.status === 'late') late++
    else if (r.status === 'early') early++
  }
  return { days: days.size, normal, late, early }
})

const rangeText = computed(() => (CONFIG.USE_MOCK ? '近14天 · 本机记录 + 演示数据' : '本机记录 + 服务端今日打卡'))

/* 行标签：优先后端 timeRemark（如「早上班卡」），兼容旧版双班次 */
function rowLabel(r) {
  if (r.timeRemark) return r.timeRemark
  const shiftName = r.shift === 'am' ? '上午' : r.shift === 'pm' ? '下午' : ''
  return `${shiftName}${r.type === 'clockIn' ? '上班' : '下班'}`
}

/* ---------------- 拉取今日打卡（USE_MOCK=false 时），供服务端补齐本地缺失的今日记录 ---------------- */
async function loadRemote() {
  if (CONFIG.USE_MOCK) return
  try {
    await refreshTodaySchedule()
    logBridge('loadHistory', `今日服务端 ${(state.punch.todayRecords || []).length} 条记录`)
  } catch (e) {
    logBridge('loadHistory', '接口不可达: ' + (e && e.message), true)
  }
}

onShow(() => {
  if (typeof document !== 'undefined') document.title = '打卡记录'
  loadRemote()
})

onPullDownRefresh(() => {
  loadRemote().finally(() => setTimeout(() => uni.stopPullDownRefresh(), 300))
})
</script>

<style scoped>
.page {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  padding-bottom: 80px; /* 让出底部 tabBar */
}

/* 顶部统计 */
.rec-hero {
  background: linear-gradient(158deg, var(--seed-primary) 0%, var(--primary-deep) 100%);
  color: var(--on-primary);
  padding: 26px 20px 30px;
}
.rec-title { font-size: 20px; font-weight: 600; letter-spacing: 0.02em; display: block; }
.rec-sub { font-size: 12px; opacity: 0.82; margin-top: 4px; display: block; letter-spacing: 0.02em; }
.stats-row {
  display: flex; margin-top: 18px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 14px; padding: 14px 0;
}
.stat { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat + .stat { border-left: 1px solid rgba(255, 255, 255, 0.16); }
.stat-num { font-size: 22px; font-weight: 600; line-height: 1.1; }
.stat-num.num-warn { color: #ffd591; }
.stat-label { font-size: 11px; opacity: 0.82; margin-top: 4px; letter-spacing: 0.02em; }

/* 按日分组卡片 */
.day-card { padding: 14px 16px 12px; }
.day-head {
  display: flex; align-items: center; gap: 8px;
  padding-bottom: 10px; border-bottom: 1px solid var(--border); margin-bottom: 12px;
}
.day-date { font-size: 15px; font-weight: 600; }
.day-week { font-size: 12px; color: var(--muted); }
.day-today-tag {
  margin-left: auto; font-size: 10px; padding: 1px 8px; border-radius: 999px;
  background: var(--primary-weak); color: var(--primary-text); letter-spacing: 0.04em;
}
.day-row { display: flex; }
.day-rail { display: flex; flex-direction: column; align-items: center; flex: none; margin-right: 12px; }
.day-dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 6px; flex: none; }
.day-dot.ok { background: var(--seed-accent); }
.day-dot.warn { background: var(--warn); }
.day-line { width: 1.5px; flex: 1; background: var(--border); margin-top: 3px; }
.day-body { flex: 1; min-width: 0; padding-bottom: 14px; }
.day-row:last-child .day-body { padding-bottom: 2px; }
.day-line-head { display: flex; align-items: baseline; }
.day-label { font-size: 13px; font-weight: 500; margin-right: 8px; }
.day-time { font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; }
.tl-badge {
  margin-left: auto; font-size: 11px; padding: 1px 8px; border-radius: 999px; letter-spacing: 0.02em;
}
.tl-badge.normal { background: var(--accent-weak); color: var(--seed-accent); }
.tl-badge.late { background: var(--warn-weak); color: var(--warn-text); }
.tl-badge.early { background: var(--warn-weak); color: var(--warn-text); }
.mock-tag {
  margin-left: 6px; font-size: 10px; padding: 1px 6px; border-radius: 999px;
  background: var(--seed-bg); color: var(--faint); border: 1px solid var(--border); letter-spacing: 0.04em;
}
.day-sub {
  font-size: 12px; color: var(--muted); margin-top: 3px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block;
}

/* 空状态 */
.empty {
  display: flex; flex-direction: column; align-items: center;
  padding: 60px 20px 30px; color: var(--faint);
}
.empty-title { font-size: 14px; color: var(--muted); margin-top: 12px; }
.empty-sub { font-size: 12px; margin-top: 6px; }
</style>

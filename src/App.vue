<script>
export default {
  onLaunch() {},
  onShow() {
    if (typeof document !== 'undefined') {
      document.title = '桂平融媒 · 员工考勤打卡'
    }
  },
  onHide() {}
}
</script>

<style>
/* ============================================================
   设计种子令牌（全局共享）—— 与旧版静态页保持一致
   ============================================================ */
:root {
  --seed-bg: #f4f6f9;
  --seed-fg: #17181c;
  --seed-primary: #539efa;      /* 浅一档的主蓝（原 #1677ff，用户要求调浅） */
  --seed-accent: #00b578;
  --seed-surface: #ffffff;
  --seed-radius: 16px;
  --seed-motion: 1;
  --seed-type-scale: 1;

  --muted: #7a8291;
  --faint: #a5acba;
  --border: #e6e9f0;
  --warn: #ff943e;
  --danger: #fa5151;
  --on-primary: #ffffff;
  --ring-disabled: #c3c9d6;
  --accent-fallback: #00b578;
  --accent-deep: #00945f;
  --primary-shadow: #001233;
  --accent-shadow: #00291b;
  --warn-text: #b96a14;
  --banner-text: #8a5a1f;
  --primary-text: #1f6fd8;      /* 深一档的主蓝：浅底小字专用，保证对比度 */
  --primary-deep: #1a6ae6;
  --primary-weak: rgba(64, 150, 255, 0.10);
  --accent-weak: rgba(0, 181, 120, 0.10);
  --danger-weak: rgba(250, 81, 81, 0.08);
  --warn-weak: rgba(255, 148, 62, 0.10);
  --shadow-card: 0 6px 24px rgba(23, 32, 64, 0.06);
  --shadow-ring: 0 10px 28px rgba(64, 150, 255, 0.30);
}
@supports (color: color-mix(in srgb, red 50%, rgb(49, 145, 255))) {
  :root {
    --primary-deep: color-mix(in srgb, var(--seed-primary) 78%, var(--primary-shadow));
    --primary-weak: color-mix(in srgb, var(--seed-primary) 9%, transparent);
    --accent-weak: color-mix(in srgb, var(--seed-accent) 10%, transparent);
    --danger-weak: color-mix(in srgb, var(--danger) 8%, transparent);
    --warn-weak: color-mix(in srgb, var(--warn) 10%, transparent);
    --shadow-ring: 0 10px 28px color-mix(in srgb, var(--seed-primary) 28%, transparent);
  }
}

/* 基础 */
page,
uni-page-body,
body {
  background: var(--seed-bg);
}
uni-page-body,
body {
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei", "Segoe UI", sans-serif;
  color: var(--seed-fg);
  font-size: calc(15px * var(--seed-type-scale));
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}
.num { font-variant-numeric: tabular-nums; }

/* uni-app button 默认样式重置（去掉边框和默认底色） */
button::after { border: none; }

/* ============================================================
   共享卡片 / 横幅 / 页脚
   ============================================================ */
.card {
  background: var(--seed-surface);
  margin: 14px 16px 0;
  border-radius: var(--seed-radius);
  box-shadow: var(--shadow-card);
  padding: 16px;
}
.card-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 12px;
}
.card-title .title-right {
  margin-left: auto;
  font-size: 11px;
  font-weight: 400;
  color: var(--faint);
  letter-spacing: 0.04em;
}
.mode-banner {
  margin: 14px 16px 0;
  padding: 11px 14px;
  border-radius: 12px;
  background: var(--warn-weak);
  display: flex;
  gap: 9px;
  align-items: flex-start;
  font-size: 12px;
  color: var(--banner-text);
  line-height: 1.6;
}
.footer-note {
  text-align: center;
  font-size: 11px;
  color: var(--faint);
  padding: 22px 20px calc(26px + env(safe-area-inset-bottom));
  letter-spacing: 0.03em;
}
</style>

/* ================================================================
 * 桂平融媒 · 员工考勤打卡 uni-app 版 配置区
 * ----------------------------------------------------------------
 * 【打卡方案：内网可达性打卡（组合A）】
 *   - 云端（公网）：部署 H5 页面（UI 层），HTTP 即可，只展示与发请求，不存数据
 *   - 内网（公司）：部署打卡 API 服务器（数据层），HTTP
 *   - 机制：员工只有连上公司 WiFi 才能访问内网 API——
 *           "网络可达"即视为在岗，不再依赖定位/围栏/考勤点
 *   - 无 HTTPS：云端 HTTP + 内网 HTTP 无混合内容问题，无需自签名证书；
 *               iOS 需确认融媒App ATS 是否放行明文内网请求
 * ----------------------------------------------------------------
 * 【内网接口约定】供 springboot2-dkxt 实现（SpringBoot RESTful）
 * ----------------------------------------------------------------
 * 一、网络探活（打卡前置检查）
 *   GET {INTRANET_APIS[i]}/api/attendance/ping
 *   响应: 任意 2xx 即可（如 { "code": 200 }），3 秒超时视为未连公司网络
 *
 * 二、提交打卡记录
 *   POST {INTRANET_APIS[i]}/api/attendance/clock-in
 *   Headers: Content-Type: application/json
 *   请求: {
 *     "userId": "u_10086",            // 桥接 getUserInfo 返回的 uid
 *     "sign": "加密串",                // 桥接 getUserInfo(needSign=1) 的加密串，后台验签防伪造
 *     "type": "clockIn",              // clockIn 上班 / clockOut 下班
 *     "shift": "am",                  // am 上午班 / pm 下午班（双班次）
 *     "clientTime": "2026-08-28T09:02:11+08:00",
 *     "ts": 1724806931000,            // 时间戳(毫秒)，后台校验与服务端时间差<=5秒
 *     "nonce": "m1k2x9-3f8a2b",       // 防重放随机串，后台记录一次性使用
 *     "network": "intranet"           // 标记：已通过内网可达性校验
 *   }
 *   响应: { "code": 200, "message": "ok",
 *     "data": { "recordId": "R-20260828-0001", "time": "2026-08-28 09:02:11", "status": "normal" } }
 *   status 枚举: normal 正常 / late 迟到 / early 早退
 *
 * 三、CORS（必须）：内网服务器加响应头并处理 OPTIONS 预检
 *   Access-Control-Allow-Origin: <云端H5域名>   （或 *，内网工具可放宽）
 *   Access-Control-Allow-Methods: GET, POST, OPTIONS
 *   Access-Control-Allow-Headers: Content-Type, Authorization
 *
 * 四、IP 校验（防蹭网/VPN）：内网服务器读请求来源 IP
 *   req.socket.remoteAddress，校验属于公司内网段（如 192.168.x.x / 10.x.x.x），
 *   不在段内直接拒绝。注意兼容 IPv6、多 WiFi 网段、手机代理场景。
 *
 * 本地联调（2 台服务器）：
 *   1) 前端：npm run dev:h5            → http://localhost:5173
 *   2) 内网API模拟：npm run dev:api    → http://127.0.0.1:8080（scripts/intranet-api.mjs）
 *   一键同时启动：npm run dev:all（会同时起 8080/8081 两台 API 便于验证切换）
 *   INTRANET_APIS 已指向本地 127.0.0.1:8080/8081，联调时直接可用；
 *   上线前改为实际内网服务器地址。
 *
 * 内网 API 高可用（"一台宕机请求到另一台"）：
 *   - 前端配 INTRANET_APIS 多实例列表，打卡前按顺序逐个探活，
 *     优先使用第一台可达的实例（写入 state.net.api）；提交时若当前实例
 *     网络异常（fetch 抛错），自动切换到下一台重试。
 *   - 生产更标准的做法：内网部署一台 Nginx 反代
 *     （upstream 指向多台 API + proxy_next_upstream on;，一台故障自动转发下一台），
 *     前端 INTRANET_APIS 只填 Nginx 地址即可，无需改前端代码。
 *   - 注意：多实例共享同一数据库时，nonce 防重放需共享存储或用 DB 唯一约束
 *     （如 user+date+type+shift 唯一），否则同一请求重试可能落到不同实例都被放行。
 *
 * 后台务必用「sign 加密串」+ ts 时间差 + nonce 一次性 校验后再落库。
 * ================================================================ */

export const CONFIG = {
  USE_MOCK: false,             // false = 真实请求内网 API（本地联调用 scripts/intranet-api.mjs）
  DEBUG: true,                 // 调试模式：请求带 debug=ON（后端据此开放调试接口）；上线改 false
  TEST_MOBILE: '',  // 浏览器调试用手机号（App 内强制使用桥接手机号，此配置不生效；无手机号禁止打卡）
  API_BASE: '',                // （已弃用）云端后台地址，新方案数据全走内网

  // 内网打卡 API（组合A：云端 HTTP + 内网 HTTP）
  // 多实例高可用：按顺序探活，优先使用第一台可达的实例；提交时网络异常自动切换下一台
  INTRANET_APIS: [
    'http://192.168.100.107:8888', // 本机 springboot2-dk（ruoyi-admin 端口 8888，context-path=/）
    'http://192.168.100.107:8888'        // 回退：本机回环（真机测试时改为服务器内网 IP）
    // 上线示例：'http://192.168.100.x:8888'（填服务器实际内网IP）
    // 注意：端口避开 6666/6665/6697 等浏览器 ERR_UNSAFE_PORT 黑名单
  ],
  INTRANET_PING_PATH: '/api/attendance/ping', // 轻量探活端点，返回 2xx 即可
  INTRANET_TIMEOUT: 3000,       // 内网探测/请求超时（毫秒），超时提示"请连接公司WiFi后重试"

  // 班次配置：双行政班。迟到判定=晚于班次start打上班卡；早退判定=早于班次end打下班卡
  SHIFTS: [
    { id: 'am', name: '上午班', start: '08:00', end: '12:00' },
    { id: 'pm', name: '下午班', start: '15:00', end: '18:00' }
  ]
}

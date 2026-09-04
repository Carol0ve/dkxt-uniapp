/* ================================================================
 * 桂平融媒 · 员工考勤打卡 uni-app 版 配置区
 * ----------------------------------------------------------------
 * 【打卡方案】内网可达性打卡
 *   - H5 页面（UI 层）部署在融媒 App WebView / 云端，仅展示与发请求
 *   - 打卡 API（数据层）部署在公司内网（kaoqin-backend，Spring Boot）
 *   - 员工连上公司 WiFi 才能访问内网 API，即"网络可达"视为在岗
 * ----------------------------------------------------------------
 * 【后端接口约定】kaoqin-backend（@RequestMapping 见后端 Controller）
 *   探活    GET  /api/punch/recent?limit=1        返回 2xx 即视为可达
 *   查用户  GET  /api/user/phone?phone=xxx        手机号→用户(userId/ruleId/...)
 *   打卡    POST /api/punch/clock {"phone":"xxx"} 后端判定报备/规则/窗口/迟到
 *   今日    GET  /api/punch/today?userId=xxx      今日打卡记录
 *   按日    GET  /api/punch/date?userId=&date=    指定日期记录
 *   细则    GET  /api/rule/detail/week?ruleId=&weekDay=  当日打卡要求
 *   时刻    GET  /api/rule/time/list?detailId=    当日打卡时刻表
 * 统一响应 { code: 200 成功 / 500 失败, msg, data }
 * ----------------------------------------------------------------
 * 本地联调：
 *   后端：kaoqin-backend（application.yml 端口 8081）
 *   前端：npm run dev:h5 → http://localhost:5173
 *   INTRANET_APIS 已指向本机 127.0.0.1:8081；真机联调改为电脑局域网 IP；
 *   上线改为实际内网服务器地址。
 * ================================================================ */

export const CONFIG = {
  USE_MOCK: false,   // false=真实请求后端；true=纯前端演示（后端不可用时）
  DEBUG: true,       // 调试模式：浏览器可用 mockUser 注入；上线改 false
  TEST_MOBILE: '',   // 浏览器调试默认手机号（App 内强制使用桥接手机号）

  // 打卡后端地址（多实例高可用：按序探活，提交网络异常自动切换下一台）
  INTRANET_APIS: [
    'http://127.0.0.1:8081'          // 本机 kaoqin-backend（Spring Boot 端口 8081）
    // 真机联调示例：'http://192.168.100.36:8081'（电脑局域网 IP）
    // 上线示例：'http://192.168.100.x:8081'（服务器内网 IP）
  ],
  INTRANET_PING_PATH: '/api/punch/recent?limit=1', // 轻量探活端点，返回 2xx 即可达
  INTRANET_TIMEOUT: 3000             // 内网探测/请求超时（毫秒）
}

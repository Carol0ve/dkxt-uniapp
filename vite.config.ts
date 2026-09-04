import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
  plugins: [uni()],
  server: {
    // 监听所有网卡（0.0.0.0），否则默认只绑 127.0.0.1，
    // 导致只能用 localhost 访问，手机/同网段设备用 192.168.x.x 访问不了（真机调试必需）
    host: '0.0.0.0',
    port: 5173,
    // 允许访问的域名白名单：真机用局域网 IP 访问时需要
    // （Vite 5 的 allowedHosts 未配置时，非 localhost 的 Host 头会被拒绝）
    allowedHosts: 'all'
  }
})

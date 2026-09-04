/* 生成 tabBar 图标（纯 Node 手写 PNG，无外部依赖）
 * 产出：src/static/tab-clock.png / tab-clock-active.png / tab-records.png / tab-records-active.png */
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

/* ---------- PNG 编码基础 ---------- */
let CRC_TABLE
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c
    }
  }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function makePng(w, h, pixelFn) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0 // filter: none
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixelFn(x, y)
      const o = y * (w * 4 + 1) + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // color type: RGBA
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const S = 81
const clamp01 = (v) => Math.max(0, Math.min(1, v))

/* 打卡图标：圆环（呼应打卡大按钮） */
function clockIcon(r, g, b) {
  return (x, y) => {
    const cx = 40.5, cy = 40.5
    const d = Math.hypot(x - cx, y - cy)
    const alpha = clamp01(7 - Math.abs(d - 25))
    return [r, g, b, Math.round(alpha * 255)]
  }
}

/* 记录图标：三条圆角横条（列表） */
function recordsIcon(r, g, b) {
  return (x, y) => {
    const bars = [
      { x0: 24, x1: 57, cy: 24 },
      { x0: 24, x1: 57, cy: 40.5 },
      { x0: 24, x1: 47, cy: 57 }
    ]
    let a = 0
    for (const bar of bars) {
      const px = Math.max(bar.x0, Math.min(bar.x1, x))
      const d = Math.hypot(x - px, y - bar.cy)
      a = Math.max(a, clamp01(6 - d))
    }
    return [r, g, b, Math.round(a * 255)]
  }
}

const GRAY = [122, 130, 145]   // #7a8291
const BLUE = [64, 150, 255]     // #4096ff（与 --seed-primary 保持同步）

const out = path.resolve(process.cwd(), 'src/static')
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'tab-clock.png'), makePng(S, S, clockIcon(...GRAY)))
fs.writeFileSync(path.join(out, 'tab-clock-active.png'), makePng(S, S, clockIcon(...BLUE)))
fs.writeFileSync(path.join(out, 'tab-records.png'), makePng(S, S, recordsIcon(...GRAY)))
fs.writeFileSync(path.join(out, 'tab-records-active.png'), makePng(S, S, recordsIcon(...BLUE)))
console.log('icons generated at', out)

export interface HsvValue {
  h: number
  s: number
  v: number
}

export function rgbIntToHex(n: number): string {
  return `#${Math.max(0, Math.min(0xffffff, n)).toString(16).padStart(6, "0")}`
}

export function hexToRgbInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16)
}

export function hsvToHex({ h, s, v }: HsvValue): string {
  const sN = s / 100
  const vN = v / 100
  const c = vN * sN
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = vN - c
  let [r, g, b] = [0, 0, 0]
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toByte = (n: number) =>
    Math.round(Math.max(0, Math.min(255, (n + m) * 255)))
  return `#${[toByte(r), toByte(g), toByte(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`
}

export function hexToHsv(hex: string): HsvValue {
  const n = parseInt(hex.replace("#", ""), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  return {
    h: Math.round(h),
    s: Math.round(max === 0 ? 0 : (d / max) * 100),
    v: Math.round(max * 100),
  }
}

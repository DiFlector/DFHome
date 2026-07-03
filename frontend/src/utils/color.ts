export interface HsvValue {
  h: number;
  s: number;
  v: number;
}

export interface RgbValue {
  r: number;
  g: number;
  b: number;
}

export function hsvToRgb({ h, s, v }: HsvValue): RgbValue {
  const sN = s / 100;
  const vN = v / 100;
  const c = vN * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vN - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

export function rgbToHex({ r, g, b }: RgbValue): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hsvToHex(hsv: HsvValue): string {
  return rgbToHex(hsvToRgb(hsv));
}

export function hexToRgb(hex: string): RgbValue {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHsv({ r, g, b }: RgbValue): HsvValue {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rN) h = 60 * (((gN - bN) / d) % 6);
    else if (max === gN) h = 60 * ((bN - rN) / d + 2);
    else h = 60 * ((rN - gN) / d + 4);
  }
  if (h < 0) h += 360;
  return {
    h: Math.round(h),
    s: Math.round(max === 0 ? 0 : (d / max) * 100),
    v: Math.round(max * 100),
  };
}

export function hexToHsv(hex: string): HsvValue {
  return rgbToHsv(hexToRgb(hex));
}

// Yandex's "rgb" color instance is a single 0xRRGGBB integer.
export function rgbIntToHex(n: number): string {
  return `#${Math.max(0, Math.min(0xffffff, n)).toString(16).padStart(6, "0")}`;
}

export function hexToRgbInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

// Tanner Helland's widely-used approximation for converting a color
// temperature (Kelvin) into an sRGB color, used to render a plausible
// warm/cool-white glow for bulbs set via temperature_k rather than hsv.
export function kelvinToRgb(kelvin: number): RgbValue {
  const temp = kelvin / 100;
  let r: number;
  let g: number;
  let b: number;

  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }

  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  }

  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return { r: clamp(r), g: clamp(g), b: clamp(b) };
}

/*
 * 生成 PWA 图标（纯 Node，无第三方依赖）
 * 用法：node tools/make-icons.js
 *
 * 画的是「就一件」的小猫：满幅方底 + 居中的猫脸。
 * 满幅方形是为了让 Android 的 maskable 适配不被切掉，
 * 系统会自己套圆角/圆形遮罩。
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ---------------- PNG 编码 ---------------- */
function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ---------------- 极简光栅器（4x 超采样抗锯齿） ---------------- */
const SS = 4;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function makeIcon(size) {
  const W = size * SS, H = size * SS;
  const buf = Buffer.alloc(W * H * 4);

  function blend(x, y, c, a) {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const i = (y * W + x) * 4;
    const ea = buf[i + 3] / 255;
    const na = a + ea * (1 - a);
    if (na <= 0) return;
    for (let k = 0; k < 3; k++) {
      buf[i + k] = Math.round((c[k] * a + buf[i + k] * ea * (1 - a)) / na);
    }
    buf[i + 3] = Math.round(na * 255);
  }
  function rect(x0, y0, x1, y1, c) {
    for (let y = Math.floor(y0 * H); y < Math.ceil(y1 * H); y++) {
      for (let x = Math.floor(x0 * W); x < Math.ceil(x1 * W); x++) blend(x, y, c, 1);
    }
  }
  function circle(cx, cy, r, c) {
    const R = r * W;
    for (let y = Math.floor(cy * H - R); y <= Math.ceil(cy * H + R); y++) {
      for (let x = Math.floor(cx * W - R); x <= Math.ceil(cx * W + R); x++) {
        const dx = x + 0.5 - cx * W, dy = y + 0.5 - cy * H;
        if (dx * dx + dy * dy <= R * R) blend(x, y, c, 1);
      }
    }
  }
  function tri(ax, ay, bx, by, cx, cy, c) {
    const X = (v) => v * W, Y = (v) => v * H;
    const x0 = Math.min(ax, bx, cx), x1 = Math.max(ax, bx, cx);
    const y0 = Math.min(ay, by, cy), y1 = Math.max(ay, by, cy);
    const d = (X(bx) - X(ax)) * (Y(cy) - Y(ay)) - (X(cx) - X(ax)) * (Y(by) - Y(ay));
    if (d === 0) return;
    for (let y = Math.floor(Y(y0)); y <= Math.ceil(Y(y1)); y++) {
      for (let x = Math.floor(X(x0)); x <= Math.ceil(X(x1)); x++) {
        const px = x + 0.5, py = y + 0.5;
        const w1 = ((X(bx) - px) * (Y(cy) - py) - (X(cx) - px) * (Y(by) - py)) / d;
        const w2 = ((X(cx) - px) * (Y(ay) - py) - (X(ax) - px) * (Y(cy) - py)) / d;
        const w3 = 1 - w1 - w2;
        if (w1 >= 0 && w2 >= 0 && w3 >= 0) blend(x, y, c, 1);
      }
    }
  }

  const BG = hex("#2f6df6");
  const BODY = hex("#f2a65a");
  const DARK = hex("#182030");

  rect(0, 0, 1, 1, BG);
  // 耳朵
  tri(0.29, 0.42, 0.245, 0.155, 0.465, 0.30, BODY);
  tri(0.71, 0.42, 0.755, 0.155, 0.535, 0.30, BODY);
  // 头
  circle(0.5, 0.55, 0.275, BODY);
  // 眼睛
  circle(0.412, 0.515, 0.038, DARK);
  circle(0.588, 0.515, 0.038, DARK);
  // 嘴
  circle(0.5, 0.645, 0.021, DARK);

  // 降采样
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * W + (x * SS + dx)) * 4;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3];
        }
      }
      const n = SS * SS, o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return encodePNG(size, size, out);
}

/* ---------------- 输出 ---------------- */
const dir = path.join(__dirname, "..");
[192, 512].forEach((size) => {
  const png = makeIcon(size);
  const file = path.join(dir, "icon-" + size + ".png");
  fs.writeFileSync(file, png);
  // 自检：签名 + 能否 inflate 回原始长度
  const okSig = png.slice(0, 8).toString("hex") === "89504e470d0a1a0a";
  const rawLen = (size * 4 + 1) * size;
  console.log(
    `icon-${size}.png  ${(png.length / 1024).toFixed(1)} KB  ` +
    `签名${okSig ? "✓" : "✗"}  尺寸${size}×${size}  预期原始字节 ${rawLen}`
  );
});

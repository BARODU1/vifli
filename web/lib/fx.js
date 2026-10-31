// 사이트판 편집 효과 (그림판에서 직접 그림) — 모두 '은은하게', 한 번만. 흔들기·반복해서 커졌다 작아지기는 없음.
//  컷 움직임: zoom 1.00→1.08배 한 번 / pan 좌우로 살짝 밀기 (기본 끔)
//  장면 전환: push 빠른 밀기 0.2초 / zoom 순간 확대 0.15초 / flash 흰 섬광 1프레임 (기본 없음)
//  스티커: 손그림 화살표·동그라미·불꽃 — 직접 그린 모양(외부 그림 아님), 9칸 위치
//  분할 화면·보정 전후(쓸어 넘기기) 장면 그리기
import { CANVAS, SAFE, STUDIO } from "../../config/standards.mjs";

const W = CANVAS.width, H = CANVAS.height, FPS = CANVAS.fps;
export const ease = p => p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p);

export const MOTIONS = { none: "끔", zoom: "천천히 확대 (1.00→1.08배, 한 번)", pan: "좌우로 살짝 밀기" };
export const TRANSITIONS = { none: "없음 (그냥 컷)", push: "빠른 밀기", zoom: "순간 확대 (0.15초)", flash: "흰 섬광 (1프레임)" };
export const STICKERS = { none: "없음", arrow: "손그림 화살표", circle: "손그림 동그라미", fire: "불꽃" };
// 스티커 위치 9칸: 위 15%·아래 1/5 안 들어가게 (스티커 크기 220px)
export const STICKER_SIZE = 220;
export const STICKER_POS = { tl: [0.22, 0.25], tc: [0.5, 0.25], tr: [0.78, 0.25], ml: [0.22, 0.5], mc: [0.5, 0.5], mr: [0.78, 0.5], bl: [0.22, 0.72], bc: [0.5, 0.72], br: [0.78, 0.72] };
export const STICKER_POS_NAMES = { tl: "왼쪽 위", tc: "가운데 위", tr: "오른쪽 위", ml: "왼쪽", mc: "가운데", mr: "오른쪽", bl: "왼쪽 아래", bc: "가운데 아래", br: "오른쪽 아래" };

/** 컷 움직임 변환: 진행 p(0~1), 컷 번호 si (밀기 방향을 번갈아) → [배율, 가로 이동] */
export function motionAt(kind, p, si, soft = false) {
  // soft: 사진 컷용 — 더 은은하게 (확대 1.00→1.05, 옆으로 2% 이동)
  if (kind === "zoom") return [1 + (soft ? 0.05 : 0.08) * ease(p), 0];
  if (kind === "pan") { const dir = si % 2 ? -1 : 1, a = soft ? 0.02 : 0.025; return [1 + 2 * a + 0.01, dir * W * a * (ease(p) * 2 - 1)]; } // 이동만큼 살짝 키워 가장자리가 비지 않음
  return [1, 0];
}
// [사용자 2026-11-01] 사진 컷 움직임 (영상 컷과 따로, 기본 '번갈아'): 멈춘 사진이 심심하지 않게 한 번만 은은하게
export const PHOTO_MOTIONS = { auto: "번갈아 (확대·옆으로)", zoom: "천천히 확대", pan: "옆으로 밀기", none: "끔" };
/** 사진 컷 k번째(사진 컷끼리 센 번호)에 쓸 움직임: 번갈아면 확대 → 옆으로 → 확대 … */
export const photoMotionOf = (kind, k) => kind === "auto" ? (k % 2 ? "pan" : "zoom") : kind;
export function withMotion(g, [s, dx], draw) {
  if (s === 1 && !dx) { draw(); return; }
  g.save(); g.setTransform(s, 0, 0, s, W / 2 * (1 - s) + dx, H / 2 * (1 - s)); draw(); g.restore();
}

/** 장면 전환: 새 컷의 k번째 장(그림은 main 에 이미 있음), prev = 앞 컷 마지막 장 */
export const TRANSITION_FRAMES = { push: Math.round(0.2 * FPS), zoom: Math.round(0.15 * FPS), flash: 1 };
let tmp = null;
export function applyTransition(g, main, prev, kind, k) {
  const T = TRANSITION_FRAMES[kind];
  if (!T || k >= T) return;
  if (kind === "flash") { g.save(); g.globalAlpha = 0.85; g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); g.restore(); return; }
  tmp ??= new OffscreenCanvas(W, H);
  const tg = tmp.getContext("2d"); tg.clearRect(0, 0, W, H); tg.drawImage(main, 0, 0);
  const p = ease((k + 1) / (T + 1));
  if (kind === "push" && prev) { g.drawImage(prev, -W * p, 0); g.drawImage(tmp, W * (1 - p), 0); }
  else if (kind === "zoom") { const s = 1 + 0.12 * (1 - p); g.fillStyle = "#000"; g.fillRect(0, 0, W, H); g.drawImage(tmp, W / 2 * (1 - s), H / 2 * (1 - s), W * s, H * s); }
}

/** 스티커 그리기 (손그림 느낌: 끝이 둥근 굵은 선 + 검은 테두리). a = 나타나는 정도 0~1 (처음 0.2초) */
export function drawSticker(g, type, pos, a = 1) {
  const P = STICKER_POS[pos] || STICKER_POS.mc, cx = W * P[0], cy = H * P[1], S = STICKER_SIZE;
  if (!type || type === "none" || a <= 0) return;
  g.save(); g.translate(cx, cy); const sc = 0.85 + 0.15 * ease(a); g.scale(sc, sc); g.globalAlpha = Math.min(1, a * 1.5);
  g.lineCap = "round"; g.lineJoin = "round";
  const stroke = (path, color, w) => { g.strokeStyle = "rgba(0,0,0,.85)"; g.lineWidth = w + 10; g.stroke(path); g.strokeStyle = color; g.lineWidth = w; g.stroke(path); };
  if (type === "circle") {
    // 살짝 찌그러지고 끝이 겹치는 손그림 동그라미
    const p = new Path2D();
    for (let i = 0; i <= 64; i++) { const t = (i / 64) * Math.PI * 2.15 - 0.3, r = S * 0.46 * (1 + 0.06 * Math.sin(t * 3 + 1)); const x = Math.cos(t) * r * 1.12, y = Math.sin(t) * r * 0.9; i ? p.lineTo(x, y) : p.moveTo(x, y); }
    stroke(p, "#FF3B30", 14);
  } else if (type === "arrow") {
    // 화면 가운데를 가리키는 휘어진 화살표 (가운데 칸이면 아래를 가리킴)
    let ang = Math.atan2(H / 2 - cy, W / 2 - cx); if (pos === "mc" || !isFinite(ang) || (Math.abs(W / 2 - cx) < 1 && Math.abs(H / 2 - cy) < 1)) ang = Math.PI / 2;
    g.rotate(ang);
    const p = new Path2D(); p.moveTo(-S * 0.45, S * 0.05); p.quadraticCurveTo(-S * 0.05, -S * 0.22, S * 0.4, 0);
    const h = new Path2D(); h.moveTo(S * 0.18, -S * 0.17); h.lineTo(S * 0.42, 0); h.lineTo(S * 0.2, S * 0.2);
    stroke(p, "#FFE34D", 16); stroke(h, "#FFE34D", 16);
  } else if (type === "fire") {
    // 불꽃 (바깥 빨강·주황, 안쪽 노랑) — 직접 그린 모양
    const flame = (s, c1, c2) => {
      const p = new Path2D(); p.moveTo(0, S * 0.45 * s);
      p.bezierCurveTo(-S * 0.42 * s, S * 0.4 * s, -S * 0.42 * s, -S * 0.02 * s, -S * 0.12 * s, -S * 0.2 * s);
      p.bezierCurveTo(-S * 0.14 * s, -S * 0.05 * s, -S * 0.02 * s, -S * 0.02 * s, 0, -S * 0.08 * s);
      p.bezierCurveTo(-S * 0.02 * s, -S * 0.3 * s, S * 0.1 * s, -S * 0.42 * s, S * 0.06 * s, -S * 0.5 * s);
      p.bezierCurveTo(S * 0.36 * s, -S * 0.3 * s, S * 0.44 * s, S * 0.05 * s, S * 0.3 * s, S * 0.28 * s);
      p.bezierCurveTo(S * 0.22 * s, S * 0.42 * s, S * 0.1 * s, S * 0.45 * s, 0, S * 0.45 * s); p.closePath();
      const gr = g.createLinearGradient(0, -S * 0.5 * s, 0, S * 0.45 * s); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
      return [p, gr];
    };
    const [o, og] = flame(1, "#FF8A1E", "#E8261C"), [i, ig] = flame(0.55, "#FFF2A0", "#FFB52E");
    g.strokeStyle = "rgba(0,0,0,.85)"; g.lineWidth = 10; g.stroke(o); g.fillStyle = og; g.fill(o);
    g.save(); g.translate(0, S * 0.18); g.fillStyle = ig; g.fill(i); g.restore();
  }
  g.restore();
}
/** 스티커가 차지하는 칸 (검사용) */
export function stickerBox(pos) { const P = STICKER_POS[pos] || STICKER_POS.mc, h = STICKER_SIZE / 2 + 10; return { top: Math.round(H * P[1] - h), bottom: Math.round(H * P[1] + h), left: Math.round(W * P[0] - h), right: Math.round(W * P[0] + h) }; }

/** 사진을 칸에 꽉 채워 그림 (사람 얼굴이 잘리지 않게 위쪽 30% 기준으로 자름) */
function cover(g, img, sw, sh, x, y, w, h) {
  const s = Math.max(w / sw, h / sh), cw = w / s, ch = h / s;
  g.drawImage(img, (sw - cw) / 2, (sh - ch) * 0.3, cw, ch, x, y, w, h);
}
/** 분할 화면 칸 위치: 2칸 위아래, 3칸 가로 띠 3개, 4칸 2×2 (사이 8px) */
export function splitRects(n) {
  const g = 8;
  if (n === 4) { const w = (W - g) / 2, h = (H - g) / 2; return [[0, 0, w, h], [w + g, 0, w, h], [0, h + g, w, h], [w + g, h + g, w, h]]; }
  const h = (H - g * (n - 1)) / n; return Array.from({ length: n }, (_, i) => [0, i * (h + g), W, h]);
}
/** 분할 화면 한 장: t초에 칸이 step 마다 하나씩 나타남 (0.15초 서서히) */
export function drawSplit(g, imgs, t, step) {
  g.fillStyle = STUDIO.frame.dark; g.fillRect(0, 0, W, H);
  const R = splitRects(imgs.length);
  imgs.forEach((m, j) => {
    const a = Math.min(1, Math.max(0, (t - j * step) / 0.15)); if (a <= 0) return;
    g.save(); g.globalAlpha = a; cover(g, m.img, m.width, m.height, ...R[j]); g.restore();
  });
}
/** 보정 전후: hold 동안 전, swipe 동안 왼쪽→오른쪽으로 쓸어 넘기며 후가 드러남(흰 선+손잡이), 그다음 후 */
export function drawSwipe(g, a, b, t, hold, dur, drawFit) {
  const p = ease((t - hold) / dur);
  drawFit(g, a.img, a.width, a.height, "frame");
  if (p <= 0) return;
  const x = Math.round(W * p);
  g.save(); g.beginPath(); g.rect(0, 0, x, H); g.clip(); drawFit(g, b.img, b.width, b.height, "frame"); g.restore();
  if (p < 1) {
    g.fillStyle = "rgba(255,255,255,.95)"; g.fillRect(x - 3, 0, 6, H);
    g.beginPath(); g.arc(x, H * 0.38, 34, 0, Math.PI * 2); g.fill(); g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 3; g.stroke();
  }
}
export { SAFE };

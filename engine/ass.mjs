// 글자 장면 → ASS 자막 파일. 위치는 화면 픽셀(1080x1920)로 직접 정하고,
// 아래 1/5 금지선(SAFE.textBottomMax)을 넘으면 위로 올린다. 넓으면 글자를 줄인다.
// 템플릿 look 이 글꼴·색·테두리·상자·크기·위치를 정함. 글꼴에 없는 글자만 기본 글꼴로 바꿔 그림.
import { CANVAS, SAFE, TEXT } from "../config/standards.mjs";
import { FONTS, FALLBACK, fontName, missingChars } from "./fonts.mjs";

const W = CANVAS.width, H = CANVAS.height;
const LINE = 1.22;           // 줄 간격 = 글자 크기 × 1.22
// 글꼴마다 같은 크기라도 실제 글자가 작게 보이는 정도 보정 (손글씨는 작게 나옴)
const SCALE = { hand: 1.3, kitsch: 0.95, title: 1.0, retro: 1.05, round: 1.0, serif: 1.0, gothic: 1, heavy: 1 };

/** RGB "#RRGGBB" → ASS "&HBBGGRR&" (alpha 0~255 주면 &HAABBGGRR) */
export const ass = (hex, a) => { const h = hex.replace("#", ""); const bgr = `${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase(); return a == null ? `&H${bgr}&` : `&H${a.toString(16).padStart(2, "0").toUpperCase()}${bgr}&`; };
export const ts = s => { const cs = Math.max(0, Math.round(s * 100)); const h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, sec = Math.floor(cs / 100) % 60; return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`; };

/** 글자 폭 어림 (크기 1일 때) — 한글 0.98, 영문 대문자·숫자 0.66, 소문자 0.56, 띄어쓰기 0.28, 기호 0.38 */
export function textWidth(s, size) {
  let w = 0;
  for (const ch of s.replace(/[\[\]]/g, "")) {
    if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch)) w += 0.98;
    else if (/[A-Z0-9]/.test(ch)) w += 0.66;
    else if (/[a-z]/.test(ch)) w += 0.56;
    else if (ch === " ") w += 0.28;
    else w += 0.38;
  }
  return w * size;
}

function fitSize(text, size, maxW) {
  const max = maxW ?? W - SAFE.sideMargin * 2;
  const w = textWidth(text, size);
  return w > max ? Math.floor(size * max / w) : size;
}

/**
 * 여러 줄을 가운데 y 기준으로 배치. 아랫변이 금지선을 넘으면 통째로 위로 올림.
 * @returns [{text,size,y,top,bottom}]
 */
export function layoutLines(lines, centerY, pad = 0.6) {
  const items = lines.map(l => typeof l === "string" ? { text: l, size: 60 } : { ...l });
  for (const it of items) it.size = fitSize(it.text, it.size, it.maxW);
  let y = centerY - items.reduce((a, it, i) => a + it.size * LINE + (it.gapBefore && i ? it.gapBefore : 0), 0) / 2;
  const out = items.map((it, i) => {
    if (it.gapBefore && i) y += it.gapBefore;
    const c = y + it.size * LINE / 2; y += it.size * LINE;
    const half = it.size * pad; // 글자 상자 반높이 + 테두리·상자 여유
    return { ...it, y: Math.round(c), top: Math.round(c - half), bottom: Math.round(c + half) };
  });
  const over = Math.max(...out.map(o => o.bottom)) - SAFE.textBottomMax;
  if (over > 0) for (const o of out) { o.y -= over; o.top -= over; o.bottom -= over; }
  const under = SAFE.topUiTo - Math.min(...out.map(o => o.top));
  if (under > 0) for (const o of out) { o.y += under; o.top += under; o.bottom += under; }
  return out;
}

/** 글꼴에 없는 글자는 그 글자만 기본 글꼴로 */
function withFallback(text, key, base) {
  const miss = new Set(missingChars(key, text));
  if (!miss.size) return text;
  const main = fontName(key), fb = fontName(FALLBACK);
  let out = "", inFb = false;
  for (const ch of text) {
    const m = miss.has(ch);
    if (m && !inFb) { out += `{\\fn${fb}}`; inFb = true; }
    if (!m && inFb) { out += `{\\fn${main}}`; inFb = false; }
    out += ch;
  }
  return out;
}

/** [강조] → 강조색 */
function colorize(s, base, accent) {
  return s.replace(/\[([^\]]+)\]/g, `{\\c${ass(accent)}}$1{\\c${ass(base)}}`);
}

/**
 * 한 줄 대사
 * st: { font, color, accent, stroke(비율), box(배경 상자 색|null), boxAlpha, shadow, pop }
 */
export function dialogue(start, end, o, st, layer = 1) {
  const key = FONTS[st.font] ? st.font : FALLBACK;
  const color = st.color || TEXT.color.fill, accent = st.accent || TEXT.color.accent;
  const box = !!st.box;
  const bord = box ? Math.round(o.size * 0.28) : Math.max(st.stroke === 0 ? 0 : 2, Math.round(o.size * (st.stroke ?? 0.1)));
  const shad = st.shadow ?? 0;
  const anim = st.pop === false ? "" : `\\fscx82\\fscy82\\t(0,130,\\fscx100\\fscy100)\\fad(60,0)`;
  const outline = box ? `\\3c${ass(st.box, st.boxAlpha ?? 0x50)}\\3a&H${(st.boxAlpha ?? 0x50).toString(16).padStart(2, "0")}&` : `\\3c${ass(st.strokeColor || TEXT.color.stroke)}`;
  const style = box ? "Box" : "Base";
  const body = colorize(withFallback(o.text, key), color, accent).replace(/\[/g, "").replace(/\]/g, "");
  return `Dialogue: ${layer},${ts(start)},${ts(end)},${style},,0,0,0,,{\\an5\\pos(${W / 2},${o.y})\\fn${fontName(key)}\\fs${o.size}\\bord${bord}\\shad${shad}\\4c&H000000&\\c${ass(color)}${outline}${anim}}${body}`;
}

/** 템플릿 look 에 글꼴 바꾸기(변형) 적용 */
export function styleOf(look, fontOverride) {
  if (!look) return look;
  const st = { ...look };
  if (fontOverride && fontOverride !== "template") st.font = fontOverride;
  st.size = Math.round((st.size || 60) * (SCALE[st.font] || 1));
  if (st.sub) st.sub = Math.round(st.sub * (SCALE[st.subFont || st.font] || 1));
  return st;
}

/** plan.texts + 템플릿 look → ASS 글과 글자 상자 목록(검사용) */
export function buildAss(plan, tpl, opts = {}) {
  const F = opts.font;
  const ev = [], boxes = [];
  const push = (t, o, st, layer) => { ev.push(dialogue(t.start, t.end, o, st, layer)); boxes.push({ ...o, kind: t.kind, start: t.start, end: t.end }); };
  const look = tpl.look;
  for (const t of plan.texts) {
    if (t.kind === "hook" && look.hook) {
      const st = styleOf(look.hook, F);
      const sizes = st.lineScale || [0.8, 1];
      const lines = t.lines.map((s, i) => ({ text: s, size: Math.round(st.size * (t.lines.length > 1 ? (sizes[i] ?? 1) : 1)) }));
      layoutLines(lines, H * st.y, st.box ? 0.85 : 0.6).forEach(o => push(t, o, st, 2));
    } else if (t.kind === "caption" || (t.kind === "hook" && !look.hook)) {
      const st = styleOf(look.caption, F);
      layoutLines(t.lines.map(s => ({ text: s, size: st.size })), H * st.y, st.box ? 0.85 : 0.6).forEach(o => push(t, o, st, 1));
    } else if (t.kind === "title" && look.title) {
      const st = styleOf(look.title, F);
      const subSt = { ...st, font: look.title.subFont ? (F && F !== "template" ? F : look.title.subFont) : st.font, box: look.title.subBox ?? st.box };
      const L = layoutLines([{ text: t.main, size: st.size }, { text: t.sub, size: st.sub || 40 }].filter(x => x.text), H * st.y + st.size * 0.6, st.box ? 0.85 : 0.6);
      L.forEach((o, i) => push(t, o, { ...(i ? subSt : st), pop: false }, 0));
    } else if (t.kind === "end") {
      const st = styleOf(look.end || { font: "gothic", size: 60 }, F);
      const card = t.card.map((c, i) => ({ ...c, size: Math.round(c.size * (SCALE[st.font] || 1)) }));
      const L = layoutLines(card, H * (look.end?.y ?? 0.42), 0.6);
      L.forEach((o, i) => push({ ...t, start: t.start + i * 0.12 }, o, { ...st, font: i === 0 && look.end?.firstFont ? (F && F !== "template" ? F : look.end.firstFont) : st.font }, 1));
    }
  }
  return { text: assDocument(ev), boxes };
}

/** 대사 목록 → ASS 파일 글 (맛집·사진관·말하는 영상 공통) */
export function assDocument(ev) {
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Base,${fontName(FALLBACK)},60,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,6,0,5,0,0,0,1`,
    // 상자 자막: 테두리 대신 글자 뒤 반투명 상자 (BorderStyle 3)
    `Style: Box,${fontName(FALLBACK)},60,&H00FFFFFF,&H00FFFFFF,&H50000000,&H50000000,0,0,0,0,100,100,0,0,3,14,0,5,0,0,0,1`, "",
    "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...ev, "",
  ].join("\n");
}

// 맛집·사진관 만들기에서 설치판(job.mjs)과 사이트판(web)이 함께 쓰는 순수 계산 (node 기능 없음)
import { layoutLines } from "./ass.mjs";
import { CANVAS } from "../config/standards.mjs";

/** 입력한 정보 정리: 앞뒤 빈칸 빼기, '자막 더 넣기'는 한 줄에 하나·최대 6줄 */
export function cleanInfo(raw = {}) {
  const info = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "lines").map(([k, v]) => [k, String(v || "").trim()]));
  info.lines = (Array.isArray(raw.lines) ? raw.lines : String(raw.lines || "").split(/\r?\n/)).map(x => String(x).trim()).filter(Boolean).slice(0, 6);
  return info;
}

/** 썸네일 3안 글자 (입력한 정보만) */
export function thumbAss(lines) {
  const L = layoutLines(lines, CANVAS.height * 0.46);
  const ev = L.map((o, i) => {
    const bord = Math.round(o.size * 0.12);
    const t = o.text.replace(/\[([^\]]+)\]/g, "{\\c&H4DE3FF&}$1{\\c&HFFFFFF&}");
    return `Dialogue: 0,0:00:00.00,0:00:05.00,Base,,0,0,0,,{\\an5\\pos(540,${o.y})\\fnPretendard Black\\fs${o.size}\\bord${bord}\\shad3\\4c&H000000&}${t}`;
  });
  return ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]", "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Base,Pretendard Black,100,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,8,3,5,0,0,0,1", "",
    "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text", ...ev, ""].join("\n");
}

/** 썸네일 3안: 대표 컷 + 서로 다른 재료의 컷 2개 (영상 컷 먼저, 모자라면 사진 컷) */
export function thumbPicks(plan) {
  const picks = [plan.shots[0]];
  const body = plan.shots.slice(1, -1);
  for (const ok of [s => s.kind === "video" && s.at > 4, s => s.at > 2, () => true])
    for (const s of body) { if (picks.length >= 3) break; if (ok(s) && !picks.some(p => p.clip === s.clip)) picks.push(s); }
  return picks;
}

/** 썸네일 3안의 글자 줄 */
export function thumbLines(info) {
  return [
    [`[${info.name}]`, [info.menu, info.price].filter(Boolean).join(" ")],
    [info.area, `[${info.menu || info.name}]`],
    [info.hook || info.name, `${info.name} ${info.menu}`.trim()],
  ].map(L => L.filter(Boolean).map((t, i) => ({ text: t, size: i ? 84 : 128 })));
}

/** 장면 6장 시각: 첫 장면, 큰 제목, 자막 장면들, 정보 카드 (서로 0.5초 넘게 떨어지게) */
export function captureTimes(plan) {
  const end = plan.shots[plan.shots.length - 1].at;
  const capTimes = [];
  for (const t of [0.4, 1.6, ...plan.texts.filter(x => x.kind === "caption").map(x => x.start + 0.8), end + 1.6])
    if (capTimes.length < 5 && t < end && capTimes.every(c => Math.abs(c - t) > 0.5)) capTimes.push(t);
  // 글자 장면이 적으면(사진관 원테이크 등) 고르게 채워 늘 6장
  for (const q of [0.875, 0.625, 0.375, 0.75, 0.5, 0.25]) { const t = Math.round(end * q * 10) / 10; if (capTimes.length < 5 && t < end && capTimes.every(c => Math.abs(c - t) > 0.5)) capTimes.push(t); }
  capTimes.sort((a, b) => a - b);
  capTimes.push(end + 1.6);
  return capTimes;
}

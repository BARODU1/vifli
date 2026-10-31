// 맛집 장면 엔진: 재료(분석 결과) + 가게 정보 + 템플릿 → 컷 목록·글자 장면·효과음 시간표
// 숫자는 전부 config/standards.mjs 에서 가져옴.
import { FOOD, TEXT } from "../../config/standards.mjs";
import { windowScore } from "../score.mjs";

const r2 = x => Math.round(x * 100) / 100;

/** 대표 컷(첫 장면) 고르기: 사장님이 ★ 표시한 것 → 없으면 세로 영상 중 점수 가장 높은 구간 */
export function pickHero(clips, len, only = null) {
  const starred = only ?? clips.findIndex(c => c.hero);
  const hasVideo = clips.some(c => c.kind === "video");
  const cands = [];
  clips.forEach((c, i) => {
    if (starred >= 0 && i !== starred) return;
    if (c.kind === "photo") { if (starred >= 0 || !hasVideo) cands.push({ i, t: 0, s: 0 }); return; } // 사진은 영상이 없을 때만
    for (let t = 0.3; t + len <= c.duration - 0.2; t += 0.2) cands.push({ i, t: r2(t), s: windowScore(c, t, len) + (c.landscape ? -3 : 0) }); // 가로 영상은 잘라 키우면 흐려져서 덜 고름
  });
  if (!cands.length) clips.forEach((c, i) => cands.push({ i, t: 0, s: 0 }));
  return cands.sort((a, b) => b.s - a.s)[0];
}

/** 한 재료 안에서 n개 구간 고르기: 점수 높은 순, 서로 겹치지 않게, 시간 순으로 */
export function pickWindows(c, n, len, avoid) {
  if (c.kind === "photo") return [0];
  const cands = [];
  for (let t = 0.3; t + len <= c.duration - 0.15; t += 0.1) cands.push({ t: r2(t), s: windowScore(c, t, len) });
  if (!cands.length) return [0];
  cands.sort((a, b) => b.s - a.s);
  const gap = Math.max(len + 0.1, (c.duration / n) * 0.5);
  const out = [];
  for (const x of cands) {
    if (out.length >= n) break;
    if (avoid && Math.abs(x.t - avoid) < len + 0.2) continue;
    if (out.every(t => Math.abs(t - x.t) >= gap)) out.push(x.t);
  }
  return out.sort((a, b) => a - b);
}

/**
 * @param clips  analyzeClip 결과 + { hero?:bool, fit?:'auto'|'fill'|'band' }  (사장님이 정한 순서)
 * @param info   { area, name, menu, price, loc, hook }
 * @param tpl    FOOD_TEMPLATES[x]
 */
export function planFood(clips, info, tpl, opts = {}) {
  const shotLen = opts.shot ?? tpl.shot;
  const total = opts.length ?? tpl.length;
  const body = total - FOOD.endCard;
  const fitOf = c => (c.fit && c.fit !== "auto") ? c.fit : (c.landscape ? tpl.landscape : "fill");

  // 1) 여는 장면 (템플릿이 정함): hero = 대표 컷(★ 또는 자동) / first = 첫 번째 재료(보통 간판) / none = 찍은 순서 그대로
  const opener = tpl.opener || "hero";
  const starred = clips.some(c => c.hero);
  const hero = pickHero(clips, FOOD.firstShot, opener === "first" && !starred ? 0 : null);
  const shots = opener === "none" ? [] : [{ clip: hero.i, start: hero.t, dur: FOOD.firstShot, role: "hero" }];

  // 2) 나머지 컷 수 나누기 (긴 영상이 다 먹지 않게 12초로 자름, 사진은 1컷)
  const nShots = Math.max(1, Math.round((body - (shots.length ? FOOD.firstShot : 0)) / shotLen));
  const weight = c => c.kind === "photo" ? 1.2 : Math.min(c.duration, 12);
  const cap = c => c.kind === "photo" ? 1 : Math.max(1, Math.floor((c.duration - 0.4) / (shotLen + 0.15)));
  const sum = clips.reduce((a, c) => a + weight(c), 0);
  const n = clips.map(c => Math.min(cap(c), Math.max(1, Math.round(nShots * weight(c) / sum))));
  // 합을 nShots 에 맞춤
  let diff = nShots - n.reduce((a, b) => a + b, 0);
  for (let guard = 0; diff !== 0 && guard < 200; guard++) {
    const order = clips.map((c, i) => i).sort((a, b) => diff > 0 ? (weight(clips[b]) / (n[b] + 1)) - (weight(clips[a]) / (n[a] + 1)) : n[b] - n[a]);
    const i = order.find(k => diff > 0 ? n[k] < cap(clips[k]) : n[k] > 1);
    if (i == null) break;
    n[i] += diff > 0 ? 1 : -1; diff += diff > 0 ? -1 : 1;
  }

  // 3) 재료 순서대로, 한 재료 안은 시간 순 (같은 장면을 박자마다 끊는 점프컷)
  clips.forEach((c, i) => {
    if (c.kind === "photo" && i === hero.i && shots.length) return; // 대표 컷으로 이미 쓴 사진
    const ws = pickWindows(c, n[i], shotLen, i === hero.i && shots.length ? hero.t : null);
    for (const t of ws) shots.push({ clip: i, start: t, dur: shotLen, role: "shot" });
  });
  // 4) 마지막 정보 카드: 대표 컷 장면을 어둡게
  // 정보 카드 3초가 영상 안에 들어가게 시작점을 당김 (짧은 영상이면 굽기에서 마지막 장면을 멈춰 채움)
  const hc = clips[hero.i];
  const endStart = hc.kind === "video" ? r2(Math.max(0, Math.min(hero.t, hc.duration - FOOD.endCard - 0.1))) : 0;
  shots.push({ clip: hero.i, start: endStart, dur: FOOD.endCard, role: "end" });

  let t = 0;
  for (const s of shots) {
    const c = clips[s.clip];
    if (c.kind === "video" && s.role !== "end") s.dur = Math.min(s.dur, r2(c.duration - s.start)); // 짧은 재료는 있는 만큼만
    s.at = r2(t); t += s.dur;
    s.file = c.file; s.kind = c.kind; s.fit = fitOf(c); s.hasAudio = c.hasAudio;
  }
  const duration = r2(t);
  const endAt = shots[shots.length - 1].at;

  const { texts, sfx } = placeTexts(clips, shots, info, tpl, endAt, duration);
  return { template: tpl.id, duration, shots, texts, sfx, hero: { clip: hero.i, start: hero.t } };
}

/** 글자 장면 깔기 + 효과음 시간표 (맛집·사진관 공통) */
export function placeTexts(clips, shots, info, tpl, endAt, duration) {
  // 5) 글자 장면
  //  ① 사장님이 컷에 직접 정한 글자("이 장면 글자": 메뉴·가격·위치·…)는 그 재료가 처음 나오는 때에 고정
  //  ② 나머지는 템플릿 대본(beats)을 앞에서부터 빈 시간에 깔기. 정보가 없는 칸은 건너뜀
  //  ⓪ '한마디(첫 화면)'를 적었으면 템플릿과 상관없이 0초부터 크게 (TEXT.firstTitle — 최소 1.5초).
  //     템플릿 대본에서 한마디를 쓰던 칸(큰 제목·한마디 자막)은 빼서 두 번 나오지 않게
  let beats = expandBeats(tpl.beats(info), info);
  const texts = [], fixed = [];
  let firstEnd = 0;
  if (info.hook) {
    const own = beats.find(b => b.kind === "hook" && b.lines.includes(info.hook));
    firstEnd = r2(Math.min(endAt, Math.max(TEXT.firstTitle.until, own?.dur ?? TEXT.firstTitle.dur)));
    texts.push({ kind: "hook", first: true, start: 0, end: firstEnd, lines: [info.hook] });
    beats = beats.filter(b => b !== own && !(b.kind === "caption" && (b.field === "hook" || b.text === info.hook)));
  }
  clips.forEach((c, i) => {
    if (!c.caption || c.caption === "auto") return;
    const mine = shots.filter(s => s.clip === i && s.role !== "end");
    if (!mine.length) return;
    const start = mine[0].at, span = mine.reduce((a, s) => a + s.dur, 0);
    if (c.caption === "none") { fixed.push({ start, end: start + span, none: true }); return; }
    if (c.caption === "hook" && firstEnd) return; // 한마디는 이미 첫 화면에 나옴
    const text = c.caption.startsWith("text:") ? c.caption.slice(5) : (beats.find(b => b.field === c.caption)?.text || fieldText(info, c.caption));
    if (!text) return;
    fixed.push({ start, end: Math.min(start + Math.max(tpl.minCaption ?? 1.5, Math.min(3.5, span)), endAt), text, field: c.caption });
  });
  // 첫 화면 제목 시간과 겹치는 정한 글자는 제목이 끝난 뒤로 미룸 (짧아지면 뺌)
  for (const f of fixed) if (f.start < firstEnd) f.start = firstEnd;
  for (let k = fixed.length - 1; k >= 0; k--) if (fixed[k].end - fixed[k].start < 0.8 && !fixed[k].none) fixed.splice(k, 1);
  // 정한 글자끼리 겹치면 앞 글자를 다음 글자 시작에서 끝냄 (같은 자리에 두 줄이 겹쳐 보이지 않게)
  fixed.sort((a, b) => a.start - b.start).forEach((f, k) => { const nx = fixed[k + 1]; if (nx && f.end > nx.start) f.end = nx.start; });
  const used = new Set(fixed.map(f => f.field));
  for (const f of fixed) if (!f.none) texts.push({ kind: "caption", start: r2(f.start), end: r2(f.end), lines: [f.text], fixed: true });
  const busy = (a, b) => fixed.find(f => a < f.end && b > f.start);
  let cur = firstEnd;
  for (const b of beats) {
    if (cur >= endAt - 0.3) break;
    if (b.kind === "gap") { cur += b.dur; continue; }
    if (b.field && used.has(b.field)) continue;
    let f; while ((f = busy(cur, cur + Math.min(b.dur, 1.2)))) cur = f.end;
    if (cur >= endAt - 0.3) break;
    let end = Math.min(cur + b.dur, endAt);
    const next = fixed.filter(x => x.start > cur).sort((a, z) => a.start - z.start)[0];
    if (next && end > next.start) end = next.start;
    if (end - cur < 0.8) { cur = end; continue; }
    texts.push({ kind: b.kind, start: r2(cur), end: r2(end), lines: b.lines || [b.text] });
    cur = end;
  }
  texts.sort((a, b) => a.start - b.start);
  if (tpl.title) texts.push({ kind: "title", start: 0, end: tpl.titleUntil ? Math.min(tpl.titleUntil, endAt) : endAt, ...tpl.title(info) });
  texts.push({ kind: "end", start: endAt, end: duration, card: tpl.endCard(info) });

  // 6) 효과음: 큰 제목 '슉', 자막 '톡', 정보 카드 '띵' (템플릿이 끌 수 있음)
  const sfxOn = tpl.sfx || { hook: "whoosh", caption: "pop", end: "ding" };
  const sfx = texts.filter(x => sfxOn[x.kind]).map(x => ({ t: x.start, type: sfxOn[x.kind] }));

  return { texts, sfx };
}

/** 정보 칸 → 기본 자막 글 */
function fieldText(info, field) {
  if (field === "menu") return info.menu && `[${info.menu}]`;
  if (field === "price") return info.price && [info.menu, `[${info.price}]`].filter(Boolean).join(" ");
  if (field === "loc") return info.loc;
  if (field === "name") return info.name && [info.area, `[${info.name}]`].filter(Boolean).join(" ");
  if (field === "hook") return info.hook;
  return "";
}

/** 대본 정리: 빈 칸 빼기, {kind:"extra"} 자리에 사장님이 더 적은 자막 줄들을 끼움 */
function expandBeats(list, info) {
  const out = [];
  for (const b of list) {
    if (b.kind === "extra") { for (const line of info.lines || []) out.push({ kind: "caption", text: line, dur: b.dur || 2.5, field: null }); continue; }
    if (b.kind === "hook" && !(b.lines || []).filter(Boolean).length) continue;
    if (b.kind === "hook") { out.push({ ...b, lines: b.lines.filter(Boolean) }); continue; }
    if (b.kind === "caption" && !b.text) continue;
    out.push(b);
  }
  return out;
}

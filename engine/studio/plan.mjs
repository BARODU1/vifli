// 사진관 장면 엔진: 재료 + 사진관 정보 + 템플릿 → 컷 목록·글자 장면·효과음 시간표
// 맛집과 다른 점 [사진관19]: ① 많이 본 릴스는 원테이크(끊지 않음) + 결과 사진으로 끝 ② 결과 사진은 얼굴이 잘리지 않게 '액자'
// ③ 글자는 아래쪽(0.70)에 짧게, 적게. 자막 배치는 맛집과 같은 placeTexts 를 씀(컷별 글자 지정 유지).
// 재료 종류(role)는 사장님이 정함: space(공간·촬영 현장, 기본) / result(결과 사진) / before(보정 전) / after(보정 후)
import { STUDIO } from "../../config/standards.mjs";
import { windowScore } from "../score.mjs";
import { pickWindows, placeTexts } from "../food/plan.mjs";

const r2 = x => Math.round(x * 100) / 100;

/** 파일 이름 → 공간 이름표 (사장님이 붙인 이름만 씀. 날짜·번호뿐인 이름은 안 씀) 예) '대기실2.jpg' → '대기실' */
export function roomLabel(file) {
  const n = String(file).split(/[\\/]/).pop().replace(/\.\w+$/, "").replace(/[_\-\s]*\d+(-\d+)?$/, "").replace(/_/g, " ").trim();
  return /[가-힣]/.test(n) && n.length <= 10 && !/^(IMG|DSC|KakaoTalk|사진|영상)/i.test(n) ? n : "";
}

/** 원테이크로 쓸 영상 구간: ★ 영상 → 가장 긴 영상. 길이 maxTake, 점수가 가장 좋은 시작점 */
function pickTake(clips, len) {
  const vids = clips.map((c, i) => ({ c, i })).filter(x => x.c.kind === "video");
  if (!vids.length) return null;
  const v = vids.find(x => x.c.hero) || vids.sort((a, b) => b.c.duration - a.c.duration)[0];
  const d = Math.min(len, v.c.duration - 0.2);
  let best = { t: 0, s: -1e9 };
  for (let t = 0; t + d <= v.c.duration - 0.1; t += 0.5) { const s = windowScore(v.c, t, d); if (s > best.s) best = { t: r2(t), s }; }
  return { i: v.i, t: best.t, dur: r2(d) };
}

/** 여러 개 중 n개를 고르게 (순서 유지) */
const spread = (arr, n) => arr.length <= n ? arr : Array.from({ length: n }, (_, k) => arr[Math.round(k * (arr.length - 1) / Math.max(1, n - 1))]);

/**
 * @param clips analyzeClip 결과 + { hero, fit, caption, role }
 * @param info  { area, name, menu(=촬영 종류), price, loc, hook, lines }
 * @param tpl   STUDIO_TEMPLATES[x]
 */
export function planStudio(clips, info, tpl) {
  const total = tpl.length ?? STUDIO.length.target;
  const shotLen = tpl.shot ?? STUDIO.shot.default;
  const resLen = tpl.resultShot ?? STUDIO.resultShot;
  const role = c => c.role || "space";
  const idx = clips.map((c, i) => i);
  const results = idx.filter(i => role(clips[i]) === "result" || role(clips[i]) === "after");
  const befores = idx.filter(i => role(clips[i]) === "before");
  const spaces = idx.filter(i => role(clips[i]) === "space");
  const resFit = tpl.resultFit || "frame";
  const fitOf = (c, r) => (c.fit && c.fit !== "auto") ? c.fit
    : (role(c) !== "space" ? resFit : c.landscape ? (c.kind === "video" ? (tpl.videoFit || "wide") : (tpl.landscape || "fill")) : "fill"); // 가로 영상은 잘라 키우면 흐리고 영상 속 제목이 잘림 → 그대로
  const shots = [];
  const add = (i, start, dur, r = "shot", extra = {}) => shots.push({ clip: i, start, dur, role: r, ...extra });
  const addSpaces = (list, n, len) => { // 공간 사진·영상을 n컷에 나눠 넣기 (영상은 여러 구간)
    if (n <= 0 || !list.length) return;
    const pick = list.length >= n ? spread(list, n) : list;
    const per = pick.map(() => 1); let left = n - pick.length;
    for (let k = 0; left > 0 && k < 200; k++) { const j = k % pick.length; if (clips[pick[j]].kind === "video") { per[j]++; left--; } if (!pick.some(p => clips[p].kind === "video")) break; }
    pick.forEach((i, j) => { for (const t of pickWindows(clips[i], per[j], len)) add(i, t, len); });
  };
  let mode = tpl.mode || "cuts";
  const take = mode === "oneTake" ? pickTake(clips, STUDIO.oneTake.maxTake) : null;
  if (mode === "oneTake" && !take) mode = "cuts"; // 영상이 없으면 컷 방식으로
  if (mode === "album" && !results.length) mode = "cuts";
  const nRes = Math.min(results.length, tpl.maxResults ?? STUDIO.maxResults);
  const resPick = spread(results, nRes);

  if (mode === "oneTake") {
    // 원테이크: 영상 한 구간을 끊지 않고 → 결과 사진 공개
    add(take.i, take.t, take.dur, "take");
    for (const i of resPick) add(i, 0, STUDIO.oneTake.resultHold, "result");
  } else if (mode === "album") {
    // 앨범: 결과 사진만, 한 장씩
    for (const i of spread(results, Math.max(1, Math.round((total - STUDIO.endCard) / resLen)))) add(i, 0, resLen, "result");
  } else if (mode === "pairs") {
    // 짝 보여 주기: 보정 전→후 (사장님이 표시했을 때) / 없으면 공간 → 결과 사진 번갈아
    const pairs = befores.length && results.length
      ? befores.map((b, k) => [b, results[k % results.length]])
      : resPick.map((r, k) => [spaces.length ? spaces[Math.round(k * (spaces.length - 1) / Math.max(1, resPick.length - 1))] : null, r]);
    for (const [a, b] of pairs.slice(0, 4)) {
      if (a != null) add(a, pickWindows(clips[a], 1, shotLen)[0], shotLen, "shot", befores.includes(a) ? { tag: "before" } : {});
      add(b, 0, resLen, "result", befores.length ? { tag: "after" } : {});
    }
  } else {
    // 컷: (결과 먼저면 결과 한 장) → 공간 컷 → 결과 사진들
    if (tpl.opener === "result" && resPick.length) add(resPick[0], 0, STUDIO.shot.max, "hero");
    const restRes = tpl.opener === "result" ? resPick.slice(1) : resPick;
    const used = shots.reduce((a, s) => a + s.dur, 0) + restRes.length * resLen;
    const n = Math.max(spaces.length ? 1 : 0, Math.round((total - STUDIO.endCard - used) / shotLen));
    addSpaces(spaces, n, shotLen);
    for (const i of restRes) add(i, 0, resLen, "result");
  }
  if (!shots.length) idx.forEach(i => add(i, 0, shotLen));

  // 마지막 정보 카드: 결과 사진(작은 액자) 또는 첫 공간 장면을 어둡게
  const endClip = resPick.length ? resPick[resPick.length - 1] : (shots[0]?.clip ?? 0);
  const ec = clips[endClip];
  const endFit = role(ec) !== "space" ? `${resFit}-end` : fitOf(ec);
  add(endClip, ec.kind === "video" ? r2(Math.max(0, ec.duration - STUDIO.endCard - 0.1)) : 0, STUDIO.endCard, "end", { fitOverride: endFit });

  let t = 0;
  for (const s of shots) {
    const c = clips[s.clip];
    if (c.kind === "video" && s.role !== "end") s.dur = Math.min(s.dur, r2(c.duration - s.start));
    s.at = r2(t); t += s.dur;
    s.file = c.file; s.kind = c.kind; s.fit = s.fitOverride || fitOf(c); s.hasAudio = c.hasAudio;
    delete s.fitOverride;
  }
  const duration = r2(t);
  const endAt = shots[shots.length - 1].at;

  // 공간 이름표: 템플릿이 켜면, '이 장면 글자'가 자동인 공간 재료에 파일 이름(사장님이 붙인 이름)을 씀
  const capClips = clips.map(c => ({ ...c }));
  // (labelsFrom 초 전에는 이름표를 안 붙여 첫 화면 큰 제목 자리를 비움)
  if (tpl.roomLabels) capClips.forEach((c, i) => {
    const first = shots.find(s => s.clip === i && s.role !== "end");
    if (first && first.at >= (tpl.labelsFrom || 0) && (!c.caption || c.caption === "auto") && role(c) === "space" && roomLabel(c.file)) c.caption = "text:" + roomLabel(c.file);
  });
  // 보정 전·후 표시 (사장님이 정한 재료에만)
  shots.forEach(s => { if (s.tag && (!capClips[s.clip].caption || capClips[s.clip].caption === "auto")) capClips[s.clip].caption = "text:" + (s.tag === "before" ? "보정 전" : "[보정 후]"); });
  const { texts, sfx } = placeTexts(capClips, shots, info, tpl, endAt, duration);
  const first = shots[0];
  return { template: tpl.id, duration, shots, texts, sfx, hero: { clip: first.clip, start: first.start }, mode };
}

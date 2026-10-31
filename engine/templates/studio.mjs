// 사진관 템플릿 10개 = "모양". 장면 종류(원테이크·컷·짝·앨범, 결과 사진 위치)는 engine/studio/plan.mjs 가 정하고
// 템플릿은 방식·컷 길이·대본 틀·글꼴·색·크기·위치만 정한다.
// 글자는 사장님이 입력한 사진관 정보·'자막 더 넣기' 줄·사장님이 붙인 파일 이름(공간 이름표)만 씀 — 지어낸 말 금지.
// 숫자 근거: config/standards.mjs [사진관19] — 자막 아래쪽 y0.70·58px·7자, 흰 글자 위주(강조 드묾), 위쪽 문구 y0.15·56px.
// 정보 칸: area 지역 / name 사진관 이름 / menu 촬영 종류 / price 가격 / loc 위치 / hook 한마디
import { STUDIO, STUDIO_TEXT } from "../../config/standards.mjs";

const CAP = STUDIO_TEXT.caption.size, CAPY = STUDIO_TEXT.caption.y, TOP = STUDIO_TEXT.topLine;
// 첫 화면 큰 제목은 가로 영상(가운데 0.42) 아래에 — 영상 속 원래 제목 글자와 겹치지 않게 [임시]
const HOOKY = 0.62;
// 위쪽 문구는 [사진관19] 0.15 지만, 결과 사진 액자(위끝 약 0.09)와 사람 머리에 겹쳐서 화면 위 UI(0~96px) 바로 아래로 [임시]
const TOPY = 0.065;
const YELLOW = STUDIO_TEXT.color.accent, WARM = "#FFD9A8", INK = "#3A2E25";

const endCenter = I => [
  { text: `[${I.name}]`, size: 88 },
  { text: [I.area, I.menu].filter(Boolean).join(" · "), size: 56 },
  { text: I.price, size: 52 },
  { text: I.loc, size: 50 },
  { text: I.outro, size: 58, gapBefore: 30 }, // 끝 문구: 사장님이 적은 것만 (비면 안 나옴)
].filter(l => l.text && l.text !== "[]");
const endList = I => [
  { text: `[${I.name}]`, size: 86 },
  { text: I.menu && `✓ 촬영  ${I.menu}`, size: 52, gapBefore: 16 },
  { text: I.price && `✓ 가격  ${I.price}`, size: 52 },
  { text: I.loc && `✓ 위치  ${I.loc}`, size: 52 },
  { text: I.outro, size: 58, gapBefore: 30 },
].filter(l => l.text && l.text !== "[]");

const base = { kind: "studio", firstTitleY: HOOKY, mode: "cuts", landscape: "fill", resultFit: "frame", shot: STUDIO.shot.default, length: STUDIO.length.target,
  volume: 1, endCard: endCenter, minCaption: 0, maxResults: 2, /* 컷형은 결과 2장(3.6초) → 공간 컷이 7장쯤 남게 */ sfx: { hook: "whoosh", end: "ding" } }; // 사진관 릴스는 자막마다 '톡' 소리를 안 씀(글자 적게)
const lowCap = { font: "gothic", size: CAP, y: CAPY, stroke: 0.1 };
const endLook = (font, first) => ({ font, firstFont: first || font, y: 0.72 });

export const STUDIO_TEMPLATES = {
  oneTake: { ...base, id: "oneTake", name: "원테이크 공개", mode: "oneTake", landscape: "band", maxResults: 3, format: "원테이크",
    desc: "영상 한 구간을 끊지 않고(최대 12초) → 결과 사진 공개. 많이 본 사진관 릴스 방식",
    look: { caption: lowCap, end: endLook("gothic", "heavy") },
    beats: I => [
      { kind: "caption", field: "name", text: I.name && [I.area, `[${I.name}]`].filter(Boolean).join(" "), dur: 3.0 },
      { kind: "gap", dur: 3.0 },
      { kind: "caption", field: "hook", text: I.hook, dur: 3.0 },
      { kind: "extra", dur: 2.5 },
    ] },

  tour: { ...base, id: "tour", name: "공간 투어", landscape: "band", roomLabels: true, labelsFrom: 2.0, format: "공간 빠른 컷",
    desc: "공간 사진을 1.2초씩, 사장님이 붙인 파일 이름(대기실·파우더룸…)을 이름표로 → 결과 사진",
    look: { hook: { font: "heavy", size: 84, y: HOOKY }, caption: { font: "round", size: CAP + 4, y: CAPY, stroke: 0.12 }, end: endLook("round") },
    beats: I => [
      { kind: "hook", lines: [I.area, `[${I.name}]`], dur: 2.0 },
    ] },

  resultFirst: { ...base, id: "resultFirst", name: "결과 먼저", opener: "result", maxResults: 3, format: "결과 → 과정",
    desc: "0초에 결과 사진(액자) + 한마디 → 공간 컷 → 결과 사진들",
    look: { hook: { font: "heavy", size: 80, y: 0.80, lineScale: [1, 0.8] }, caption: lowCap, end: endLook("gothic", "heavy") },
    beats: I => [
      { kind: "hook", lines: [I.hook || I.name, I.hook ? `[${I.name}]` : I.menu], dur: 1.8 },
      { kind: "caption", field: "menu", text: I.menu && `[${I.menu}]`, dur: 2.5 },
      { kind: "extra", dur: 2.5 },
      { kind: "caption", field: "loc", text: I.loc, dur: 2.5 },
    ] },

  pairs: { ...base, id: "pairs", name: "공간과 결과 짝", mode: "pairs", maxResults: 4, format: "전후 비교",
    desc: "보정 전→후(표시했을 때) 또는 공간 사진 → 결과 사진을 번갈아. 짝마다 글자 없이 보여 줌",
    look: { caption: { ...lowCap, y: 0.80 }, title: { font: "heavy", size: TOP.size, y: TOPY, sub: 36, subFont: "gothic" }, end: endLook("gothic", "heavy") },
    title: I => ({ main: `[${I.name}]`, sub: I.menu || I.area }),
    beats: () => [] },

  pov: { ...base, id: "pov", name: "POV 위쪽 문구", format: "위쪽 상황 문구",
    desc: "위쪽에 'POV: ○○에서 가족사진' 한 줄 고정, 아래 자막 없음 → 결과 사진",
    look: { title: { font: "gothic", size: TOP.size, y: TOPY, sub: 0, box: "#000000", boxAlpha: 0x60 }, caption: lowCap, end: endLook("gothic", "heavy") },
    title: I => ({ main: `POV: ${I.name}에서${I.menu ? " " + I.menu : ""}` }),
    beats: () => [] },

  album: { ...base, id: "album", name: "앨범 넘기기", mode: "album", resultFit: "framelight", format: "결과 사진 모음",
    desc: "결과 사진만 밝은 바탕 액자로 1.8초씩, 명조 제목",
    look: { // 밝은 바탕이라 글자는 진한 갈색, 테두리 없음
      title: { font: "serif", size: 80, y: 0.08, sub: 40, subFont: "gothic", color: INK, accent: "#9A6B3F", stroke: 0 },
      caption: { ...lowCap, font: "serif", y: 0.86, color: INK, accent: "#9A6B3F", stroke: 0 },
      end: { ...endLook("serif"), color: INK, accent: "#9A6B3F", stroke: 0 } },
    title: I => ({ main: I.name, sub: [I.area, I.menu].filter(Boolean).join(" · ") }),
    titleUntil: 99,
    beats: I => [{ kind: "extra", dur: 2.5 }, { kind: "caption", field: "hook", text: I.hook, dur: 3.0 }] },

  fast: { ...base, id: "fast", name: "빠른 컷", shot: STUDIO.shot.min, length: 14, format: "공간·소품 빠른 컷",
    desc: "0.85초씩 빠르게, 첫 화면 큰 두 줄만, 끝에 결과 사진",
    look: { hook: { font: "title", size: 96, y: HOOKY, lineScale: [1, 0.8] }, caption: lowCap, end: endLook("gothic", "title") },
    beats: I => [{ kind: "hook", lines: [I.hook || I.area, `[${I.name}]`], dur: 2.2 }] },

  info: { ...base, id: "info", name: "정보 이름표", endCard: endList, format: "정보형",
    desc: "촬영·가격·위치 이름표 자막(레트로 글씨), 끝에 ✓ 정리 카드",
    look: { hook: { font: "retro", size: 84, y: HOOKY }, caption: { font: "retro", size: CAP + 4, y: CAPY, accent: YELLOW }, end: { ...endLook("retro"), y: 0.70 } },
    beats: I => [
      { kind: "hook", lines: [I.area, `[${I.name}]`], dur: 2.0 },
      { kind: "caption", field: "menu", text: I.menu && `촬영 [${I.menu}]`, dur: 2.5 },
      { kind: "caption", field: "price", text: I.price && `가격 [${I.price}]`, dur: 2.5 },
      { kind: "caption", field: "loc", text: I.loc && `위치 ${I.loc}`, dur: 2.5 },
      { kind: "extra", dur: 2.5 },
    ] },

  hand: { ...base, id: "hand", name: "손글씨 감성", shot: STUDIO.shot.max, length: 16, format: "감성형",
    desc: "컷 1.8초로 천천히, 손글씨 한마디·자막 더 넣기 줄, 따뜻한 색",
    look: { hook: { font: "hand", size: 92, y: 0.70, lineScale: [1, 0.85], accent: WARM }, caption: { font: "hand", size: 70, y: CAPY, accent: WARM }, end: endLook("hand") },
    beats: I => [
      { kind: "hook", field: "hook", lines: [I.hook || I.name, I.hook ? `[${I.name}]` : I.area], dur: 2.6 },
      { kind: "extra", dur: 2.8 },
      { kind: "caption", field: "menu", text: I.menu && `[${I.menu}]`, dur: 2.6 },
    ] },

  save: { ...base, id: "save", name: "저장 유도", endCard: endList, format: "저장형",
    desc: "위에 검은 띠로 사진관 이름 고정, 상자 자막, 끝에 ✓ 정리 카드",
    look: { title: { font: "heavy", size: 50, y: 0.07, sub: 0, box: "#000000", boxAlpha: 0x40 }, caption: { font: "gothic", size: CAP, y: CAPY, box: "#000000", boxAlpha: 0x50 }, end: { ...endLook("gothic", "heavy"), y: 0.70 } },
    title: I => ({ main: [I.area, I.name].filter(Boolean).join(" ") }),
    beats: I => [
      { kind: "gap", dur: 1.0 },
      { kind: "caption", field: "menu", text: I.menu && `[${I.menu}]`, dur: 2.5 },
      { kind: "caption", field: "price", text: I.price, dur: 2.5 },
      { kind: "extra", dur: 2.5 },
      { kind: "caption", field: "loc", text: I.loc, dur: 2.5 },
    ] },

  // [사용자 2026-11-01] 새 템플릿 — split·swipe 는 사이트판 굽기만 됨(siteOnly)
  split: { ...base, id: "split", name: "분할 화면", mode: "split", siteOnly: true, splitCount: 3, splitStep: 0.6, splitHold: 1.0, format: "분할",
    desc: "화면을 2·3·4칸으로 나눠 사진이 한 칸씩 차례로 → 마지막에 결과 사진 한 장 크게",
    look: { caption: lowCap, end: endLook("gothic", "heavy") },
    beats: () => [] },

  oneLine: { ...base, id: "oneLine", name: "감성 한 줄", quietHook: true, shot: STUDIO.shot.max, format: "감성 한 줄",
    desc: "글자 최소 — 한마디(없으면 사진관 이름) 한 줄만 작게, 명조. 위치(위·가운데·아래)를 고를 수 있음",
    linePosY: { top: 0.18, middle: 0.5, bottom: 0.74 },
    look: { title: { font: "serif", size: 60, y: 0.74, sub: 0 }, caption: lowCap, end: endLook("serif") },
    title: I => ({ main: I.hook || I.name }),
    titleUntil: 99,
    beats: () => [] },

  swipe: { ...base, id: "swipe", name: "보정 전후", mode: "swipe", siteOnly: true, swipeDur: 0.8, swipeHold: 0.9, format: "보정 전후 쓸어 넘기기",
    desc: "'보정 전'·'보정 후'로 표시한 사진을 손으로 쓸어 넘기듯 0.8초에 비교",
    look: { caption: { ...lowCap, y: 0.80 }, end: endLook("gothic", "heavy") },
    beats: () => [] },
};

export const DEFAULT_STUDIO_TEMPLATE = "tour";

/** '자동': 영상이 있고 결과 사진이 있으면 원테이크 공개 → 결과 사진이 많으면 결과 먼저·앨범 → … (다시 누르면 다른 것) */
export function autoStudioTemplate(clips, info, last = [], { site = false } = {}) {
  const res = clips.filter(c => c.role === "result" || c.role === "after").length;
  const vid = clips.some(c => c.kind === "video");
  const cands = [];
  // 사이트판만: 보정 전·후를 표시했으면 쓸어 넘기기, 사진이 많으면 분할 화면
  if (site && clips.some(c => c.role === "before") && clips.some(c => c.role === "after")) cands.push("swipe");
  if (vid && res) cands.push("oneTake");
  if (site && clips.filter(c => c.kind === "photo").length >= 4) cands.push("split");
  if (res >= 3) cands.push("resultFirst", "album");
  if (clips.some(c => c.role === "before")) cands.push("pairs");
  cands.push("tour", "pov");
  if (info.price || info.loc) cands.push("info", "save");
  if (info.hook || (info.lines || []).length) cands.push("hand", "oneLine");
  cands.push("fast", "pairs");
  const fresh = cands.filter(c => !last.includes(c));
  return fresh[0] || cands[0];
}

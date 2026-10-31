// 맛집 템플릿 10개 = "모양". 장면 종류(어디서 컷·어떤 글자 장면·언제)는 엔진(engine/food/plan.mjs)이 정하고,
// 템플릿은 여는 방식·컷 길이·대본 틀(beats)·글꼴·색·크기·위치만 정한다 → 템플릿을 바꿔도 컷별 글자 지정은 그대로.
// 글자는 사장님이 입력한 가게 정보와 '자막 더 넣기' 줄만 씀 — 지어낸 말 금지. [대괄호] = 강조색.
// 숫자 근거: config/standards.mjs [맛집14]. 모양은 04_맛집릴스_포맷10 의 '형식'만 참고, 남의 디자인을 옮기지 않음.
import { FOOD, TEXT } from "../../config/standards.mjs";

const lastWord = s => String(s || "").trim().split(/\s+/).pop() || "";
const RED = "#FF4B3A", YELLOW = TEXT.color.accent, WHITE = "#FFFFFF";
const CAP = TEXT.caption.size, HOOK = TEXT.hook.size;

// 마지막 정보 카드 — 끝 문구(outro)는 사장님이 입력했을 때만. 고정 문구 없음
const endCenter = I => [
  { text: `[${I.name}]`, size: 96 },
  { text: [I.menu, I.price].filter(Boolean).join(" "), size: 60 },
  { text: I.loc, size: 54 },
  { text: I.outro, size: 66, gapBefore: 40 }, // 끝 문구: 사장님이 적은 것만 (비면 안 나옴)
].filter(l => l.text && l.text !== "[]");
const endList = I => [
  { text: `[${I.name}]`, size: 92 },
  { text: I.menu && `✓ 메뉴  ${I.menu}`, size: 54, gapBefore: 20 },
  { text: I.price && `✓ 가격  ${I.price}`, size: 54 },
  { text: I.loc && `✓ 위치  ${I.loc}`, size: 54 },
  { text: I.outro, size: 62, gapBefore: 40 },
].filter(l => l.text && l.text !== "[]");

const base = { landscape: "fill", shot: FOOD.shot.default, length: FOOD.length.target, opener: "hero", volume: 1, endCard: endCenter };

export const FOOD_TEMPLATES = {
  mukbang: { ...base, id: "mukbang", name: "바로먹방", format: "①",
    desc: "0초에 대표 메뉴 + 큰 두 줄, 1초 컷, 가운데 한 줄 자막",
    look: {
      hook: { font: "heavy", size: HOOK, y: 0.40 },
      caption: { font: "gothic", size: CAP, y: 0.62 },
      end: { font: "gothic", firstFont: "heavy" },
    },
    beats: I => [
      { kind: "hook", lines: [I.hook, `${I.area} [${I.name}]`], dur: 2.4 },
      { kind: "caption", field: "menu", text: I.menu && `[${I.menu}]`, dur: 3.0 },
      { kind: "caption", field: "price", text: I.price && `${I.menu} [${I.price}]`, dur: 3.0 },
      { kind: "extra", dur: 2.5 },
      { kind: "gap", dur: 0.6 },
      { kind: "caption", field: "loc", text: I.loc, dur: 3.0 },
      { kind: "caption", field: "name", text: `${I.area} [${I.name}]`, dur: 99 },
    ] },

  region: { ...base, id: "region", name: "지역명 고정", format: "②", landscape: "band",
    desc: "위에 지역 이름(명조) 고정 + 작은 한 줄, 가로 영상은 위아래 검정 바탕",
    look: {
      title: { font: "serif", size: 96, y: 0.085, sub: 40, subFont: "gothic" },
      caption: { font: "gothic", size: 56, y: 0.55 },
      end: { font: "gothic", firstFont: "serif" },
    },
    title: I => ({ main: lastWord(I.area), sub: [I.name, I.menu].filter(Boolean).join(" · ") }),
    beats: I => [
      { kind: "gap", dur: 1.0 },
      { kind: "caption", field: "menu", text: I.menu && `[${I.menu}]`, dur: 3.0 },
      { kind: "caption", field: "price", text: I.price, dur: 3.0 },
      { kind: "extra", dur: 2.5 },
      { kind: "caption", field: "loc", text: I.loc, dur: 3.0 },
      { kind: "caption", field: "hook", text: I.hook, dur: 3.0 },
    ] },

  declare: { ...base, id: "declare", name: "큰 선언", format: "③", shot: 0.9,
    desc: "첫 화면 굵은 제목체 두 줄(한마디 + 가게), 위쪽 굵은 자막",
    look: {
      hook: { font: "title", size: 104, y: 0.42, accent: RED, lineScale: [1, 0.86] },
      caption: { font: "heavy", size: 62, y: 0.17, accent: YELLOW, stroke: 0.12 },
      end: { font: "gothic", firstFont: "title" },
    },
    beats: I => [
      { kind: "hook", lines: [I.hook || I.name, I.hook ? `[${I.name}]` : I.area], dur: 2.6 },
      { kind: "caption", field: "name", text: `${I.area} [${I.name}]`, dur: 2.5 },
      { kind: "caption", field: "menu", text: I.menu && `[${I.menu}]`, dur: 2.5 },
      { kind: "caption", field: "price", text: I.price && `${I.menu} ${I.price}`, dur: 2.5 },
      { kind: "extra", dur: 2.5 },
      { kind: "caption", field: "loc", text: I.loc, dur: 3.0 },
    ] },

  storefront: { ...base, id: "storefront", name: "간판부터 수다", format: "④", opener: "first", shot: 2.0,
    desc: "첫 재료(간판)로 시작, 컷 2초, 아래쪽 둥근 글씨 두 줄 자막 — '자막 더 넣기' 줄이 잘 어울림",
    look: {
      hook: { font: "round", size: 84, y: 0.66, lineScale: [1, 1] },
      caption: { font: "round", size: 64, y: 0.70, stroke: 0.12 },
      end: { font: "round", firstFont: "round" },
    },
    beats: I => [
      { kind: "hook", lines: [I.area, `[${I.name}]`], dur: 2.5 },
      { kind: "extra", dur: 2.8 },
      { kind: "caption", field: "menu", text: I.menu && `[${I.menu}] 주문`, dur: 3.0 },
      { kind: "caption", field: "price", text: I.price && `가격은 ${I.price}`, dur: 3.0 },
      { kind: "caption", field: "loc", text: I.loc, dur: 3.0 },
      { kind: "caption", field: "hook", text: I.hook, dur: 3.0 },
    ] },

  diary: { ...base, id: "diary", name: "일기처럼 동선", format: "⑤", opener: "none", shot: 1.3,
    desc: "넣은 순서 그대로(외관→반찬→메인…), 컷 1.3초, 아래쪽 작은 자막",
    look: {
      caption: { font: "gothic", size: 48, y: 0.74, stroke: 0.08, shadow: 2 },
      end: { font: "gothic", firstFont: "heavy" },
    },
    beats: I => [
      { kind: "caption", field: "name", text: [I.area, I.name].filter(Boolean).join(" "), dur: 3.0 },
      { kind: "caption", field: "menu", text: I.menu, dur: 3.0 },
      { kind: "extra", dur: 2.5 },
      { kind: "caption", field: "price", text: I.price, dur: 3.0 },
      { kind: "caption", field: "loc", text: I.loc, dur: 3.0 },
    ] },

  price: { ...base, id: "price", name: "가격 먼저", format: "⑥",
    desc: "첫 화면에 메뉴와 가격을 크게(노랑 강조), 1초 컷",
    look: {
      hook: { font: "heavy", size: 112, y: 0.40, lineScale: [0.72, 1] },
      caption: { font: "gothic", size: CAP, y: 0.62 },
      end: { font: "gothic", firstFont: "heavy" },
    },
    beats: I => [
      { kind: "hook", field: "price", lines: I.price ? [I.menu || I.name, `[${I.price}]`] : [I.hook, `[${I.name}]`], dur: 2.6 },
      { kind: "caption", field: "name", text: `${I.area} [${I.name}]`, dur: 3.0 },
      { kind: "extra", dur: 2.5 },
      { kind: "caption", field: "hook", text: I.hook, dur: 3.0 },
      { kind: "caption", field: "loc", text: I.loc, dur: 3.0 },
    ] },

  sizzle: { ...base, id: "sizzle", name: "굽는 소리", format: "⑦", volume: 1.5,
    desc: "찍은 소리 크게, 글자 최소(처음 3초 가게 이름만), 효과음 없음",
    sfx: { end: "ding" },
    look: {
      title: { font: "heavy", size: 64, y: 0.10, sub: 38, subFont: "gothic" },
      caption: { font: "gothic", size: 52, y: 0.62 },
      end: { font: "gothic", firstFont: "heavy" },
    },
    title: I => ({ main: I.name, sub: [I.area, I.menu].filter(Boolean).join(" · ") }),
    titleUntil: 3.0,
    beats: () => [] },

  save: { ...base, id: "save", name: "저장 유도", format: "⑧",
    desc: "위에 검은 띠 상자로 지역·가게 고정, 상자 자막, 끝에 정보 정리(✓)",
    endCard: endList,
    look: {
      title: { font: "heavy", size: 52, y: 0.07, sub: 0, box: "#000000", boxAlpha: 0x40 },
      caption: { font: "gothic", size: 56, y: 0.60, box: "#000000", boxAlpha: 0x50 },
      end: { font: "gothic", firstFont: "heavy", y: 0.40 },
    },
    title: I => ({ main: [I.area, I.name].filter(Boolean).join(" ") }),
    beats: I => [
      { kind: "gap", dur: 0.8 },
      { kind: "caption", field: "menu", text: I.menu && `[${I.menu}]`, dur: 3.0 },
      { kind: "caption", field: "price", text: I.price, dur: 3.0 },
      { kind: "extra", dur: 2.5 },
      { kind: "caption", field: "loc", text: I.loc, dur: 3.0 },
      { kind: "caption", field: "hook", text: I.hook, dur: 3.0 },
    ] },

  info: { ...base, id: "info", name: "정보 이름표", format: "⑨ 변형",
    desc: "메뉴·가격·위치 이름표 자막(레트로 글씨), 끝에 ✓ 정리 카드",
    endCard: endList,
    look: {
      hook: { font: "retro", size: 92, y: 0.40, lineScale: [0.8, 1] },
      caption: { font: "retro", size: 66, y: 0.64, accent: YELLOW },
      end: { font: "retro", firstFont: "retro", y: 0.40 },
    },
    beats: I => [
      { kind: "hook", lines: [I.area, `[${I.name}]`], dur: 2.4 },
      { kind: "caption", field: "menu", text: I.menu && `메뉴 [${I.menu}]`, dur: 3.0 },
      { kind: "caption", field: "price", text: I.price && `가격 [${I.price}]`, dur: 3.0 },
      { kind: "caption", field: "loc", text: I.loc && `위치 ${I.loc}`, dur: 3.0 },
      { kind: "extra", dur: 2.5 },
      { kind: "caption", field: "hook", text: I.hook, dur: 3.0 },
    ] },

  regular: { ...base, id: "regular", name: "단골 손글씨", format: "⑩", shot: 1.3,
    desc: "1인칭 한마디를 손글씨로, 컷 1.3초, 따뜻한 느낌",
    look: {
      hook: { font: "hand", size: 92, y: 0.42, lineScale: [1, 0.9], accent: "#FFD27A" },
      caption: { font: "hand", size: 66, y: 0.66, accent: "#FFD27A" },
      end: { font: "hand", firstFont: "hand" },
    },
    beats: I => [
      { kind: "hook", field: "hook", lines: [I.hook || I.name, I.hook ? `[${I.name}]` : I.area], dur: 2.8 },
      { kind: "extra", dur: 2.8 },
      { kind: "caption", field: "menu", text: I.menu && `[${I.menu}]`, dur: 3.0 },
      { kind: "caption", field: "price", text: I.price, dur: 3.0 },
      { kind: "caption", field: "loc", text: I.loc, dur: 3.0 },
    ] },

  // [사용자 2026-11-01] 새 템플릿
  monologue: { ...base, id: "monologue", name: "혼잣말 자막", format: "혼잣말",
    desc: "한마디·자막 더 넣기 줄을 장면마다 한 줄씩, 화면 가운데에 크게 (예: 이거 하나 먹으려고)",
    look: {
      caption: { font: "heavy", size: 90, y: 0.50 },
      end: { font: "gothic", firstFont: "heavy" },
    },
    // 자막 더 넣기 줄이 없으면 메뉴·가격·위치를 같은 모양으로
    beats: I => (I.lines || []).length ? [{ kind: "extra", dur: 2.0 }] : [
      { kind: "caption", field: "menu", text: I.menu && `[${I.menu}]`, dur: 2.0 },
      { kind: "caption", field: "price", text: I.price, dur: 2.0 },
      { kind: "caption", field: "loc", text: I.loc, dur: 2.0 },
    ] },

  regionBig: { ...base, id: "regionBig", name: "지역 크게", format: "지역 강조",
    desc: "지역 이름을 화면 위쪽에 가장 크게(명조), 영어 지역명을 작게 함께 (켜면)",
    look: {
      title: { font: "serif", size: 150, y: 0.17, sub: 56, subFont: "serif" },
      caption: { font: "gothic", size: 80, y: 0.64 },
      end: { font: "gothic", firstFont: "serif" },
    },
    title: I => ({ main: lastWord(I.area) || I.name, sub: I.areaEn || "" }),
    beats: I => [
      { kind: "caption", field: "name", text: I.name && `[${I.name}]`, dur: 2.5 },
      { kind: "caption", field: "menu", text: I.menu && `[${I.menu}]`, dur: 2.5 },
      { kind: "caption", field: "price", text: I.price, dur: 2.5 },
      { kind: "extra", dur: 2.5 },
      { kind: "caption", field: "loc", text: I.loc, dur: 2.5 },
    ] },
};

export const DEFAULT_FOOD_TEMPLATE = "mukbang";

/**
 * '자동': 재료와 정보를 보고 고름. 같은 재료로 다시 누르면 지난번과 다른 것을 고름.
 * 가로 영상이 많으면 위아래 바탕(지역명 고정), 가격이 있으면 가격 먼저 등 — 정한 순서대로 후보를 세우고 돌아가며 씀.
 */
export function autoFoodTemplate(clips, info, last = []) {
  const land = clips.filter(c => c.landscape).length / Math.max(1, clips.length);
  const cands = [];
  if (land >= 0.4) cands.push("region");
  cands.push("mukbang");
  if (info.price) cands.push("price");
  if (info.hook) cands.push("declare", "regular");
  if ((info.lines || []).length) cands.push("storefront", "monologue");
  if (info.area) cands.push("regionBig");
  cands.push("save", "info", "diary", "sizzle");
  const fresh = cands.filter(c => !last.includes(c));
  return (fresh[0] || cands[0]);
}

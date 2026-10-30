// 글꼴 목록 + "이 글꼴에 이 글자가 있나" 검사. 없으면 기본 글꼴(Pretendard)로 바꿔 그림.
// 글꼴은 모두 SIL OFL 1.1 (상업용 무료). 라이선스: assets/licenses/
// 설치판(node)과 사이트판(브라우저)이 함께 씀: 글꼴 파일 읽는 방법만 다름 (setFontBytes 로 브라우저가 미리 넣어 줌)
const FONT_URL = new URL("../assets/fonts/", import.meta.url);
const nodeFs = globalThis.process?.getBuiltinModule?.("node:fs");
export const FONT_DIR = nodeFs ? globalThis.process.getBuiltinModule("node:url").fileURLToPath(FONT_URL) : FONT_URL.href;
const given = new Map();
/** 브라우저: 글꼴 파일 내용을 미리 넣어 둠 (file 이름 → ArrayBuffer/Uint8Array) */
export function setFontBytes(file, bytes) { given.set(file, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); }
function readFont(file) {
  if (given.has(file)) return given.get(file);
  if (nodeFs) return nodeFs.readFileSync(new URL(file, FONT_URL));
  throw new Error("글꼴을 아직 불러오지 않았어요: " + file);
}

// 느낌(키) → 파일. name 은 파일 안의 실제 이름을 읽어서 채움 (자막 프로그램이 이 이름으로 찾음)
export const FONTS = {
  gothic:  { file: "Pretendard-ExtraBold.otf", label: "기본 고딕", source: "Pretendard (OFL)" },
  heavy:   { file: "Pretendard-Black.otf", label: "아주 굵은 고딕", source: "Pretendard (OFL)" },
  title:   { file: "BlackHanSans-Regular.ttf", label: "검은 제목체", source: "Black Han Sans (OFL)" },
  retro:   { file: "DoHyeon-Regular.ttf", label: "레트로", source: "Do Hyeon (OFL)" },
  round:   { file: "Jua-Regular.ttf", label: "둥근", source: "Jua (OFL)" },
  serif:   { file: "NanumMyeongjo-ExtraBold.ttf", label: "명조", source: "Nanum Myeongjo (OFL)" },
  hand:    { file: "NanumPenScript-Regular.ttf", label: "손글씨", source: "Nanum Pen Script (OFL)" },
  kitsch:  { file: "Gugi-Regular.ttf", label: "키치", source: "Gugi (OFL)" },
};
export const FALLBACK = "gothic";

const cache = new Map();

/** TTF/OTF 의 name 표(이름)와 cmap 표(들어 있는 글자) 읽기 */
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const u8 = readFont(file), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const b = { readUInt16BE: o => dv.getUint16(o), readInt16BE: o => dv.getInt16(o), readUInt32BE: o => dv.getUint32(o), subarray: (s, e) => u8.subarray(s, e) };
  const n = b.readUInt16BE(4), tables = {};
  for (let i = 0; i < n; i++) { const o = 12 + i * 16; tables[String.fromCharCode(...u8.subarray(o, o + 4))] = b.readUInt32BE(o + 8); }
  // 이름: 4번(전체 이름) 우선, 영어 윈도우 표기
  const nm = tables.name, count = b.readUInt16BE(nm + 2), strOff = nm + b.readUInt16BE(nm + 4);
  const names = {};
  for (let i = 0; i < count; i++) {
    const r = nm + 6 + i * 12, pid = b.readUInt16BE(r), lang = b.readUInt16BE(r + 4), id = b.readUInt16BE(r + 6), len = b.readUInt16BE(r + 8), off = b.readUInt16BE(r + 10);
    if (pid !== 3 || lang !== 0x409) continue;
    const s = b.subarray(strOff + off, strOff + off + len); let t = "";
    for (let k = 0; k + 1 < s.length; k += 2) t += String.fromCharCode((s[k] << 8) | s[k + 1]);
    names[id] = t;
  }
  // 글자: cmap 형식 4(기본 평면) / 12(전체)
  const cm = tables.cmap, nsub = b.readUInt16BE(cm + 2), set = new Set();
  for (let i = 0; i < nsub; i++) {
    const so = cm + b.readUInt32BE(cm + 4 + i * 8 + 4), fmt = b.readUInt16BE(so);
    if (fmt === 4) {
      const seg = b.readUInt16BE(so + 6) / 2, ends = so + 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ranges = deltas + seg * 2;
      for (let s = 0; s < seg; s++) {
        const e = b.readUInt16BE(ends + s * 2), st = b.readUInt16BE(starts + s * 2), d = b.readInt16BE(deltas + s * 2), ro = b.readUInt16BE(ranges + s * 2);
        for (let c = st; c <= e && c !== 0xffff; c++) {
          let g;
          if (ro === 0) g = (c + d) & 0xffff;
          else { const gi = ranges + s * 2 + ro + (c - st) * 2; g = b.readUInt16BE(gi); if (g) g = (g + d) & 0xffff; }
          if (g) set.add(c);
        }
      }
    } else if (fmt === 12) {
      const ng = b.readUInt32BE(so + 12);
      for (let g = 0; g < ng; g++) { const o = so + 16 + g * 12, s0 = b.readUInt32BE(o), e0 = b.readUInt32BE(o + 4); for (let c = s0; c <= e0; c++) set.add(c); }
    }
  }
  const r = { name: names[4] || names[1], family: names[16] || names[1], chars: set };
  cache.set(file, r);
  return r;
}

/** 이 글꼴이 text 의 모든 글자(띄어쓰기 포함)를 갖고 있나. 없는 글자 목록을 돌려줌 */
export function missingChars(key, text) {
  const f = load(FONTS[key].file);
  return [...new Set([...String(text).replace(/[\[\]]/g, "")])].filter(ch => !f.chars.has(ch.codePointAt(0)));
}

/** 자막에 쓸 글꼴 이름: 원하는 글꼴에 없는 글자가 있으면 기본 글꼴 */
export function fontFor(key, text) {
  const k = FONTS[key] ? key : FALLBACK;
  const miss = missingChars(k, text);
  const use = miss.length ? FALLBACK : k;
  return { key: use, name: load(FONTS[use].file).name, fellBack: miss.length > 0, missing: miss };
}

export function fontName(key) { return load(FONTS[key].file).name; }

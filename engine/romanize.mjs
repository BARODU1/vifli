// 한글 지역 이름 → 영어 표기 (국어의 로마자 표기법 기본 규칙). 예) 광명 → Gwangmyeong, 남포동 → Nampodong
// 받침 다음 ㅇ은 넘겨 읽기, 자주 나는 소리 바뀜(ㄴㄹ→ll, ㅇ·ㅁ+ㄹ→n, ㄱ+ㄴ·ㅁ·ㄹ→ng, ㅂ+ㄴ·ㅁ·ㄹ→m)만 반영. 사장님이 화면에서 고쳐 쓸 수 있음.
const I = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const V = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const F = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];
// 받침이 다음 ㅇ 자리로 넘어갈 때 소리 (겹받침은 뒤 자음)
const LINK = ["", "g", "kk", "s", "n", "j", "h", "d", "r", "g", "m", "b", "s", "t", "p", "h", "m", "b", "s", "s", "ss", "", "j", "ch", "k", "t", "p", "h"];

export function romanize(text) {
  const syl = [...String(text || "")].map(ch => {
    const c = ch.charCodeAt(0) - 0xac00;
    return c >= 0 && c < 11172 ? { i: Math.floor(c / 588), v: Math.floor((c % 588) / 28), f: c % 28 } : { raw: ch };
  });
  let out = "";
  syl.forEach((s, k) => {
    if (s.raw != null) { out += s.raw === " " ? " " : s.raw; return; }
    const prev = syl[k - 1], next = syl[k + 1];
    let ini = I[s.i];
    // 앞 받침이 넘어왔으면 그 소리로
    if (prev && prev.raw == null && prev.f && s.i === 11 && LINK[prev.f]) ini = LINK[prev.f];
    else if (prev && prev.raw == null && s.i === 5) ini = [4, 8].includes(prev.f) ? "l" : [16, 21, 1, 17].includes(prev.f) ? "n" : "r"; // ㄴ/ㄹ+ㄹ→l, ㅁ·ㅇ·ㄱ·ㅂ+ㄹ→n
    let fin = F[s.f];
    if (next && next.raw == null) {
      if (s.f && next.i === 11 && LINK[s.f]) fin = s.f === 21 ? "ng" : ""; // 넘겨 읽음 (ㅇ받침은 그대로)
      else if (s.f === 4 && next.i === 5) fin = "l";                        // ㄴ+ㄹ → ll
      else if (s.f === 1 && (next.i === 2 || next.i === 6 || next.i === 5)) fin = "ng"; // ㄱ+ㄴ/ㅁ/ㄹ → ng
      else if (s.f === 17 && (next.i === 2 || next.i === 6 || next.i === 5)) fin = "m";  // ㅂ+ㄴ/ㅁ/ㄹ → m
    }
    out += ini + V[s.v] + fin;
  });
  return out.split(" ").map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
}

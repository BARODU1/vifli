// 구간 점수 — 설치판(analyze.mjs)과 사이트판이 함께 씀 (node 기능 없이 순수 계산만)

/** 구간 [t, t+len] 점수: 덜 흔들리고(움직임 작음) 색이 진할수록 높음 */
export function windowScore(info, t, len) {
  const m = info.motion.filter(x => x.t >= t && x.t <= t + len).map(x => x.v);
  const c = info.color.filter(x => x.t >= t - 0.25 && x.t <= t + len + 0.25).map(x => x.v);
  const motion = m.length ? m.reduce((a, b) => a + b, 0) / m.length : 0;
  const jolt = m.length ? Math.max(...m) : 0; // 갑자기 크게 흔들리는 순간
  const color = c.length ? c.reduce((a, b) => a + b, 0) / c.length : 0;
  return color * 10 - motion * 0.6 - jolt * 0.2;
}

/** 구간 [t, t+len] 의 평균 밝기(0~255)·평균 움직임 — 첫 장면 고르기용. 밝기를 안 잰 옛 분석이면 light=null */
export function windowLightMotion(info, t, len) {
  const avg = (arr, a, b) => { const v = (arr || []).filter(x => x.t >= a && x.t <= b).map(x => x.v); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  return { light: avg(info.light, t, t + len), motion: avg(info.motion, t, t + len) ?? 0 };
}

/** 작은 RGB 그림의 색 진하기 (너무 어두운 칸은 빼고) */
export function satOf(buf, off, len, step = 3) {
  let s = 0, n = 0;
  for (let k = off; k < off + len; k += step) {
    const r = buf[k], g = buf[k + 1], b = buf[k + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 40) { s += (mx - mn) / mx; n++; }
  }
  return n ? s / n : 0;
}

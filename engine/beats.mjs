// 박자 맞춤: 배경음악 소리(모노 PCM)에서 박자 시각을 찾고, 컷 바뀌는 시점을 가까운 박자에 맞춤
// 설치판·사이트판이 함께 쓰는 순수 계산 (node 기능 없음)

const r2 = x => Math.round(x * 100) / 100;

/**
 * 박자 찾기: 소리 세기가 갑자기 커지는 정도(onset)를 0.01초마다 재고 → 자기상관으로 빠르기(BPM 70~180) → 박자 위치(위상)
 * @param pcm  Float32Array 모노
 * @param sr   표본 수/초
 * @returns { bpm, beats:[초], strength } — 박자가 뚜렷하지 않으면 beats 는 빈 배열
 */
export function detectBeats(pcm, sr) {
  const hop = Math.round(sr / 100), win = hop * 2, n = Math.floor((pcm.length - win) / hop);
  if (n < 300) return { bpm: 0, beats: [], strength: 0 };
  const env = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let e = 0; const o = i * hop;
    for (let k = 0; k < win; k++) { const v = pcm[o + k]; e += v * v; }
    const l = Math.log(1e-9 + e / win);
    env[i] = Math.max(0, l - prev); prev = l;
  }
  // 평균 빼기
  const mean = env.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) env[i] = Math.max(0, env[i] - mean);
  // 빠르기: 0.33~0.86초 간격 (70~180 BPM) 중 자기상관이 가장 큰 것 (120 근처를 조금 우대)
  let best = { lag: 0, s: -1 }, zero = 0;
  for (let i = 0; i < n; i++) zero += env[i] * env[i];
  for (let lag = 33; lag <= 86; lag++) {
    let s = 0; for (let i = lag; i < n; i++) s += env[i] * env[i - lag];
    const bpm = 6000 / lag, w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    if (s * w > best.s) best = { lag, s: s * w, raw: s };
  }
  const strength = zero ? best.raw / zero : 0;
  // 위상: 그 간격으로 놓은 박자 격자 중 onset 합이 가장 큰 시작점
  let ph = { o: 0, s: -1 };
  for (let o = 0; o < best.lag; o++) { let s = 0; for (let i = o; i < n; i += best.lag) s += env[i] + 0.5 * (env[i - 1] || 0) + 0.5 * (env[i + 1] || 0); if (s > ph.s) ph = { o, s }; }
  const beats = [];
  for (let i = ph.o; i < n; i += best.lag) beats.push(r2(i / 100));
  return { bpm: Math.round(6000 / best.lag), beats: strength > 0.05 ? beats : [], strength: Math.round(strength * 100) / 100 };
}

/**
 * 컷 경계(shot.at)를 가까운 박자로 옮김. 컷 길이는 최소 minDur, 영상은 원본 길이 안에서만(모자라면 시작점을 당김)
 * shots 는 at·dur·start·speed 가 정해진 상태(마지막은 정보 카드). 바꾼 수를 돌려줌.
 */
export function snapShotsToBeats(shots, clips, beats, { minDur = 0.4, maxMove = 0.3 } = {}) {
  if (!beats?.length || shots.length < 2) return 0;
  let moved = 0;
  const near = t => beats.reduce((b, x) => Math.abs(x - t) < Math.abs(b - t) ? x : b, beats[0]);
  // 원래 컷 시점 기준으로 가장 가까운 박자 (옮긴 만큼이 뒤로 쌓여 영상이 길어지지 않게)
  const orig = shots.map(s => s.at);
  for (let i = 1; i < shots.length; i++) {
    const s = shots[i], p = shots[i - 1];
    const want = near(orig[i]);
    if (Math.abs(want - orig[i]) > maxMove || want - p.at < minDur || want === s.at) continue;
    // 앞 컷 길이가 바뀜: 영상이면 원본 안에 들어가는지 확인 (모자라면 시작점을 앞으로)
    const newDur = r2(want - p.at), c = clips[p.clip], sp = p.speed || 1;
    if (c.kind === "video" && p.role !== "end") {
      const room = c.duration - 0.05;
      if (p.start + newDur * sp > room) { const ns = r2(room - newDur * sp); if (ns < 0) continue; p.start = ns; }
    }
    const d = r2(want - s.at);
    p.dur = newDur;
    for (let k = i; k < shots.length; k++) shots[k].at = r2(shots[k].at + d);
    moved++;
  }
  return moved;
}

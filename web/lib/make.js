// 사이트판 영상 만들기 한 번의 전체 순서 — 설치판 engine/job.mjs + render.mjs 와 같은 순서·같은 규칙.
// 장면 계획·템플릿·자막(ASS)·썸네일 글자·장면 6장 시각은 설치판 코드를 그대로 불러 씀.
// 다른 점: 컷을 자르고 붙이는 일은 브라우저 하드웨어(WebCodecs)로 한 번에 굽고, 소리·자막 그림만 ffmpeg.wasm.
import { planFood } from "../../engine/food/plan.mjs";
import { FOOD_TEMPLATES, DEFAULT_FOOD_TEMPLATE, autoFoodTemplate } from "../../engine/templates/food.mjs";
import { planStudio } from "../../engine/studio/plan.mjs";
import { STUDIO_TEMPLATES, DEFAULT_STUDIO_TEMPLATE, autoStudioTemplate } from "../../engine/templates/studio.mjs";
import { FONTS, setFontBytes } from "../../engine/fonts.mjs";
import { buildAss } from "../../engine/ass.mjs";
import { cleanInfo, thumbAss, thumbPicks, thumbLines, captureTimes } from "../../engine/jobShared.mjs";
import { CANVAS, AUDIO, LANDSCAPE, STUDIO, SAFE } from "../../config/standards.mjs";
import { APP_NAME } from "../../config/app.mjs";
import { decodeAt } from "./media.js";
import { getFF, fontBytes, run, writeFile, readFile, rm, mkdir, mountFiles, renderSubs, lowestInk } from "./ff.js";

export const KINDS = {
  food: { label: "맛집", templates: FOOD_TEMPLATES, def: DEFAULT_FOOD_TEMPLATE, auto: autoFoodTemplate, plan: planFood, nameLabel: "가게 이름" },
  studio: { label: "사진관", templates: STUDIO_TEMPLATES, def: DEFAULT_STUDIO_TEMPLATE, auto: autoStudioTemplate, plan: planStudio, nameLabel: "사진관 이름" },
};
const W = CANVAS.width, H = CANVAS.height, FPS = CANVAS.fps;
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const safeName = s => String(s || "").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 60) || "영상";

let ready = null;
/** ffmpeg·글꼴 준비 (처음 한 번, 약 25MB 받음) */
export function prepare() {
  if (!ready) ready = (async () => { await getFF(); for (const [n, b] of Object.entries(fontBytes)) setFontBytes(n, b); })();
  return ready;
}

/** 설치판 fitFilter 와 같은 배치: fill(채우기) / band(띠) / frame·framelight(액자) / wide(가로 그대로) */
function drawFit(g, src, sw, sh, fit) {
  g.imageSmoothingQuality = "high";
  if (/^frame/.test(fit)) {
    const f = STUDIO.frame, end = fit.endsWith("-end");
    const bw = f.width, bh = end ? f.endHeight : f.height, cy = Math.round(H * (end ? f.endCenterY : f.centerY));
    const s = Math.min(bw / sw, bh / sh), iw = Math.round(sw * s), ih = Math.round(sh * s);
    g.fillStyle = fit.startsWith("framelight") ? f.light : f.dark; g.fillRect(0, 0, W, H);
    g.drawImage(src, 0, 0, sw, sh, Math.floor((W - iw) / 2), Math.floor(cy - ih / 2), iw, ih);
  } else if (fit === "wide") {
    const ih = Math.round(sh * W / sw / 2) * 2;
    g.fillStyle = STUDIO.frame.dark; g.fillRect(0, 0, W, H);
    g.drawImage(src, 0, 0, sw, sh, 0, Math.floor(Math.round(H * STUDIO.frame.wideCenterY) - ih / 2), W, ih);
  } else if (fit === "band") {
    const b = LANDSCAPE.band, bh = b.bottom - b.top, sq = Math.min(sw, sh), srcH = bh * sq / W;
    g.fillStyle = b.background; g.fillRect(0, 0, W, H);
    g.drawImage(src, (sw - sq) / 2, (sh - sq) / 2 + (sq - srcH) / 2, sq, srcH, 0, b.top, W, bh);
  } else {
    const s = Math.max(W / sw, H / sh), iw = sw * s, ih = sh * s;
    g.drawImage(src, 0, 0, sw, sh, (W - iw) / 2, (H - ih) / 2, iw, ih);
  }
}

/**
 * ffmpeg eq(밝기·채도) + drawbox(검은 막) 를 같은 계산으로 — 정보 카드 장면을 어둡게, 썸네일 살짝 어둡게.
 * ffmpeg 처럼 YUV(제한 범위)에서 계산. 수치는 설치판 ffmpeg 6.1 로 잰 값:
 *  eq brightness b → 밝기(Y) += b×272, saturation s → 색(U·V) × s, drawbox black@0.45 → Y = 0.55Y + 0.45×16, 색 × 0.09
 */
function eqDim(g, bright, sat = 1, cover = 0) {
  const im = g.getImageData(0, 0, W, H), d = im.data, dy = bright * 272, ky = 1 - cover, kc = sat * (cover ? 0.09 : 1);
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p], gg = d[p + 1], b = d[p + 2];
    let y = 16 + (46.559 * r + 156.629 * gg + 15.812 * b) / 255; // BT.709 (휴대폰 영상·브라우저 굽기 모두 709)
    const cb = (-25.664 * r - 86.336 * gg + 112 * b) / 255 * kc, cr = (112 * r - 101.730 * gg - 10.270 * b) / 255 * kc;
    y = Math.max(0, y + dy) * ky + 16 * cover;
    const yy = 1.164 * (y - 16);
    d[p] = yy + 1.793 * cr; d[p + 1] = yy - 0.213 * cb - 0.533 * cr; d[p + 2] = yy + 2.112 * cb;
  }
  g.putImageData(im, 0, 0);
}

/** eqDim 과 같은 계산을 그래픽카드(WebGL)로 — 정보 카드 장면은 프레임마다 해야 해서 빠르게 */
function glDimmer(bright, sat, cover) {
  const c = new OffscreenCanvas(W, H), gl = c.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, `#version 300 es
    in vec2 p; out vec2 uv; void main(){ uv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0,1); }`));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float; in vec2 uv; uniform sampler2D t; uniform float dy, ky, kc, cv; out vec4 o;
    void main(){ vec3 c = texture(t, uv).rgb * 255.0;
      float y = 16.0 + dot(c, vec3(46.559,156.629,15.812))/255.0;
      float cb = dot(c, vec3(-25.664,-86.336,112.0))/255.0*kc, cr = dot(c, vec3(112.0,-101.730,-10.270))/255.0*kc;
      y = max(0.0, y + dy) * ky + 16.0 * cv; float yy = 1.164*(y-16.0);
      o = vec4(clamp(vec3(yy+1.793*cr, yy-0.213*cb-0.533*cr, yy+2.112*cb)/255.0, 0.0, 1.0), 1.0); }`));
  gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.uniform1f(gl.getUniformLocation(pr, "dy"), bright * 272); gl.uniform1f(gl.getUniformLocation(pr, "ky"), 1 - cover);
  gl.uniform1f(gl.getUniformLocation(pr, "kc"), sat * (cover ? 0.09 : 1)); gl.uniform1f(gl.getUniformLocation(pr, "cv"), cover);
  gl.viewport(0, 0, W, H);
  return src => { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); return c; };
}

/** 자동 템플릿: 같은 재료로 다시 누르면 다른 것 (이 브라우저에 기억) */
function autoPick(K, kind, clips, info) {
  const key = kind + ":" + clips.map(c => c.name).join("|");
  let mem = {}; try { mem = JSON.parse(localStorage.getItem("vifli.auto") || "{}"); } catch {}
  const tid = K.auto(clips, info, mem[key] || []);
  mem[key] = [...(mem[key] || []), tid].slice(-6);
  try { localStorage.setItem("vifli.auto", JSON.stringify(mem)); } catch {}
  return tid;
}

const extOf = n => (/\.(\w+)$/.exec(n)?.[1] || "bin").toLowerCase();
let sfxReady = false;

/**
 * @param job { kind, clips:[{m:openMedia 결과, a:analyze 결과, hero, fit, caption, role}], info, template, font, origVolume,
 *              bgm?:{ file:File|Blob, name, volume, start, fade, source, credit } }
 * @param log (msg, ratio) => void
 * @returns { name, video:Blob, thumbs:[{name,blob}], captures:{name,blob}, credits:{name,text}, check, plan, seconds }
 */
export async function makeVideo(job, log = () => {}) {
  const t0 = performance.now();
  const K = KINDS[job.kind] || KINDS.food;
  const info = cleanInfo(job.info);
  if (!job.clips?.length) throw new Error("영상이나 사진을 하나 이상 넣어 주세요.");
  if (!info.name) throw new Error(`${K.nameLabel}을 넣어 주세요.`);
  log("준비 중 (처음 한 번은 부품을 받아요)", 0.01);
  await prepare();

  const clips = job.clips.map(c => ({ ...c.a, hero: !!c.hero, fit: c.fit || "auto", caption: c.caption || "auto", role: c.role || "space" }));
  let tid = job.template;
  if (!tid || tid === "auto") { tid = autoPick(K, job.kind || "food", clips, info); log(`자동으로 고른 템플릿: ${K.templates[tid].name}`, 0.03); }
  const tpl = K.templates[tid] || K.templates[K.def];
  const font = job.font && job.font !== "template" && FONTS[job.font] ? job.font : null;
  const vol = (job.origVolume ?? 1) * (tpl.volume ?? 1);
  const plan = K.plan(clips, info, tpl);
  const ass = buildAss(plan, tpl, { font });
  log(`장면 계획: ${plan.shots.length}컷, ${plan.duration}초, 첫 장면 ${clips[plan.hero.clip].name}`, 0.04);
  const name = `${safeName(info.name)}_${tpl.name}${font ? "_" + FONTS[font].label : ""}`;

  // 1) 자막 그림 (설치판과 같은 libass)
  log("자막 그리는 중", 0.05);
  const subs = await renderSubs(ass.text, plan.duration, FPS, "s");
  log(`자막 그림 ${subs.frames}장`, 0.15);

  // 2) 영상: 컷마다 풀어서 1080x1920 에 배치 → 자막 얹기 → 하드웨어 H.264
  const chunks = [];
  let encErr = null;
  const enc = new VideoEncoder({ output: c => { const b = new Uint8Array(c.byteLength); c.copyTo(b); chunks.push(b); }, error: e => { encErr = e; } });
  const cfg = { codec: "avc1.640028", width: W, height: H, bitrate: 10e6, framerate: FPS, avc: { format: "annexb" } };
  if (!(await VideoEncoder.isConfigSupported(cfg)).supported) throw new Error("이 브라우저는 영상 굽기(H.264)를 못 해요. 크롬·엣지·사파리 최신판으로 해 주세요.");
  enc.configure(cfg);
  // 그림판은 그래픽카드에서 (willReadFrequently 를 켜면 CPU 로 그려져 아주 느림)
  const main = new OffscreenCanvas(W, H), g = main.getContext("2d");
  const base = new OffscreenCanvas(W, H), gb = base.getContext("2d");
  const dimGL = glDimmer(-0.12, 0.8, 0.45);
  const dimOn = (ctx, cv) => { if (dimGL) ctx.drawImage(dimGL(cv), 0, 0); else eqDim(ctx, -0.12, 0.8, 0.45); };
  const capT = captureTimes(plan), capF = capT.map(t => Math.round(t * FPS));
  const cap = new OffscreenCanvas(capT.length * 366 + 6, 652), gc = cap.getContext("2d");
  gc.fillStyle = "#fff"; gc.fillRect(0, 0, cap.width, cap.height);
  const picks = thumbPicks(plan), thumbBase = new Map();
  const totalF = plan.shots.reduce((a, s) => a + Math.round(s.dur * FPS), 0);
  let n = 0;
  const put = () => {
    const key = subs.keyOf[n];
    if (key) g.drawImage(subs.bitmaps.get(key), 0, 0);
    capF.forEach((f, i) => { if (f === n || (f >= totalF && n === totalF - 1 && i === capF.length - 1)) {
      const x = 6 + i * 366; gc.drawImage(main, x, 6, 360, 640); gc.fillStyle = "rgba(255,0,0,.9)"; gc.fillRect(x, 6 + 512, 360, 2); } });
    const vf = new VideoFrame(main, { timestamp: Math.round(n * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(vf, { keyFrame: n % 60 === 0 }); vf.close();
    n++;
  };
  const busy = () => enc.encodeQueueSize > 6;
  for (let si = 0; si < plan.shots.length; si++) {
    const s = plan.shots[si], c = job.clips[s.clip], m = c.m, frames = Math.round(s.dur * FPS);
    const dim = s.role === "end" && !/^frame/.test(s.fit);
    const pick = picks.indexOf(s), mid = Math.round(s.dur / 2 * FPS);
    log(`장면 ${si + 1}/${plan.shots.length} 굽는 중`, 0.15 + 0.6 * n / totalF);
    if (m.kind === "photo") {
      drawFit(gb, m.img, m.width, m.height, s.fit); if (dim) dimOn(gb, base);
      for (let k = 0; k < frames; k++) {
        g.drawImage(base, 0, 0);
        if (pick >= 0 && k === mid) { const t = new OffscreenCanvas(W, H); t.getContext("2d").drawImage(main, 0, 0); thumbBase.set(pick, t); }
        put(); while (busy()) await sleep(2);
      }
    } else {
      const targets = Array.from({ length: frames }, (_, k) => s.start + k / FPS);
      await decodeAt(m, targets, (src, k) => {
        drawFit(g, src, m.width, m.height, s.fit); if (dim) dimOn(g, main);
        if (pick >= 0 && k === mid) { const t = new OffscreenCanvas(W, H); t.getContext("2d").drawImage(main, 0, 0); thumbBase.set(pick, t); }
        put();
      }, { tooBusy: busy });
    }
    if (encErr) throw new Error("영상 굽기 중 문제가 생겼어요: " + encErr.message);
  }
  await enc.flush(); enc.close();
  if (encErr) throw new Error("영상 굽기 중 문제가 생겼어요: " + encErr.message);
  const h264 = new Uint8Array(chunks.reduce((a, b) => a + b.length, 0));
  { let o = 0; for (const b of chunks) { h264.set(b, o); o += b.length; } }
  log("영상 그림 완성, 소리 만드는 중", 0.76);

  // 3) 소리: 설치판 renderShot·renderPlan 과 같은 필터 (컷 소리 → 효과음·배경음악 → -14 LUFS 2단계 → 리미터)
  await mkdir("/job"); await mkdir("/sfx");
  const names = job.clips.map((c, i) => `c${i}.${extOf(c.m.file.name)}`);
  const files = job.clips.map((c, i) => new File([c.m.file], names[i]));
  if (job.bgm?.file) files.push(new File([job.bgm.file], "bgm." + extOf(job.bgm.name || job.bgm.file.name || "a.mp3")));
  await mountFiles(files);
  if (!sfxReady) { for (const k of ["pop", "whoosh", "ding"]) await writeFile(`/sfx/${k}.wav`, new Uint8Array(await (await fetch(new URL(`../../assets/sfx/${k}.wav`, import.meta.url))).arrayBuffer())); sfxReady = true; }
  const inputs = [], al = [];
  plan.shots.forEach((s, i) => {
    const has = s.kind === "video" && s.hasAudio !== false, fade = Math.min(0.03, s.dur / 4);
    if (has) inputs.push("-ss", String(s.start), "-t", String(s.dur + 0.1), "-i", `/src/${names[s.clip]}`);
    else inputs.push("-f", "lavfi", "-t", String(s.dur + 0.1), "-i", "anullsrc=r=48000:cl=stereo");
    al.push(`[${i}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo,volume=${has ? vol : 0},afade=t=in:d=${fade},apad,afade=t=out:st=${(s.dur - fade).toFixed(3)}:d=${fade},atrim=0:${s.dur}[p${i}]`);
  });
  al.push(plan.shots.map((_, i) => `[p${i}]`).join("") + `concat=n=${plan.shots.length}:v=0:a=1[a0]`);
  const mixIn = ["[a0]"];
  let idx = plan.shots.length;
  plan.sfx.forEach((e, k) => {
    inputs.push("-i", `/sfx/${e.type}.wav`);
    const ms = Math.round(e.t * 1000);
    al.push(`[${idx++}:a]adelay=${ms}|${ms},volume=${e.type === "pop" ? 0.5 : 0.7}[s${k}]`); mixIn.push(`[s${k}]`);
  });
  if (job.bgm?.file) {
    inputs.push("-stream_loop", "-1", "-i", `/src/${files[files.length - 1].name}`);
    const start = Math.max(0, +job.bgm.start || 0), fade = Math.min(plan.duration / 2, Math.max(0, job.bgm.fade ?? 2));
    al.push(`[${idx++}:a]atrim=start=${start},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${job.bgm.volume ?? 0.35},atrim=0:${plan.duration}` +
      (fade > 0 ? `,afade=t=out:st=${Math.max(0, plan.duration - fade).toFixed(2)}:d=${fade}` : "") + `[bg]`); mixIn.push("[bg]");
  }
  al.push(`${mixIn.join("")}amix=inputs=${mixIn.length}:normalize=0:duration=first[mix]`);
  const baseLoud = `loudnorm=I=${AUDIO.targetLufs}:TP=${AUDIO.truePeakDb}:LRA=${AUDIO.lra}`;
  let loud = baseLoud;
  log("소리 크기 재는 중", 0.8);
  try {
    const out = await run([...inputs, "-filter_complex", [...al, `[mix]${baseLoud}:print_format=json[a]`].join(";"), "-map", "[a]", "-f", "null", "-"]);
    const j = JSON.parse(out.slice(out.lastIndexOf("{"), out.lastIndexOf("}") + 1));
    if (isFinite(+j.input_i) && +j.input_i > -70)
      loud = `${baseLoud}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  } catch { /* 재기 실패하면 1단계 loudnorm */ }
  log("소리 맞추는 중", 0.84);
  await run([...inputs, "-filter_complex", [...al, `[mix]${loud},alimiter=limit=0.7:level=false,aresample=48000,aformat=channel_layouts=stereo[a]`].join(";"), "-map", "[a]",
    "-ac", "2", "-c:a", "pcm_s16le", "-ar", "48000", "-t", String(plan.duration), "-y", "/job/a.wav"]);

  // 4) 합치기: 영상은 그대로 복사, 소리만 AAC
  log("영상·소리 합치는 중", 0.9);
  await writeFile("/job/v.h264", h264);
  await run(["-framerate", String(FPS), "-i", "/job/v.h264", "-i", "/job/a.wav", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-bsf:v", "h264_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart", "-t", String(plan.duration), "-y", "/job/out.mp4"]);
  const mp4 = await readFile("/job/out.mp4");
  await rm("/job/v.h264"); await rm("/job/a.wav");

  // 5) 검사: 길이·음량(ebur128)·자막 가장 아래 줄
  log("결과 검사 중 (길이·음량·자막 위치)", 0.93);
  const e = await run(["-nostats", "-i", "/job/out.mp4", "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]);
  await rm("/job/out.mp4");
  const sum = e.slice(e.lastIndexOf("Summary:"));
  const gnum = re => { const mm = sum.match(re); return mm ? +mm[1] : null; };
  const dm = /Duration: (\d+):(\d+):([\d.]+)/.exec(e);
  const lufs = gnum(/I:\s+(-?[\d.]+) LUFS/), bottom = lowestInk([...subs.bitmaps.values()]);
  const check = { duration: dm ? Math.round((+dm[1] * 3600 + +dm[2] * 60 + +dm[3]) * 100) / 100 : null, frames: n, plannedShots: plan.shots.length,
    lufs, peak: gnum(/Peak:\s+(-?[\d.]+) dBFS/), lufsOk: lufs != null && Math.abs(lufs - AUDIO.targetLufs) <= AUDIO.lufsTolerance,
    textBottomPx: bottom, bottomFifthFrom: SAFE.bottomForbiddenFrom, bottomFifthOk: bottom == null || bottom <= SAFE.bottomForbiddenFrom };

  // 6) 썸네일 3안 + 장면 6장
  log("썸네일 3안 만드는 중", 0.95);
  const L = thumbLines(info), thumbs = [];
  for (let k = 0; k < picks.length; k++) {
    const t = thumbBase.get(k); if (!t) continue;
    const tg = t.getContext("2d", { willReadFrequently: true }); eqDim(tg, -0.06);
    const ts = await renderSubs(thumbAss(L[k]), 0.1, FPS, "t");
    if (ts.keyOf[0]) tg.drawImage(ts.bitmaps.get(ts.keyOf[0]), 0, 0);
    thumbs.push({ name: `${name}_썸네일${"ABC"[k]}.jpg`, blob: await t.convertToBlob({ type: "image/jpeg", quality: 0.92 }) });
  }
  const captures = { name: `${name}_장면6.jpg`, blob: await cap.convertToBlob({ type: "image/jpeg", quality: 0.9 }) };

  const credits = [`${APP_NAME} — ${name}.mp4`, `효과음: ${APP_NAME}가 직접 합성한 소리(외부 음원 아님)`,
    job.bgm?.file ? `배경음악: ${job.bgm.name} — 출처: ${job.bgm.source || "사용자가 넣은 음악"}` + (job.bgm.start ? ` · ${job.bgm.start}초부터` : "") + (job.bgm.credit ? `\n영상 설명에 붙여 넣을 출처 문구: ${job.bgm.credit}` : "") : "배경음악: 없음(찍은 영상 원래 소리)",
    `글꼴: Pretendard 등 (SIL OFL 1.1)`, `${K.label} 정보(입력값): ${JSON.stringify(info)}`, `만든 곳: ${APP_NAME} 사이트판 (영상은 이 기기 안에서만 처리, 어디에도 올리지 않음)`].join("\n") + "\n";
  const seconds = Math.round((performance.now() - t0) / 100) / 10;
  log(`완성: ${name}.mp4 (${seconds}초 걸림)`, 1);
  return { name, video: new Blob([mp4], { type: "video/mp4" }), thumbs, captures, credits: { name: `${name}_출처.txt`, text: credits }, check, plan, template: tpl.id, templateName: tpl.name, seconds, captureTimes: capT };
}

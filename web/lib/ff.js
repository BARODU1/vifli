// 사이트판에서 ffmpeg(브라우저용 ffmpeg.wasm)는 무거운 영상 굽기에는 안 쓰고(느림),
// ① 자막 그림(설치판과 같은 libass) ② 소리 섞기·음량 맞춤(-14 LUFS 2단계) ③ 마지막 합치기(영상 복사 + AAC)에만 씀.
import { FFmpeg } from "../vendor/ffmpeg/dist/esm/index.js";
import { FONTS } from "../../engine/fonts.mjs";

const VENDOR = new URL("../vendor/", import.meta.url).href;
let ff = null, loading = null, logs = [];
const FONT_FILES = [...new Set(Object.values(FONTS).map(f => f.file)), "Pretendard-Black.otf", "Pretendard-Bold.otf", "Pretendard-SemiBold.otf", "Pretendard-Regular.otf"];
export const fontBytes = {};

export async function getFF() {
  if (ff) return ff;
  if (!loading) loading = (async () => {
    const f = new FFmpeg();
    f.on("log", e => { logs.push(e.message); if (logs.length > 4000) logs = logs.slice(-2000); });
    await f.load({ coreURL: VENDOR + "core/dist/esm/ffmpeg-core.js", wasmURL: VENDOR + "core/dist/esm/ffmpeg-core.wasm" });
    await f.createDir("/fonts");
    // 글꼴(모두 OFL)을 ffmpeg 안 /fonts 에 넣음 — 자막 프로그램(libass)이 여기서 찾음
    for (const name of [...new Set(FONT_FILES)]) {
      const b = new Uint8Array(await (await fetch(new URL(`../../assets/fonts/${name}`, import.meta.url))).arrayBuffer());
      fontBytes[name] = b.slice();
      await f.writeFile("/fonts/" + name, b);
    }
    ff = f;
    return f;
  })();
  return loading;
}

/** ffmpeg 실행. 실패하면 마지막 기록과 함께 오류. 돌려주는 값: 이번 실행의 기록 */
export async function run(args) {
  const f = await getFF();
  const from = logs.length;
  const code = await f.exec(["-hide_banner", ...args]);
  const out = logs.slice(from).join("\n");
  if (code !== 0) throw new Error("영상 처리 중 문제가 생겼어요.\n" + out.split("\n").slice(-8).join("\n"));
  return out;
}

export async function writeFile(p, data) { return (await getFF()).writeFile(p, data); }
export async function readFile(p) { return (await getFF()).readFile(p); }
export async function rm(p) { try { await (await getFF()).deleteFile(p); } catch {} }
export async function mkdir(p) { try { await (await getFF()).createDir(p); } catch {} }
export async function ls(p) { return (await (await getFF()).listDir(p)).filter(e => !e.isDir).map(e => e.name); }

/** 사용자 파일을 복사하지 않고 ffmpeg 안에서 읽게 연결 (/src/이름) */
let mounted = false;
export async function mountFiles(files) {
  const f = await getFF();
  if (mounted) { try { await f.unmount("/src"); } catch {} }
  await mkdir("/src");
  await f.mount("WORKERFS", { files }, "/src");
  mounted = true;
}

// ---- 자막 그림 ----
const tsec = s => { const [h, m, x] = s.split(":"); return +h * 3600 + +m * 60 + +x; };

/** ASS 자막을 장면별 투명 그림으로. 움직이는 순간(나타나기·튀기)만 프레임마다, 가만히 있는 동안은 한 장을 다시 씀 */
export async function renderSubs(assText, duration, fps = 30, tag = "s") {
  const ev = [];
  for (const line of assText.split(/\r?\n/)) {
    if (!line.startsWith("Dialogue:")) continue;
    const p = line.slice(9).split(","), s = tsec(p[1].trim()), e = tsec(p[2].trim()), text = p.slice(9).join(",");
    const anim = [];
    for (const m of text.matchAll(/\\fad\((\d+),(\d+)\)/g)) { anim.push([s, s + +m[1] / 1000], [e - +m[2] / 1000, e]); }
    for (const m of text.matchAll(/\\t\(([^)]*)\)/g)) {
      const a = m[1].split(","); const n = a.length >= 3 && /^\s*-?\d+\s*$/.test(a[0]) && /^\s*-?\d+\s*$/.test(a[1]);
      anim.push(n ? [s + +a[0] / 1000, s + +a[1] / 1000] : [s, e]);
    }
    if (/\\(move|k|K|kf)\b/.test(text)) anim.push([s, e]);
    ev.push({ s, e, anim });
  }
  const N = Math.round(duration * fps), keyOf = new Array(N).fill(null), rep = new Map();
  for (let n = 0; n < N; n++) {
    const t = n / fps, act = [];
    let moving = false;
    ev.forEach((x, i) => { if (x.s <= t && t < x.e) { act.push(i); if (x.anim.some(([a, b]) => t >= a - 0.5 / fps && t <= b + 0.5 / fps)) moving = true; } });
    if (!act.length) continue;
    const key = moving ? "f" + n : "s" + act.join(",");
    keyOf[n] = key; if (!rep.has(key)) rep.set(key, n);
  }
  const frames = [...rep.values()].sort((a, b) => a - b);
  const out = new Map(); // key → ImageBitmap
  if (!frames.length) return { keyOf, bitmaps: out, frames: 0 };
  const dir = `/${tag}`; await mkdir(dir);
  await writeFile(`${dir}/c.ass`, new TextEncoder().encode("﻿" + assText));
  // 한 번에 너무 긴 식이 되지 않게 120장씩
  // 자막 프로그램은 투명도를 채워 주지 않음 → 검은 바탕·흰 바탕에 각각 그려서 두 그림의 차이로 투명도를 계산 (정확함)
  const byFrame = new Map();
  // 압축 없는 날 그림(rgb24)으로 16장씩 (PNG 압축·풀기가 느려서)
  const W = 1080, H = 1920, FS = W * H * 3;
  for (let i = 0; i < frames.length; i += 16) {
    const part = frames.slice(i, i + 16);
    // 필요한 장면만: 바탕 k장을 만들고 k번째 장의 시각을 그 장면 시각으로 바꿔 자막을 그림
    const pts = part.reduceRight((acc, n, k) => k === part.length - 1 ? `${n / fps}` : `if(eq(N,${k}),${n / fps},${acc})`, "");
    const raw = {};
    for (const bg of ["black", "white"]) {
      await run(["-f", "lavfi", "-i", `color=c=${bg}:s=${W}x${H}:r=${fps},format=rgb24`,
        "-vf", `setpts='(${pts})/TB',ass=filename=${dir}/c.ass:fontsdir=/fonts`, "-frames:v", String(part.length), "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-y", `${dir}/${bg}.raw`]);
      raw[bg] = await readFile(`${dir}/${bg}.raw`); await rm(`${dir}/${bg}.raw`);
    }
    for (let k = 0; k < part.length; k++) {
      const B = raw.black.subarray(k * FS, (k + 1) * FS), Wt = raw.white.subarray(k * FS, (k + 1) * FS);
      const img = new ImageData(W, H), d = img.data;
      for (let p = 0, q = 0; q < FS; p += 4, q += 3) {
        const a = 255 - ((Wt[q] - B[q]) + (Wt[q + 1] - B[q + 1]) + (Wt[q + 2] - B[q + 2])) / 3;
        if (a <= 0.5) continue;
        d[p] = B[q] * 255 / a; d[p + 1] = B[q + 1] * 255 / a; d[p + 2] = B[q + 2] * 255 / a; d[p + 3] = a;
      }
      byFrame.set(part[k], await createImageBitmap(img));
    }
  }
  for (const [key, n] of rep) out.set(key, byFrame.get(n));
  return { keyOf, bitmaps: out, frames: frames.length };
}

/** 그림 속 글자가 닿은 가장 아래 줄 (투명이 아닌 칸, 1080x1920 기준 px) */
export function lowestInk(bitmaps) {
  const W = 1080, H = 1920, c = new OffscreenCanvas(W, H), g = c.getContext("2d", { willReadFrequently: true });
  let max = -1;
  for (const b of bitmaps) {
    g.clearRect(0, 0, W, H); g.drawImage(b, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    for (let y = H - 1; y > max; y--) { let hit = false; for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 8) { hit = true; break; } if (hit) { max = y; break; } }
  }
  return max < 0 ? null : max + 1;
}

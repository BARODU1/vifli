// 사이트판 재료 읽기: 휴대폰 영상(mp4·mov)은 브라우저 하드웨어 디코더(WebCodecs)로, 사진은 createImageBitmap 으로.
// 영상 파일 전체를 메모리에 올리지 않고, 목차(moov)만 읽은 뒤 필요한 구간의 바이트만 그때그때 읽음.
// 설치판 analyze.mjs 와 같은 값(0.1초마다 움직임, 0.5초마다 색 진하기)을 만듦.
/* global MP4Box, DataStream */
import { satOf } from "../../engine/score.mjs";

export const PHOTO = /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 맨 위 상자(box)들 위치 찾기: ftyp·moov 만 읽으려고 */
async function topBoxes(file) {
  const out = [];
  let off = 0;
  while (off + 8 <= file.size && out.length < 64) {
    const h = new DataView(await file.slice(off, off + 16).arrayBuffer());
    let size = h.getUint32(0); const type = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
    if (size === 1) size = Number(h.getBigUint64(8)); else if (size === 0) size = file.size - off;
    if (size < 8) break;
    out.push({ type, off, size }); off += size;
  }
  return out;
}

/** 영상 열기: 목차만 읽어 트랙·샘플 표를 얻음 */
export async function openVideo(file) {
  const boxes = await topBoxes(file);
  const moov = boxes.find(b => b.type === "moov");
  if (!moov) throw new Error("영상 목차를 찾지 못했어요. 휴대폰에서 다시 옮겨 보세요.");
  const mp4 = MP4Box.createFile(false);
  let info = null, err = null;
  mp4.onReady = i => { info = i; };
  mp4.onError = e => { err = e; };
  // 목차 앞뒤의 다른 상자(mdat 등)는 머리 16바이트만 줘서 건너뛰게 함
  for (const b of boxes) {
    const whole = b.type === "moov" || (b.type !== "mdat" && b.size < 32e6);
    const buf = await file.slice(b.off, b.off + (whole ? b.size : 16)).arrayBuffer();
    buf.fileStart = b.off;
    mp4.appendBuffer(buf);
  }
  mp4.flush();
  if (!info) throw new Error("영상을 읽지 못했어요" + (err ? ": " + err : "."));
  const vt = info.videoTracks[0];
  if (!vt) throw new Error("영상 트랙이 없어요.");
  const trak = mp4.getTrackById(vt.id);
  const entry = trak.mdia.minf.stbl.stsd.entries[0];
  const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
  let description;
  if (box) { const ds = new DataStream(undefined, 0, DataStream.BIG_ENDIAN); box.write(ds); description = new Uint8Array(ds.buffer, 8); }
  const ts = trak.mdia.mdhd.timescale;
  const samples = trak.samples.map(s => ({ off: s.offset, size: s.size, cts: s.cts / ts, dur: s.duration / ts, sync: s.is_sync }));
  const t0 = Math.min(...samples.map(s => s.cts));
  for (const s of samples) s.t = s.cts - t0;
  // 회전: 휴대폰 세로 영상은 가로로 저장되고 회전 정보만 붙음 → 보이는 방향으로 돌려 그림
  const m = vt.matrix || [65536, 0, 0, 0, 65536, 0, 0, 0, 0x40000000];
  const rot = ((Math.round(Math.atan2(m[1], m[0]) * 180 / Math.PI) % 360) + 360) % 360;
  const cw = vt.track_width || vt.video?.width, ch = vt.track_height || vt.video?.height;
  const turned = rot === 90 || rot === 270;
  const config = { codec: vt.codec, codedWidth: vt.video?.width || cw, codedHeight: vt.video?.height || ch, description };
  const sup = await VideoDecoder.isConfigSupported(config).catch(() => ({ supported: false }));
  if (!sup.supported) throw new Error(`이 브라우저는 이 영상 형식(${vt.codec.split(".")[0]})을 못 읽어요. 크롬·사파리 최신판으로 해 보세요.`);
  const duration = info.duration / info.timescale;
  return { file, kind: "video", config, samples, rot, srcW: config.codedWidth, srcH: config.codedHeight,
    width: turned ? config.codedHeight : config.codedWidth, height: turned ? config.codedWidth : config.codedHeight,
    duration, hasAudio: info.audioTracks.length > 0 };
}

/** 회전된 영상 프레임을 바로 선 그림으로 (회전 없으면 그대로) */
export function makeUpright(v) {
  if (!v.rot) return f => f;
  const c = new OffscreenCanvas(v.width, v.height), g = c.getContext("2d");
  return f => {
    g.save(); g.translate(v.width / 2, v.height / 2); g.rotate(v.rot * Math.PI / 180);
    g.drawImage(f, -v.srcW / 2, -v.srcH / 2, v.srcW, v.srcH); g.restore();
    return c;
  };
}

/**
 * targets(초, 오름차순)마다 그 시각에 화면에 보일 프레임을 onFrame(src, k) 로 넘김 (ffmpeg fps 필터처럼 반 프레임 반올림).
 * 영상이 targets 보다 짧으면 마지막 프레임을 계속 줌(tpad 처럼). onFrame 안에서 바로 그려야 함(프레임은 곧 닫힘).
 */
export async function decodeAt(v, targets, onFrame, { half = 0.5 / 30, tooBusy } = {}) {
  if (!targets.length) return;
  const up = makeUpright(v);
  const S = v.samples, tFirst = targets[0], tLast = targets[targets.length - 1];
  // 시작: tFirst 앞의 마지막 키프레임(디코드 순서), 끝: tLast + 1초까지 (B프레임 순서 바뀜 여유)
  let i0 = 0;
  for (let i = 0; i < S.length; i++) if (S[i].sync && S[i].t <= tFirst + half) i0 = i;
  let i1 = S.length - 1;
  for (let i = i0; i < S.length; i++) if (S[i].t > tLast + 1) { i1 = i; break; }
  let prev = null, k = 0, error = null;
  const dec = new VideoDecoder({
    // 프레임은 보이는 순서로 나옴. 이 프레임이 target 보다 늦으면 → 그 target 은 바로 앞 프레임(없으면 이 프레임)
    output: f => {
      try { const t = f.timestamp / 1e6; while (k < targets.length && targets[k] + half < t) onFrame(up(prev || f), k++); }
      catch (e) { error = e; }
      prev?.close(); prev = f;
    },
    error: e => { error = e; },
  });
  dec.configure({ ...v.config, hardwareAcceleration: "no-preference" });
  // 바이트를 한 번에 크게(최대 16MB) 읽어서 잘라 씀
  let i = i0;
  while (i <= i1 && !error) {
    let j = i, end = S[i].off + S[i].size;
    while (j + 1 <= i1 && S[j + 1].off + S[j + 1].size - S[i].off < 16e6 && S[j + 1].off >= S[i].off) { j++; end = Math.max(end, S[j].off + S[j].size); }
    const buf = new Uint8Array(await v.file.slice(S[i].off, end).arrayBuffer());
    for (let n = i; n <= j; n++) {
      const s = S[n];
      dec.decode(new EncodedVideoChunk({ type: s.sync ? "key" : "delta", timestamp: Math.round(s.t * 1e6), duration: Math.round(s.dur * 1e6), data: buf.subarray(s.off - S[i].off, s.off - S[i].off + s.size) }));
      while ((dec.decodeQueueSize > 12 || tooBusy?.()) && !error) await sleep(2);
      if (k >= targets.length) break;
    }
    if (k >= targets.length) break;
    i = j + 1;
  }
  if (!error) await dec.flush().catch(e => { error = e; });
  if (prev) { while (k < targets.length) onFrame(up(prev), k++); prev.close(); }
  if (dec.state !== "closed") dec.close();
  if (error) throw new Error("영상을 푸는 중 문제가 생겼어요: " + (error.message || error));
}

/** 사진 열기 (휴대폰 사진의 회전 정보 반영) */
export async function openPhoto(file) {
  let img;
  try { img = await createImageBitmap(file, { imageOrientation: "from-image", colorSpaceConversion: "none" }); }
  catch { throw new Error(/\.hei[cf]$/i.test(file.name) ? "이 브라우저는 HEIC 사진을 못 읽어요. 사파리를 쓰거나 jpg로 바꿔 넣어 주세요." : "사진을 열 수 없어요."); }
  return { file, kind: "photo", img, width: img.width, height: img.height, duration: 0, hasAudio: false };
}

export async function openMedia(file) {
  if (PHOTO.test(file.name) || file.type.startsWith("image/")) return openPhoto(file);
  return openVideo(file);
}

/** 설치판 analyzeClip 과 같은 값: 0.1초마다 움직임(32x56 밝기 차이), 0.5초마다 색 진하기 */
export async function analyze(m, id) {
  const info = { file: id, name: m.file.name, kind: m.kind, duration: m.kind === "photo" ? 0 : m.duration, width: m.width, height: m.height,
    landscape: m.width > m.height, hasAudio: m.hasAudio, motion: [], color: [] };
  // ffmpeg 의 축소(scale)는 넓은 범위를 고르게 섞음 → 10배 큰 그림에 그린 뒤 10x10 칸씩 평균 내서 맞춤
  const CW = 32, CH = 56, B = 10, c = new OffscreenCanvas(CW * B, CH * B), g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingQuality = "high";
  const grab = src => {
    g.drawImage(src, 0, 0, CW * B, CH * B);
    const big = g.getImageData(0, 0, CW * B, CH * B).data, d = new Uint8ClampedArray(CW * CH * 4);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      let r = 0, gg = 0, b = 0;
      for (let yy = 0; yy < B; yy++) { let k = ((y * B + yy) * CW * B + x * B) * 4; for (let xx = 0; xx < B; xx++, k += 4) { r += big[k]; gg += big[k + 1]; b += big[k + 2]; } }
      const o = (y * CW + x) * 4; d[o] = r / (B * B); d[o + 1] = gg / (B * B); d[o + 2] = b / (B * B); d[o + 3] = 255;
    }
    return d;
  };
  if (m.kind === "photo") { info.color = [{ t: 0, v: satOf(grab(m.img), 0, CW * CH * 4, 4) }]; return info; }
  const n = Math.round(m.duration * 10), targets = Array.from({ length: n }, (_, i) => i / 10);
  const lum = (d, k) => 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
  let last = null;
  await decodeAt(m, targets, (src, i) => {
    const d = grab(src);
    if (last) { let s = 0; for (let k = 0; k < d.length; k += 4) s += Math.abs(lum(d, k) - lum(last, k)); info.motion.push({ t: i / 10, v: s / (CW * CH) }); }
    if (i % 5 === 0) info.color.push({ t: i / 10, v: satOf(d, 0, d.length, 4) });
    last = d;
  }, { half: 0.05 });
  return info;
}

/** 목록에 보일 작은 그림 (가운데 장면) */
export async function thumbOf(m) {
  const c = new OffscreenCanvas(90, 160), g = c.getContext("2d");
  const draw = src => { const s = Math.max(90 / m.width, 160 / m.height); g.drawImage(src, (90 - m.width * s) / 2, (160 - m.height * s) / 2, m.width * s, m.height * s); };
  if (m.kind === "photo") draw(m.img);
  else await decodeAt(m, [Math.min(1, m.duration / 2)], src => draw(src));
  return URL.createObjectURL(await c.convertToBlob({ type: "image/jpeg", quality: 0.8 }));
}

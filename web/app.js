// 사이트판 화면 — 설치판 ui/index.html 과 같은 칸·같은 말. 서버 없이 이 기기 안에서 만들기.
import { openMedia, analyze, thumbOf } from "./lib/media.js";
import { makeVideo, KINDS, prepare } from "./lib/make.js";
import { FONTS } from "../engine/fonts.mjs";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// 이 브라우저로 되는지 먼저 확인 (영상 풀기·굽기 기능)
const lacks = [!("VideoDecoder" in window) && "영상 풀기(VideoDecoder)", !("VideoEncoder" in window) && "영상 굽기(VideoEncoder)", !("OffscreenCanvas" in window) && "그림판(OffscreenCanvas)"].filter(Boolean);
if (lacks.length) {
  $("stop").style.display = "block";
  $("stop").innerHTML = `이 브라우저로는 영상을 만들 수 없어요 (없는 기능: ${lacks.join(", ")}).<br>컴퓨터는 <b>크롬·엣지 최신판</b>, 맥·아이패드는 <b>사파리 17 이상</b>으로 열어 주세요.`;
  $("app").style.opacity = .4; $("app").style.pointerEvents = "none";
}

const clips = []; // {file, name, m, a, thumb, hero, fit, caption, role, loading, error}
let KIND = "food", chosen = ["auto"], bgm = null;
const KIND_UI = {
  food: { title: "가게 정보", name: ["가게 이름 *", "예) 대정양곱창"], menu: ["대표 메뉴", "예) 소금구이"], price: ["가격", "예) 소 40,000원"], loc: ["위치 한 줄", "예) 자갈치역 3번 출구 320m"], hook: ["한마디 (첫 화면)", "예) 지인이 데려간 찐맛집"], area: ["지역", "예) 부산 남포동"],
    outro: ["끝 문구 (마지막 화면 · 비우면 안 나와요)", "예) [저장]해두고 가봐"], lines: "예) 사장님이 직접 구워 주심\n예) 2층 단체석 있음", em: "지인이 데려간 [찐맛집]",
    hint: "위에서부터 순서대로 들어가요. <b>★ 첫 장면</b>을 고르면 그 영상이 0초에 나와요(안 고르면 자동). 가로 영상은 넣는 방법을 고를 수 있어요.", menuCap: "메뉴", nameCap: "가게 이름" },
  studio: { title: "사진관 정보", name: ["사진관 이름 *", "예) 너를봄 사진관"], menu: ["촬영 종류", "예) 가족사진"], price: ["가격", "예) 가족 4인 기본 000,000원"], loc: ["위치 한 줄", "예) ○○역 2번 출구 앞"], hook: ["한마디 (첫 화면)", "예) 우리 가족 첫 가족사진"], area: ["지역", "예) 대구"],
    outro: ["끝 문구 (마지막 화면 · 비우면 안 나와요)", "예) [저장]해두고 예약하기"], lines: "예) 촬영 후 바로 사진 고르기\n예) 원본 전체 제공", em: "우리 가족 [첫 가족사진]",
    hint: "위에서부터 순서대로 들어가요. 완성 사진은 <b>'결과 사진'</b>으로 표시해 주세요 — 끝에 얼굴이 잘리지 않게 액자로 나와요. <b>★</b>를 고른 영상은 '원테이크 공개'에 쓰여요. 공간 사진의 파일 이름(예: 대기실.jpg)은 '공간 투어'에서 이름표가 돼요.", menuCap: "촬영 종류", nameCap: "사진관 이름" },
};
const FIELDS = ["area", "name", "menu", "price", "loc", "hook", "outro"];
const ACCENT_UI = { yellow: ["노란색", "#d4a800"], red: ["빨간색", "#e0301e"], white: ["흰색", "#666"] };
function drawEmHint() {
  const [nm, col] = ACCENT_UI[$("accent").value] || ACCENT_UI.yellow;
  const ex = esc(KIND_UI[KIND].em).replace(/\[([^\]]+)\]/, `[<b style="color:${col}">$1</b>]`);
  $("emHint").innerHTML = `[대괄호]로 감싼 글자는 ${nm}으로, 1.15배 크게 강조돼요. 예) ${ex}`;
}
$("accent").onchange = drawEmHint;
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

function setKind(k) {
  KIND = k; const U = KIND_UI[k];
  document.querySelectorAll(".tab[data-kind]").forEach(t => t.classList.toggle("on", t.dataset.kind === k));
  $("infoTitle").textContent = U.title; $("clipHint").innerHTML = U.hint;
  FIELDS.forEach(f => { $("l_" + f).textContent = U[f][0]; $("i_" + f).placeholder = U[f][1]; $("i_" + f).value = ""; });
  try { const s = JSON.parse(store.get("vifli.info." + k) || "{}"); FIELDS.forEach(f => { if (s[f]) $("i_" + f).value = s[f]; }); } catch {}
  $("i_lines").placeholder = U.lines; drawEmHint();
  chosen = ["auto"]; drawChosen(); drawClips(); clearResults();
  // 다른 탭 곡이 골라져 있으면 뺌 (맛집에 가족사진 곡이 남지 않게)
  if (bgm && !bgm.mine && !(bgm.tabs || []).includes(k)) $("bgmClear").click();
}
/** 결과 칸 비우기 (탭을 바꾸면 이전 영상·검사·썸네일·받기 버튼을 지움) */
function clearResults() {
  results = []; logText = "";
  $("player").innerHTML = `<div class="empty">만든 영상이 여기에 나와요</div>`;
  for (const id of ["check", "thumbs", "dl"]) $(id).innerHTML = "";
  $("status").textContent = ""; $("bar").style.width = "0%"; $("log").textContent = "";
}
document.querySelectorAll(".tab[data-kind]").forEach(t => t.onclick = () => { if (KIND !== t.dataset.kind) setKind(t.dataset.kind); });

// 템플릿: '자동' + 템플릿마다 실제 장면 3장(맛집만 — 사진관 미리보기는 손님 얼굴이라 넣지 않음)
const AUTO = { id: "auto", name: "자동", desc: "영상·정보를 보고 알아서 골라요. 다시 누르면 다른 걸 골라요." };
const tplList = () => [AUTO, ...Object.values(KINDS[KIND].templates).map(t => ({ id: t.id, name: t.name, desc: t.desc || "",
  previews: KIND === "food" ? [1, 2, 3].map(n => `../assets/previews/food/${t.id}_${n}.jpg`) : [] }))];
const tplOf = id => tplList().find(t => t.id === id) || AUTO;
function drawChosen() {
  $("chosen").innerHTML = chosen.map(id => { const t = tplOf(id); return `<div class="chip">${t.previews?.[0] ? `<img src="${t.previews[0]}" onerror="this.remove()">` : '<span style="font-size:26px">✨</span>'}<span>${esc(t.name)}<br><span class="hint" style="font-weight:400">${esc(t.desc)}</span></span></div>`; }).join("");
}
function drawPicker() {
  const multi = $("multi").checked;
  $("pickHint").textContent = multi ? `— 여러 개 고를 수 있어요 (${chosen.length}개 고름)` : "— 하나를 눌러 고르세요";
  $("pgrid").innerHTML = tplList().map(t => `<div class="pcard ${chosen.includes(t.id) ? "on" : ""}" data-id="${t.id}">
    ${t.id === "auto" ? `<div class="auto">자동</div>` : t.previews.length ? `<div class="imgs">${t.previews.map(u => `<img src="${u}" loading="lazy" onerror="this.style.visibility='hidden'">`).join("")}</div>` : ""}
    <b>${esc(t.name)}</b><div class="hint">${esc(t.desc)}</div></div>`).join("");
}
$("openPicker").onclick = () => { drawPicker(); $("picker").classList.add("on"); };
$("pickDone").onclick = () => { $("picker").classList.remove("on"); drawChosen(); };
$("pgrid").onclick = e => {
  const c = e.target.closest(".pcard"); if (!c) return;
  const id = c.dataset.id;
  if ($("multi").checked) { chosen = chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id]; if (!chosen.length) chosen = [id]; drawPicker(); }
  else { chosen = [id]; $("picker").classList.remove("on"); drawChosen(); }
};
$("multi").onchange = () => { if (!$("multi").checked) chosen = chosen.slice(0, 1); drawChosen(); };
// 글씨 스타일·강조색은 이 브라우저에 기억
for (const id of ["textStyle", "accent"]) { const v = store.get("vifli." + id); if (v && [...$(id).options].some(o => o.value === v)) $(id).value = v; $(id).addEventListener("change", () => store.set("vifli." + id, $(id).value)); }
$("font").innerHTML = `<option value="template">템플릿대로</option>` + Object.entries(FONTS).map(([id, f]) => `<option value="${id}">${f.label}</option>`).join("");

// 재료 넣기: 넣자마자 이 기기 안에서 살펴봄(하나씩 차례로)
let queue = Promise.resolve();
function addFiles(list) {
  for (const file of list) {
    if (!/^(video|image)\//.test(file.type) && !/\.(mp4|mov|m4v|jpe?g|png|webp|heic|heif)$/i.test(file.name)) continue;
    if (clips.some(c => c.file.name === file.name && c.file.size === file.size)) continue;
    const c = { file, name: file.name, loading: true, fit: "auto", caption: "auto", role: "space" };
    clips.push(c); drawClips();
    queue = queue.then(async () => {
      try { c.m = await openMedia(file); c.thumb = await thumbOf(c.m); drawClips(); c.a = await analyze(c.m, file.name); }
      catch (e) { c.error = e.message; }
      c.loading = false; drawClips();
    });
  }
}
$("pick").onclick = () => $("files").click();
$("files").onchange = () => { addFiles([...$("files").files]); $("files").value = ""; };
const drop = $("drop");
drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); addFiles([...e.dataTransfer.files]); };

function drawClips() {
  // 파일 읽는 진행: "3개 중 2개 읽음"
  const done = clips.filter(c => !c.loading).length;
  $("readProg").innerHTML = clips.length && done < clips.length ? `⏳ 파일 읽는 중 — <b>${clips.length}개 중 ${done}개 읽음</b>` : clips.length ? `✓ ${clips.length}개 모두 읽음` : "";
  $("clips").innerHTML = clips.map((c, i) => `<div class="clip">
    ${c.thumb ? `<img src="${c.thumb}">` : `<img>`}
    <div><div class="nm">${i + 1}. ${esc(c.name)}</div>
      <div class="meta">${c.error ? "⚠ " + esc(c.error) : !c.m ? "여는 중…" : (c.m.kind === "photo" ? "사진" : `영상 ${c.m.duration.toFixed(1)}초`) + (c.m.width > c.m.height ? '<span class="badge">가로</span>' : '<span class="badge">세로</span>') + (c.loading ? " · 살펴보는 중…" : "")}</div>
      ${c.m ? `<div class="row">
        ${c.m.kind === "video" ? `<span class="star ${c.hero ? "on" : ""}" data-hero="${i}">★ 첫 장면</span>` : ""}
        ${KIND === "studio" ? `<label style="margin:0">${c.m.kind === "video" ? "이 장면은" : "이 사진은"} <select data-role="${i}">${[["space", "공간·촬영 현장"], ["result", "결과 사진"], ["before", "보정 전"], ["after", "보정 후"]].map(([v, l]) => `<option value="${v}" ${c.role === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
        <label style="margin:0">이 장면 글자 <select data-cap="${i}">
          ${[["auto", "자동"], ["none", "글자 없음"], ["name", KIND_UI[KIND].nameCap], ["menu", KIND_UI[KIND].menuCap], ["price", "가격"], ["loc", "위치"], ["hook", "한마디"]].map(([v, l]) => `<option value="${v}" ${c.caption === v ? "selected" : ""}>${l}</option>`).join("")}
        </select></label>
        ${c.m.width > c.m.height ? `<label style="margin:0">가로 넣기 <select data-fit="${i}">
          <option value="auto" ${c.fit === "auto" ? "selected" : ""}>템플릿대로</option>
          <option value="fill" ${c.fit === "fill" ? "selected" : ""}>잘라서 채우기</option>
          <option value="band" ${c.fit === "band" ? "selected" : ""}>가로 그대로 + 위아래 바탕</option></select></label>` : ""}
      </div>` : ""}</div>
    <div class="ctl"><button data-mv="${i}" data-d="-1" title="위로">▲</button><button data-mv="${i}" data-d="1" title="아래로">▼</button><button data-del="${i}" title="빼기">✕</button></div>
  </div>`).join("");
}
$("clips").onclick = e => {
  const t = e.target;
  if (t.dataset.hero != null) { const i = +t.dataset.hero, on = !clips[i].hero; clips.forEach(c => c.hero = false); clips[i].hero = on; }
  else if (t.dataset.mv != null) { const i = +t.dataset.mv, j = i + +t.dataset.d; if (j < 0 || j >= clips.length) return; [clips[i], clips[j]] = [clips[j], clips[i]]; }
  else if (t.dataset.del != null) clips.splice(+t.dataset.del, 1);
  else return;
  drawClips();
};
$("clips").onchange = e => {
  const d = e.target.dataset;
  if (d.fit != null) clips[+d.fit].fit = e.target.value;
  if (d.cap != null) clips[+d.cap].caption = e.target.value;
  if (d.role != null) clips[+d.role].role = e.target.value;
};
$("i_vol").oninput = () => $("volv").textContent = $("i_vol").value + "%";

// 배경음악: 사이트에 있는 곡(바로두 음원·출처 표시 곡) + 내 음악 파일
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const secOf = v => { const m = /^(\d+):(\d{1,2})$/.exec(String(v).trim()); return m ? +m[1] * 60 + +m[2] : Math.max(0, +v || 0); };
const player = new Audio();
let TRACKS = null;
async function loadTracks() {
  if (TRACKS) return TRACKS;
  try { TRACKS = (await (await fetch("./music.json")).json()).map(t => ({ ...t, url: "../music/" + t.file.split("/").map(encodeURIComponent).join("/") })); }
  catch { TRACKS = []; }
  return TRACKS;
}
// 곡 목록은 탭별로(맛집에 가족사진 곡 안 나오게) + 분위기 태그로 거르기
const MOODS = ["전체", "신나는", "잔잔한", "감성"];
let mood = "전체";
async function drawMusic() {
  const tabTracks = (await loadTracks()).filter(t => (t.tabs || ["food", "studio"]).includes(KIND));
  $("moods").innerHTML = MOODS.map(m => `<button class="btn ${m === mood ? "" : "light"}" data-mood="${m}" style="padding:5px 12px;font-size:14px">${m}${m === "전체" ? "" : ` (${tabTracks.filter(t => t.mood === m).length})`}</button>`).join("");
  const list = [...(bgm?.mine ? [bgm] : []), ...tabTracks.filter(t => mood === "전체" || t.mood === mood)];
  $("mlist").innerHTML = list.length ? list.map(t => `<div class="mrow ${bgm?.id === t.id ? "on" : ""}">
    <button class="play" data-play="${t.id}">${player.dataset.id === t.id && !player.paused ? "❚❚" : "▶"}</button>
    <div><div class="t">${esc(t.title)} ${t.mood ? `<span class="mbadge">${esc(t.mood)}</span>` : ""} ${t.mine ? '<span class="mbadge own">내 파일</span>' : t.own ? '<span class="mbadge own">바로두 음원</span>' : t.attribution ? '<span class="mbadge need">출처 표시 필요</span>' : '<span class="mbadge free">출처 표시 없어도 됨</span>'}</div>
      <div class="s">${[t.duration ? mmss(t.duration) : "", t.composer, t.license].filter(Boolean).map(esc).join(" · ")} ${t.page ? `· <a href="${t.page}" target="_blank" rel="noopener">곡 페이지</a>` : ""}</div></div>
    <button class="btn" data-use="${t.id}">${bgm?.id === t.id ? "✓ 고름" : "고르기"}</button></div>`).join("") : `<div class="empty" style="padding:30px">${mood === "전체" ? "이 탭에 맞는 곡이 사이트에 없어요." : `'${esc(mood)}' 곡이 없어요.`} '내 음악 파일 넣기'를 눌러 주세요.</div>`;
}
$("moods").onclick = e => { const m = e.target.dataset.mood; if (m) { mood = m; drawMusic(); } };
const findTrack = id => bgm?.id === id ? bgm : TRACKS.find(t => t.id === id);
$("bgmPick").onclick = async () => { await drawMusic(); $("musicBox").classList.add("on"); };
$("musicClose").onclick = () => { player.pause(); $("musicBox").classList.remove("on"); };
$("mlist").onclick = async e => {
  const d = e.target.dataset;
  if (d.play) {
    const t = findTrack(d.play);
    if (player.dataset.id === t.id && !player.paused) player.pause();
    else { if (player.dataset.id !== t.id) { player.src = t.url; player.dataset.id = t.id; } player.play(); }
    player.onpause = player.onplay = drawMusic; drawMusic();
  } else if (d.use) useTrack(findTrack(d.use));
};
function useTrack(t) {
  bgm = t;
  $("bgmName").textContent = `${t.title}${t.duration ? ` (${mmss(t.duration)})` : ""}`; $("bgmClear").style.display = "inline";
  $("bgmSet").style.display = "block"; $("bgmStart").value = "0:00";
  $("bgmCreditBox").style.display = t.attribution ? "block" : "none";
  player.pause(); $("musicBox").classList.remove("on");
}
$("ownMusicBtn").onclick = () => $("ownMusic").click();
$("ownMusic").onchange = () => {
  const f = $("ownMusic").files[0]; if (!f) return;
  const a = new Audio(URL.createObjectURL(f));
  const t = { id: "mine:" + f.name, title: f.name.replace(/\.\w+$/, ""), file: f, url: a.src, mine: true, own: true, source: "사용자가 넣은 음악 파일", license: "사용자가 직접 확인한 상업용 음원" };
  a.onloadedmetadata = () => { t.duration = a.duration; if (bgm === t) useTrack(t); };
  useTrack(t); $("ownMusic").value = "";
};
$("bgmClear").onclick = e => { e.preventDefault(); bgm = null; $("bgmName").textContent = "없음"; $("bgmClear").style.display = "none"; $("bgmSet").style.display = "none"; player.pause(); };
$("bgmVol").oninput = () => { $("bgmVolV").textContent = $("bgmVol").value + "%"; };
$("bgmTry").onclick = () => {
  if (!bgm) return;
  if (player.dataset.id === bgm.id && !player.paused) { player.pause(); $("bgmTry").textContent = "▶ 여기부터 듣기"; return; }
  if (player.dataset.id !== bgm.id) { player.src = bgm.url; player.dataset.id = bgm.id; }
  player.currentTime = secOf($("bgmStart").value); player.play(); $("bgmTry").textContent = "❚❚ 멈춤";
};
$("bgmCredit").onclick = async () => { await navigator.clipboard.writeText(bgm.credit || ""); $("bgmCredit").textContent = "✓ 복사됨"; setTimeout(() => $("bgmCredit").textContent = "📋 출처 문구 복사", 1500); };

// 만들기
let logText = "", busy = false;
const st = $("status");
function log(m, r) {
  if (r != null) $("bar").style.width = Math.round(r * 100) + "%";
  st.style.color = ""; st.textContent = m;
  const line = `[${new Date().toLocaleTimeString()}] ${m}`; logText += line + "\n"; $("log").textContent += line + "\n"; $("log").scrollTop = 1e9;
}
function save(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); }
let results = [];
function show(r) {
  $("player").innerHTML = `<video src="${URL.createObjectURL(r.video)}" controls autoplay playsinline></video>`;
  const c = r.check;
  $("check").innerHTML = `길이 <b>${c.duration}초</b> · 컷 <b>${c.plannedShots}개</b> · 소리 <b>${c.lufs} LUFS</b> ${c.lufsOk ? '<span class="ok">✓</span>' : '<span class="bad">확인 필요</span>'}<br>
    자막 가장 아래 ${c.textBottomPx ?? "-"}px / 금지선 ${c.bottomFifthFrom}px ${c.bottomFifthOk ? '<span class="ok">✓ 아래 1/5 비움</span>' : '<span class="bad">침범!</span>'}<br>
    자막 가장 위 ${c.textTopPx ?? "-"}px / 금지선 ${c.topFrom}px ${c.topOk ? '<span class="ok">✓ 위 15% 비움</span>' : '<span class="bad">침범!</span>'}<br>
    글자 크기 ${c.captionMinPx == null ? "장면 자막 없음" : `장면 자막 가장 작은 것 ${c.captionMinPx}px`} ${c.captionSizeOk ? '<span class="ok">✓ OK</span>' : `<span class="bad">작음 (${c.captionWarnBelow}px 미만)</span>`}${c.firstTitle ? ` · 첫 화면 제목 ${c.firstTitle.sizePx}px, 0~${c.firstTitle.end}초${c.firstTitle.sizePx < 120 ? ' <span class="hint">(한마디가 길어 줄였어요 — 한 줄 10자 안쪽으로 쓰면 120px 넘게 나와요)</span>' : ""}` : ""}<br>
    원본 파일 <span class="ok">✓ 그대로</span> <span class="hint">(읽기만 함)</span>` +
    (results.length > 1 ? `<div class="results"><b>만든 영상 ${results.length}개</b> (눌러서 보기)` + results.map((x, k) => `<a href="#" data-k="${k}">▶ ${esc(x.name)} — ${x.check.duration}초 · ${x.check.lufs} LUFS ${x.check.bottomFifthOk && x.check.topOk && x.check.captionSizeOk ? "✓" : "⚠"}</a>`).join("") + "</div>" : "");
  $("thumbs").innerHTML = r.thumbs.map(t => `<img src="${URL.createObjectURL(t.blob)}" title="${esc(t.name)}">`).join("");
  $("dl").innerHTML = `<button class="btn" data-dl="video">⬇ 영상 받기</button><button class="btn light" data-dl="thumbs">⬇ 썸네일 3장</button><button class="btn light" data-dl="cap">⬇ 장면 6장</button><button class="btn light" data-dl="credit">⬇ 출처 기록</button>`;
  $("dl").onclick = e => {
    const k = e.target.dataset.dl; if (!k) return;
    if (k === "video") save(r.name + ".mp4", r.video);
    if (k === "thumbs") r.thumbs.forEach((t, i) => setTimeout(() => save(t.name, t.blob), i * 400));
    if (k === "cap") save(r.captures.name, r.captures.blob);
    if (k === "credit") save(r.credits.name, new Blob([r.credits.text], { type: "text/plain;charset=utf-8" }));
  };
}
$("check").onclick = e => { const a = e.target.closest("a[data-k]"); if (!a) return; e.preventDefault(); show(results[+a.dataset.k]); };

$("make").onclick = async () => {
  if (busy) return;
  st.style.color = "";
  try {
    const info = Object.fromEntries(FIELDS.map(k => [k, $("i_" + k).value.trim()]));
    store.set("vifli.info." + KIND, JSON.stringify(info));
    if (!clips.length) throw new Error("1번 칸에 찍은 영상이나 사진을 넣어 주세요.");
    if (clips.some(c => c.loading)) throw new Error("재료를 아직 살펴보는 중이에요. 잠깐만 기다려 주세요.");
    if (!info.name) throw new Error(`3번 칸에 ${KIND_UI[KIND].nameCap}을 넣어 주세요.`);
    info.lines = $("i_lines").value;
    const use = clips.filter(c => !c.error && c.a);
    if (!use.length) throw new Error("열 수 있는 영상·사진이 없어요.");
    busy = true; $("make").disabled = true; logText = ""; $("log").textContent = ""; $("check").innerHTML = ""; $("thumbs").innerHTML = ""; $("dl").innerHTML = ""; results = [];
    // 내 파일은 그대로, 사이트에 있는 곡은 받아서 (bgm.file 이 사이트 곡에서는 경로 글자라서 구분)
    const bgmJob = bgm ? { file: bgm.mine ? bgm.file : await (await fetch(bgm.url)).blob(), name: bgm.mine ? bgm.file.name : bgm.file.split("/").pop(), volume: +$("bgmVol").value / 100,
      start: secOf($("bgmStart").value), fade: Math.max(0, +$("bgmFade").value || 0), source: bgm.source + (bgm.license && bgm.license !== bgm.source ? ` (${bgm.license})` : "") + (bgm.page ? " " + bgm.page : ""), credit: bgm.attribution ? bgm.credit : "" } : null;
    for (let i = 0; i < chosen.length; i++) {
      const tname = tplOf(chosen[i]).name, pre = chosen.length > 1 ? `[${i + 1}/${chosen.length} ${tname}] ` : "";
      const r = await makeVideo({ kind: KIND, clips: use.map(c => ({ m: c.m, a: c.a, hero: c.hero, fit: c.fit, caption: c.caption, role: c.role })),
        info, template: chosen[i], font: $("font").value, textStyle: $("textStyle").value, accent: $("accent").value, origVolume: +$("i_vol").value / 100, bgm: bgmJob },
        (m, p) => log(pre + m, (i + (p ?? 0)) / chosen.length));
      results.push(r); show(r);
    }
    const r = results[results.length - 1];
    st.textContent = `완성! ${r.name}.mp4 · ${r.seconds}초 걸림 — '영상 받기'를 눌러 저장하세요`;
  } catch (e) { st.textContent = "⚠ " + e.message.split("\n")[0]; st.style.color = "var(--warn)"; if (busy) log("오류: " + e.message); console.error(e); }
  busy = false; $("make").disabled = false;
};
$("copyLog").onclick = async () => { await navigator.clipboard.writeText(logText || "(기록 없음)"); $("copyLog").textContent = "✓ 복사됨"; setTimeout(() => $("copyLog").textContent = "📋 기록 복사", 1500); };

setKind("food");
// 부품(ffmpeg·글꼴)을 미리 받아 둠 — 처음 만들기를 빠르게
if (!lacks.length) setTimeout(() => prepare().catch(() => {}), 500);

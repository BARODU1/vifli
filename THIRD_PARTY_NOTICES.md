# 비플리(VIFLI) — 함께 들어 있는 다른 부품과 라이선스

비플리 자체 코드는 바로두(BARODU)가 만든 것입니다. 아래 부품은 각자의 라이선스를 따릅니다.
비플리는 아래 실행 파일들을 **따로 실행(명령으로 불러 씀)**만 하며, 그 코드를 고치거나 비플리 코드와 합치지 않습니다.

## FFmpeg (영상·소리 처리) — GPL v3
- 파일: `tools/ffmpeg/ffmpeg.exe` (FFmpeg 6.1.1, gyan.dev "essentials" 빌드, `--enable-gpl --enable-version3`, libx264·libass 등 포함)
- 파일: `tools/ffmpeg/ffprobe.exe` (FFmpeg 4.0.2, ffprobe-static 패키지)
- 라이선스 전문: `tools/ffmpeg/ffmpeg.LICENSE.txt` (GNU GPL v3)
- 소스 코드: https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz , https://ffmpeg.org/releases/ffmpeg-4.0.2.tar.xz
  - 빌드 방법(6.1.1): https://www.gyan.dev/ffmpeg/builds/
  - **소스 제공 약속**: 이 프로그램을 받은 분이 요청하면, 받은 날로부터 3년 동안 위 FFmpeg 버전의 소스 코드를 배포한 사람(바로두)이 같은 방법으로 제공합니다.
- 바꾼 것 없음(받은 실행 파일 그대로).

## Node.js (프로그램 실행) — MIT 등
- 파일: `tools/node/node.exe` (Node.js v24.21.0, nodejs.org 공식 Windows 64비트 배포본, SHA-256 확인)
- 라이선스: `tools/node/LICENSE`

## 받아쓰기 부품 (설치할 때 각 PC가 직접 받음, 설치 파일에는 없음)
- Python 3.12 내장형 — Python Software Foundation License (python.org)
- faster-whisper (MIT), CTranslate2 (MIT), 그 밖의 파이썬 부품 — `tools/install/requirements.txt` 의 버전, PyPI에서 받음
- 모델 `mobiuslabsgmbh/faster-whisper-large-v3-turbo` (Whisper large-v3-turbo, MIT) — Hugging Face에서 받음

## 글꼴 — SIL Open Font License 1.1
- Pretendard, Black Han Sans, Do Hyeon, Jua, Nanum Myeongjo, Nanum Pen Script, Gugi
- 라이선스 전문: `assets/licenses/`

## 배경음악
- 곡마다 제목·작곡가·출처·곡 페이지·라이선스가 `music/licenses.json`에 있음 (앱의 음악 고르기 창에도 표시)
- Pixabay 곡(Pixabay Content License): 설치 파일에는 **목록만** 있고, 설치할 때 각 PC가 Pixabay에서 직접 받음 (곡 파일을 따로 나눠 주지 않음). Content ID 등록 곡은 넣지 않음.
- Incompetech 곡(CC BY 4.0, Kevin MacLeod): 영상 설명에 출처 표시 필요 — 앱에서 출처 문구 복사 가능
- '내 음원' 곡: 배포한 사람(바로두)이 직접 가진 음원

## 효과음
- pop·whoosh·ding: 비플리가 ffmpeg 소리 합성으로 직접 만든 소리 (외부 음원 아님)
- click(딸깍)·bloop(뾰롱)·sizzle(지글) — 글자 효과음: 2026-11-01 비플리가 ffmpeg 소리 합성으로 직접 만든 소리 (외부 음원 아님, 상업용 사용 가능). 기록: `assets/sfx/출처.txt`

## 스티커
- 손그림 화살표·동그라미·불꽃: 비플리 코드(`web/lib/fx.js`)가 직접 그리는 모양 (외부 그림·이모지 글꼴 아님)

## 사이트판에만 들어가는 부품 (브라우저에서 실행)
- **ffmpeg.wasm** — `@ffmpeg/core` 0.12.10 (FFmpeg 를 브라우저용으로 옮긴 것, `--enable-gpl` 빌드, libx264·libass 등 포함 → **GPL**), `@ffmpeg/ffmpeg` 0.12.15·`@ffmpeg/util` 0.12.2 (MIT)
  - 받은 곳: npm 공식 저장소(registry.npmjs.org), 고치지 않음. 라이선스: `web/vendor/*/LICENSE`
  - 소스 코드: https://github.com/ffmpegwasm/ffmpeg.wasm (태그 v0.12.10) — 위 설치판 FFmpeg 와 같이, 요청하면 3년 동안 배포한 사람(바로두)이 제공
  - 사이트판에서는 자막 그림·소리 섞기·마지막 합치기에만 씀 (영상 그림 굽기는 브라우저 내장 기능 WebCodecs)
- **mp4box.js** 0.5.2 (BSD-3-Clause, GPAC/Telecom ParisTech) — 휴대폰 영상의 목차 읽기. 라이선스: `web/vendor/mp4box/LICENSE`
- 사이트판 배경음악: 바로두 음원 5곡 + Incompetech 1곡(CC BY 4.0, 출처 표시)만 사이트에 올림. **Pixabay 곡은 사이트에 올리지 않음**(곡 파일을 따로 나눠 주는 것이 되므로) — 사용자가 직접 받아 '내 음악 파일 넣기'로 씀.

## 바로두 성우
- `부품/voice/barodu-voice.js`: 바로두가 만든 파일을 고치지 않고 그대로 넣음. 목소리는 사용자 본인의 Gemini API 키로 Google Gemini 를 불러 만듦.
- 바로두 캐릭터 그림은 설치 파일에 들어 있지 않음.

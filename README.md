# content-agent

> **노션에 글만 쓰면, 블로그·썸네일·SNS 배포까지 자동화되는 콘텐츠 운영 시스템**

[![GitHub Stars](https://img.shields.io/github/stars/thisNorm/content-agent?style=flat&label=Stars&color=0d0d0d&labelColor=f5f5f5)](https://github.com/thisNorm/content-agent/stargazers)
[![License](https://img.shields.io/github/license/thisNorm/content-agent?style=flat&color=0d0d0d&labelColor=f5f5f5)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-0d0d0d?style=flat&labelColor=f5f5f5)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-0d0d0d?style=flat&labelColor=f5f5f5)](https://www.typescriptlang.org)

Notion 페이지 하나를 실행하면 — 본문 구조 정리, Gemini 썸네일 생성, Tistory 발행, X(Twitter) 포스팅까지 하나의 파이프라인으로 처리됩니다.

---

## 동작 흐름

```
Notion 페이지
    ↓  fetchPostFromPage()
본문·메타데이터 파싱
    ↓  transformPost()       ← 로컬 규칙 기반 (AI 토큰 없음)
제목 / HTML 구조 / X 초안 / 썸네일 프롬프트 생성
    ↓  createThumbnail()     ← Gemini Image API
1280×720 썸네일 생성 + sharp 합성
    ↓  publishToTistory()    ← Playwright 브라우저 자동화
Tistory 발행 → 발행 URL 확보
    ↓  publishToX()          ← Twitter API v2
X(Twitter) 포스팅
    ↓  appendRunLogToPage()
Notion 페이지에 실행 로그 기록
```

---

## 시작하기

### 사전 준비

- Node.js 18 이상
- [Notion Integration](https://www.notion.so/my-integrations) API 키 및 대상 페이지 공유
- [Google AI Studio](https://aistudio.google.com/) Gemini API 키
- Tistory 블로그 계정
- [X Developer Portal](https://developer.twitter.com/) OAuth 1.0a 앱 키

### 설치

```bash
git clone https://github.com/thisNorm/content-agent.git
cd content-agent
npm install
```

### 환경변수 설정

`.env` 파일을 프로젝트 루트에 생성합니다.

```env
# ─── 실행 모드 ─────────────────────────────────
# true면 실제 발행 없이 파이프라인만 검증합니다 (기본값: true)
DRY_RUN=false

# ─── Notion ────────────────────────────────────
NOTION_API_KEY=secret_xxxxxxxxxxxx
NOTION_PAGE_URL=https://www.notion.so/...    # 또는 NOTION_PAGE_ID 사용

# Notion 데이터베이스 속성명 (기본값 그대로면 생략 가능)
NOTION_TITLE_PROPERTY=Title
NOTION_SLUG_PROPERTY=Slug
NOTION_TAGS_PROPERTY=Tags
NOTION_CATEGORY_PROPERTY=Category

# ─── Gemini ────────────────────────────────────
GEMINI_API_KEY=AIzaxxxxxxxxxxxxxxxx
GEMINI_IMAGE_MODEL=gemini-2.0-flash-preview-image-generation
THUMBNAIL_OUTPUT_DIR=assets/thumbnails
THUMBNAIL_ALLOW_RETRY=false

# ─── Tistory ───────────────────────────────────
TISTORY_BASE_URL=https://your-blog.tistory.com
# TISTORY_NEW_POST_URL은 TISTORY_BASE_URL에서 자동 생성됩니다

PLAYWRIGHT_AUTH_STATE_PATH=playwright/.auth/tistory.json
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT_MS=30000

# ─── X (Twitter) ───────────────────────────────
X_APP_KEY=xxxxxxxxxx
X_APP_SECRET=xxxxxxxxxx
X_ACCESS_TOKEN=xxxxxxxxxx-xxxxxxxxxx
X_ACCESS_SECRET=xxxxxxxxxx
```

### Tistory 로그인 (최초 1회)

Playwright가 브라우저를 열어 로그인 상태를 저장합니다.

```bash
npm run login:tistory
```

> 저장된 인증 상태는 `playwright/.auth/tistory.json`에 보관됩니다.

---

## 사용법

```bash
# Notion 페이지 URL을 인자로 전달
npm run dev https://www.notion.so/your-page-id

# 또는 .env의 NOTION_PAGE_URL을 사용
npm run dev
```

빌드 후 실행:

```bash
npm run build
npm start https://www.notion.so/your-page-id
```

---

## Notion 페이지 구조

대상 Notion 페이지는 다음 속성(Property)을 포함해야 합니다.

| 속성 | 기본 이름 | 필수 | 설명 |
|------|-----------|:----:|------|
| 제목 | `Title` | ✅ | 블로그 포스트 제목 |
| 슬러그 | `Slug` | ✅ | URL용 영문 슬러그 |
| 태그 | `Tags` | — | 멀티셀렉트, 티스토리 태그로 사용 |
| 카테고리 | `Category` | — | 티스토리 카테고리 |

본문은 Notion 기본 블록(단락, 헤딩, 인용, 이미지 등)으로 자유롭게 작성하면 됩니다.

---

## 주요 모듈

| 파일 | 역할 |
|------|------|
| `src/main.ts` | 파이프라인 진입점, 전체 흐름 조율 |
| `src/notion.ts` | Notion API 클라이언트, 페이지 파싱 |
| `src/transform.ts` | 본문 → Tistory HTML / X 초안 / 썸네일 프롬프트 변환 (로컬 규칙) |
| `src/thumbnail.ts` | Gemini Image API 호출 + sharp 이미지 합성 |
| `src/publish-tistory.ts` | Playwright 기반 Tistory 자동 발행 |
| `src/publish-x.ts` | Twitter API v2 포스팅 |
| `src/image.ts` | 본문 내 이미지 주입 처리 |
| `src/logger.ts` | 실행 로그 구조화 및 Notion 기록 |
| `src/config/env.ts` | zod 기반 환경변수 파싱 및 검증 |

---

## npm 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | tsx로 바로 실행 (개발용) |
| `npm run build` | TypeScript 컴파일 |
| `npm start` | 컴파일된 JS 실행 |
| `npm run check` | 타입 체크만 실행 |
| `npm run login:tistory` | Tistory 브라우저 로그인 및 인증 상태 저장 |

---

## 주의사항

- **`DRY_RUN=true` (기본값)** — 처음 실행 시 실제 발행이 되지 않습니다. 파이프라인 확인 후 `DRY_RUN=false`로 변경하세요.
- **Tistory 셀렉터** — Tistory 에디터 업데이트 시 `src/config/selectors.ts`의 CSS 셀렉터를 블로그 환경에 맞게 조정해야 할 수 있습니다.
- **썸네일 모델** — `gemini-2.0-flash-preview-image-generation`은 프리뷰 모델로, 추후 변경될 수 있습니다.

---

## 기여하기

PR과 Issue 모두 환영합니다.

```bash
# 포크 후 브랜치 생성
git checkout -b feat/your-feature

# 타입 체크
npm run check

# PR 제출
```

버그 리포트, 기능 제안, 다른 블로그 플랫폼 연동 등 어떤 형태의 기여도 좋습니다.

---

## 라이선스

[MIT License](LICENSE) © 2026 thisNorm

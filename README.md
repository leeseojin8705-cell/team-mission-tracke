## 팀 미션 트래커 (코치/선수 과제·기록 관리)

Next.js(App Router) + Prisma(PostgreSQL) 기반의 **축구 팀 과제·평가·기록/스탯 관리 서비스**입니다.

- 코치: 과제 생성·배포, 선수 평가, 팀/선수 스탯, 리포트(인쇄용)
- 선수: 내 과제 확인/진행, 자기평가, 개인 전술 기록, 개인 기록관, 개인 리포트(인쇄용)

---

## 1. 요구 사항

- Node.js 20 이상
- npm (또는 pnpm/yarn – 기본은 npm 기준으로 설명)

데이터베이스는 **PostgreSQL**(로컬 또는 Supabase 등 호스팅)을 사용합니다.

---

## 2. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 만들고, 예시를 참고합니다.

```bash
cp .env.example .env
```

- **DATABASE_URL**: PostgreSQL 연결 URI입니다. Supabase는 **Project Settings → Database → Connection string (URI)** 를 복사하는 것을 권장합니다.  
- 연결 오류(`User was denied access on the database`) 시 → **[docs/database-connection.md](./docs/database-connection.md)** 를 참고하세요.  
- **SESSION_SECRET**: 세션 쿠키 서명용 비밀키입니다. 프로덕션에서는 충분히 긴 랜덤 문자열로 변경하세요.

---

## 3. 설치 & 초기 설정

### 3-1. 의존성 설치

```bash
npm install
```

### 3-2. Prisma 스키마 반영 (DB 마이그레이션 / push)

```bash
npx prisma migrate deploy
# 또는 개발 중 스키마만 맞출 때
npx prisma db push
```

`DATABASE_URL` 이 올바를 때만 성공합니다.

---

## 4. 실행 방법

### 개발 서버

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 에 접속합니다.

- 초기 진입: `/` (역할 선택 화면)
- 관리자/개발 편의를 위한 **관리자 모드 토글** 이 존재합니다. 개발 시에는 관리자 모드를 ON으로 두면 코치 화면을 세션 없이 바로 확인할 수 있습니다.

### 프로덕션 빌드 & 실행

```bash
npm run build
npm run start
```

기본 포트는 `3000` 이며, 필요 시 `PORT` 환경 변수를 지정할 수 있습니다.

---

## 5. 주요 경로 요약

### 공통 / 인증

- `/` : 역할 선택 (코치 / 선수, 관리자 모드 토글)
- `/signup` : 조직 Owner 회원가입 (조직 + 초기 팀 생성)
- `/login/coach` : 코치 로그인 (초대 토큰 연동 포함)

### 코치 영역 (`/coach/**`)

- `/coach` : 코치 대시보드 (팀 스탯 레이더, 조직 정보)
- `/coach/tasks` : 팀/선수 과제 관리
- `/coach/tasks/evaluations` : 과제 평가 대시보드
- `/coach/personal-tasks` : 선수 개인 과제 중 코치에게 평가 요청된 과제 리스트
- `/coach/teams/[teamId]/stats` : 팀 스탯 상세 (기간 필터, 비교, 스냅샷)
- `/coach/teams/[teamId]/report` : 팀 리포트 (인쇄용)
- `/coach/invitations` : 코치 초대 관리
- `/coach/settings` : 조직/팀 설정 조회

### 선수 영역 (`/player/**`)

- `/player` : 선수 대시보드
- `/player/tasks` : 내 과제(팀 과제 + 개인 과제)
- `/player/self-evaluate` : 자기평가
- `/player/stats` : 내 스탯 (기간 필터, 비교, 스냅샷)
- `/player/report` : 선수 개인 리포트 (인쇄용)
- `/player/analysis` : 개인 전술 데이터 입력
- `/player/archive` : 개인 기록관 (개인 전술 데이터에서 저장한 기록 모아보기)

---

## 6. 데이터베이스 및 Prisma

- Prisma 설정 파일: `prisma/schema.prisma`
- 마이그레이션 디렉터리: `prisma/migrations/`
- 로컬 개발 DB 파일: `dev.db` (프로젝트 루트에 생성/사용)

스키마 변경 후에는 다음을 실행합니다.

```bash
npx prisma db push
```

이미 생성된 데이터베이스를 마이그레이션 기반으로 관리하고 싶다면, 필요 시 `npx prisma migrate dev` 를 사용할 수 있습니다.

---

## 7. 배포 시 권장 사항

1. **SESSION_SECRET** 를 충분히 긴 랜덤 문자열로 설정
2. `.env` 파일은 절대 Git에 커밋하지 말고, 서버 환경 변수로 관리
3. 프로덕션 환경에서 `NODE_ENV=production` 으로 실행 (`npm run build && npm run start`)
4. 백업이 필요한 경우 `dev.db` 파일을 정기적으로 스냅샷/백업

이 정도 설정으로, 로컬 개발 환경과 단일 서버 배포 환경에서 안정적으로 서비스를 구동할 수 있습니다.


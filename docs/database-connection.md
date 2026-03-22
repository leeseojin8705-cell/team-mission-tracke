# 데이터베이스 연결 (PostgreSQL / Supabase)

에러 예:

```text
User was denied access on the database `postgres`
```

이 메시지는 **앱 코드가 아니라 DB 서버가 연결(인증)을 거부**할 때 나옵니다. 아래를 순서대로 확인하세요.

## 1. Supabase 대시보드에서 비밀번호·연결 문자열 다시 받기

1. [Supabase](https://supabase.com) → 프로젝트 선택  
2. **Project Settings** → **Database**  
3. **Database password**  
   - 비밀번호를 잊었거나 불확실하면 **Reset database password** 로 새로 만듭니다.  
4. 같은 화면의 **Connection string** → **URI** 탭  
5. 표시된 문자열을 **그대로 복사**해 `.env` 의 `DATABASE_URL` 에 넣습니다.  
   - (가능하면 직접 타이핑하지 말고 복사본을 사용하세요.)

## 2. 비밀번호에 특수문자가 있으면 URL 인코딩

연결 문자열을 수동으로 만들 때, 비밀번호에 `! @ # $ % &` 등이 있으면 **URI에서 깨질 수 있습니다.**

Node에서 한 번 인코딩해 확인할 수 있습니다:

```bash
node -e "console.log(encodeURIComponent('여기에_실제_비밀번호'))"
```

나온 값을 다음 형태에 넣습니다:

```text
postgresql://postgres:<인코딩된_비밀번호>@db.xxxxx.supabase.co:5432/postgres
```

예: 비밀번호가 `ab!!` 이면 `ab%21%21` 로 넣습니다.

## 3. 직접 연결(5432) vs 풀러(6543)

- **직접**: `db.<ref>.supabase.co:5432` — 마이그레이션·로컬 개발에 흔히 사용  
- **Pooler (Transaction)**: `...pooler.supabase.com:6543` — 서버리스/다수 연결에 유리  

Prisma 마이그레이션은 보통 **직접(5432)** 을 권장합니다. 풀러만 쓸 경우 Prisma 문서에 따라 `directUrl` 을 추가하는 설정이 필요할 수 있습니다.

## 4. 프로젝트가 일시 중지되지 않았는지

무료 플랜은 일정 기간 비활성 시 프로젝트가 **Paused** 됩니다. 대시보드에서 **Resume** 후 다시 시도하세요.

## 5. `SUPABASE_SSL_CA` (선택)

프로덕션에서 엄격한 TLS 검증이 필요하면 Supabase가 제공하는 CA를 `SUPABASE_SSL_CA` 에 넣고, `src/lib/prisma.ts` 의 SSL 설정과 함께 사용합니다. 로컬 개발에서는 보통 대시보드에서 준 URI + 올바른 비밀번호면 연결됩니다.

## 6. 여전히 안 될 때

- `.env` 저장 후 **개발 서버를 완전히 종료했다가** `npm run dev` 로 다시 실행  
- 방화벽/VPN이 `5432` 아웃바운드를 막는지 확인  
- Supabase **Settings → Database → Connection pooling** 의 안내와 동일한 형식인지 확인  

---

요약: **`User was denied access`** 는 대부분 **잘못된 비밀번호·잘못 만든 URI·일시 중지된 프로젝트** 중 하나입니다. 대시보드에서 **Reset password** 후 **URI 복사**를 다시 하는 것이 가장 빠릅니다.

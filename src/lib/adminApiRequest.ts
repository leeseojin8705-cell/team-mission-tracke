import { isValidAdminPin } from "@/lib/adminModePins";

/** 클라이언트가 설정하는 쿠키 이름 (page.tsx / coachAdminFetch 와 동일) */
export const ADMIN_PIN_COOKIE_NAME = "tmt_admin_pin";

function getAdminPinFromCookie(req: Request): string {
  const raw = req.headers.get("cookie");
  if (!raw) return "";
  const parts = raw.split(";").map((c) => c.trim());
  for (const p of parts) {
    if (p.startsWith(`${ADMIN_PIN_COOKIE_NAME}=`)) {
      const v = p.slice(`${ADMIN_PIN_COOKIE_NAME}=`.length);
      try {
        return decodeURIComponent(v).trim();
      } catch {
        return v.trim();
      }
    }
  }
  return "";
}

/**
 * 관리자 PIN: 헤더 → Authorization Bearer → 쿠키 → 쿼리(adminPin)
 * (프록시가 x-admin-pin 을 제거하는 경우 대비)
 */
export function getAdminPinFromRequest(req: Request): string {
  const h = req.headers.get("x-admin-pin")?.trim() ?? "";
  if (h) return h;
  const auth = req.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const c = getAdminPinFromCookie(req);
  if (c) return c;
  try {
    const url = new URL(req.url);
    return url.searchParams.get("adminPin")?.trim() ?? "";
  } catch {
    return "";
  }
}

export function isAdminApiRequest(req: Request): boolean {
  return isValidAdminPin(getAdminPinFromRequest(req));
}

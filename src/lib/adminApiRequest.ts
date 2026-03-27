import { isValidAdminPin } from "@/lib/adminModePins";

/** 요청 헤더의 관리자 PIN (홈 관리자 모드와 동일 PIN) */
export function getAdminPinFromRequest(req: Request): string {
  return req.headers.get("x-admin-pin")?.trim() ?? "";
}

export function isAdminApiRequest(req: Request): boolean {
  return isValidAdminPin(getAdminPinFromRequest(req));
}

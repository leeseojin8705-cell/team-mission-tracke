/** 홈 화면 관리자 모드 PIN — 클라이언트 프롬프트와 API 보조 인증에 동일하게 사용 */
export const ADMIN_MODE_PINS = new Set(["3932", "0513"]);

export function isValidAdminPin(pin: string | null | undefined): boolean {
  return (
    typeof pin === "string" &&
    pin.trim().length > 0 &&
    ADMIN_MODE_PINS.has(pin.trim())
  );
}

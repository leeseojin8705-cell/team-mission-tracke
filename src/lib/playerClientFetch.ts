import { coachTasksApiInit } from "@/lib/coachAdminFetch";

/** 선수 화면 `/api/*` 요청에 관리자 PIN·쿠키 동기화 (코치용 coachTasksApiInit 과 동일 계열) */
export function playerApiInit(init?: RequestInit): RequestInit {
  return coachTasksApiInit({ credentials: "same-origin", ...init });
}

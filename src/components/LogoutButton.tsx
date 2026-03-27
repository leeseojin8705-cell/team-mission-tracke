"use client";

import { useState } from "react";

const CLIENT_KEYS_TO_CLEAR = [
  "tmt:lastRole",
  "tmt:lastPlayerId",
  "tmt:coachCode",
];

type Props = {
  variant?: "coach" | "player";
  className?: string;
};

export function LogoutButton({ variant = "coach", className }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (
      !window.confirm(
        "로그아웃 하시겠습니까?\n세션이 종료되고 역할 선택(대문)으로 이동합니다.",
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 쿠키 삭제 실패해도 클라이언트 정리는 진행
    }
    try {
      for (const k of CLIENT_KEYS_TO_CLEAR) {
        window.localStorage.removeItem(k);
      }
    } catch {
      // ignore
    }
    window.location.href = "/";
  }

  const base =
    variant === "coach"
      ? "rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
      : "rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-100 hover:bg-rose-500/20 disabled:opacity-50";

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleClick}
      className={className ?? base}
    >
      {loading ? "로그아웃 중…" : "로그아웃"}
    </button>
  );
}

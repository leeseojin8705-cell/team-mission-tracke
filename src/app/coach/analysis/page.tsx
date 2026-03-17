"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CoachAnalysisPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/coach/analysis/data");
  }, [router]);
  return (
    <div className="flex items-center justify-center py-12 text-slate-400">
      전술 데이터로 이동 중…
    </div>
  );
}

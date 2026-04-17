"use client";

import Image from "next/image";
import { useState } from "react";

/** 업로드·저장된 사진 URL 미리보기 (상대 `/uploads/...`는 최적화, 원격·blob·data 는 unoptimized) */
export function ProfilePhotoPreview({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  const unoptimized = /^(https?:|data:|blob:)/i.test(src);
  return (
    <div className="mt-2 flex justify-center">
      <div className="relative h-32 w-32 shrink-0">
        <Image
          src={src}
          alt=""
          fill
          sizes="128px"
          className="rounded-lg border border-slate-600 object-cover"
          unoptimized={unoptimized}
          onError={() => setBroken(true)}
        />
      </div>
    </div>
  );
}

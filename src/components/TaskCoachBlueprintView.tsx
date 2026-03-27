"use client";

import { useMemo } from "react";
import type { TaskDetails } from "@/lib/types";
import {
  PITCH_VB,
  getFormationSlotsFromTaskDetails,
  hasCoachBlueprintContent,
  type FormationSlot,
} from "@/lib/formationLayouts";
import { FlowPitchWatermark } from "@/components/FlowLogo";

function PitchReadonly({
  slots,
  compact,
  subPoints,
}: {
  slots: FormationSlot[];
  compact: boolean;
  subPoints?: { x: number; y: number; label?: string }[];
}) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border-2 border-emerald-600/60 shadow-inner ring-1 ring-white/10 ${
        compact ? "max-h-40" : ""
      }`}
      style={{ aspectRatio: `${PITCH_VB.w} / ${PITCH_VB.h}` }}
    >
      <svg
        className="absolute inset-0 h-full w-full select-none"
        viewBox={`0 0 ${PITCH_VB.w} ${PITCH_VB.h}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          <linearGradient id="pGrassBase" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1a5c3a" />
            <stop offset="50%" stopColor="#0f4a2e" />
            <stop offset="100%" stopColor="#0d3d28" />
          </linearGradient>
          <pattern id="pStripes" width="10.5" height="68" patternUnits="userSpaceOnUse">
            <rect width="5.25" height="68" fill="#14804f" opacity="0.22" />
            <rect x="5.25" width="5.25" height="68" fill="#0f6b42" opacity="0.12" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={PITCH_VB.w} height={PITCH_VB.h} fill="url(#pGrassBase)" />
        <rect x="0" y="0" width={PITCH_VB.w} height={PITCH_VB.h} fill="url(#pStripes)" opacity="0.85" />
        <rect
          x="0.35"
          y="0.35"
          width={PITCH_VB.w - 0.7}
          height={PITCH_VB.h - 0.7}
          fill="none"
          stroke="rgba(255,255,255,0.88)"
          strokeWidth="0.55"
        />
        <line x1="52.5" y1="0" x2="52.5" y2="68" stroke="rgba(255,255,255,0.88)" strokeWidth="0.45" />
        <circle cx="52.5" cy="34" r="9.15" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="0.45" />
        <circle cx="52.5" cy="34" r="0.55" fill="rgba(255,255,255,0.95)" />
        <FlowPitchWatermark />
        <rect x="0" y="13.84" width="16.5" height="40.32" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="0.45" />
        <rect x="0" y="24.84" width="5.5" height="18.32" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="0.45" />
        <circle cx="11" cy="34" r="0.5" fill="rgba(255,255,255,0.95)" />
        <path
          d="M 16.5 26.69 A 9.15 9.15 0 0 1 16.5 41.31"
          fill="none"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth="0.4"
        />
        <rect x="88.5" y="13.84" width="16.5" height="40.32" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="0.45" />
        <rect x="99.5" y="24.84" width="5.5" height="18.32" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="0.45" />
        <circle cx="94" cy="34" r="0.5" fill="rgba(255,255,255,0.95)" />
        <path
          d="M 88.5 26.69 A 9.15 9.15 0 0 0 88.5 41.31"
          fill="none"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth="0.4"
        />
        <line x1="0" y1="30.34" x2="0" y2="37.66" stroke="rgba(250,250,250,0.95)" strokeWidth="1.1" strokeLinecap="round" />
        <line
          x1="105"
          y1="30.34"
          x2="105"
          y2="37.66"
          stroke="rgba(250,250,250,0.95)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        {slots.map((slot, i) => {
          const isGk = slot.label === "GK";
          return (
            <g key={slot.id ?? `${slot.x}-${slot.y}-${i}`}>
              <circle
                cx={slot.x}
                cy={slot.y}
                r={isGk ? 2.35 : 2.05}
                fill={isGk ? "rgba(250,204,21,0.35)" : "rgba(163,230,53,0.28)"}
                stroke={isGk ? "rgba(250,204,21,0.95)" : "rgba(190,242,100,0.95)"}
                strokeWidth="0.45"
              />
              <text
                x={slot.x}
                y={slot.y + 0.85}
                textAnchor="middle"
                fontSize={isGk ? 2.1 : 2.35}
                fontWeight="700"
                fill="rgba(15,23,42,0.92)"
                style={{ fontFamily: "system-ui, sans-serif" }}
              >
                {isGk ? "GK" : String(i + 1)}
              </text>
            </g>
          );
        })}
        {subPoints?.map((sp, i) => (
          <g key={`sub-ro-${i}-${sp.x}-${sp.y}`}>
            <circle
              cx={sp.x}
              cy={sp.y}
              r={2.4}
              fill="rgba(249,115,22,0.4)"
              stroke="rgba(251,146,60,0.95)"
              strokeWidth="0.45"
            />
            <text
              x={sp.x}
              y={sp.y + 4.1}
              textAnchor="middle"
              fontSize={1.75}
              fontWeight="700"
              fill="rgba(255,247,237,0.95)"
              style={{ fontFamily: "system-ui, sans-serif" }}
            >
              {sp.label ?? "교체"}
            </text>
          </g>
        ))}
      </svg>
      <div className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 rounded bg-black/35 px-1 py-0.5 text-[7px] text-white/90">
        수비
      </div>
      <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 rounded bg-black/35 px-1 py-0.5 text-[7px] text-white/90">
        공격 →
      </div>
    </div>
  );
}

type Props = {
  details: TaskDetails | null | undefined;
  /** 목록 카드용: 필드·텍스트 축소 */
  compact?: boolean;
};

export function TaskCoachBlueprintView({ details, compact = false }: Props) {
  const slots = useMemo(() => getFormationSlotsFromTaskDetails(details ?? undefined), [details]);

  if (!hasCoachBlueprintContent(details ?? undefined)) {
    return null;
  }

  const d = details;
  const subMarkers = useMemo(() => {
    const raw = d?.formationSubPoints;
    if (!Array.isArray(raw)) return [];
    return raw.map((p, i) => ({
      x: p.x,
      y: p.y,
      label: `S${i + 1}`,
    }));
  }, [d?.formationSubPoints]);
  const formationLabel =
    d?.formation === "custom"
      ? d?.formationLabel?.trim() || "직접 배치"
      : d?.formation?.trim() || "";
  const scopeLabelMap: Record<string, string> = {
    공통과제: "공통",
    개인과제: "개인",
  };

  return (
    <div
      className={`overflow-hidden rounded-xl border border-lime-400/30 bg-slate-950/80 ${
        compact ? "" : "shadow-lg shadow-lime-500/5"
      }`}
    >
      <div className="bg-gradient-to-r from-lime-400 to-emerald-500 px-3 py-2 text-center">
        <p className="text-[10px] font-bold tracking-[0.15em] text-slate-900">TEAM MISSION TRACKER</p>
        <p className="text-xs font-extrabold text-slate-950">코치·선수 과제 블루프린트</p>
      </div>

      <div className={`grid gap-3 p-3 ${compact ? "md:grid-cols-1" : "md:grid-cols-2"}`}>
        <div className="space-y-2 text-[11px] text-slate-300">
          {d?.subFocus && (
            <p>
              <span className="text-slate-500">세부 초점</span> · {d.subFocus}
            </p>
          )}
          {d?.todayStrategy?.trim() && (
            <div>
              <p className="text-slate-500">오늘의 전술</p>
              <p className="mt-0.5 whitespace-pre-wrap text-slate-200">{d.todayStrategy.trim()}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {formationLabel && (
              <span className="rounded border border-lime-500/40 bg-lime-500/10 px-2 py-0.5 text-[10px] font-semibold text-lime-200">
                포메이션 {formationLabel}
              </span>
            )}
            {Array.isArray(d?.formationPlayerAssignments) &&
              d.formationPlayerAssignments.length > 0 && (
                <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                  슬롯 배정 {d.formationPlayerAssignments.length}명
                </span>
              )}
            {Array.isArray(d?.formationSubPoints) && d.formationSubPoints.length > 0 && (
              <span className="rounded border border-orange-500/45 bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-200">
                교체 포인트 {d.formationSubPoints.length}명
              </span>
            )}
            {d?.preCheckTime && (
              <span className="rounded border border-slate-600 px-2 py-0.5 text-[10px] text-slate-300">
                사전 점검 {d.preCheckTime}
              </span>
            )}
          </div>
          {Array.isArray(d?.assignmentLines) && d!.assignmentLines!.length > 0 && (
            <div className="border-t border-slate-700/80 pt-2">
              <p className="mb-1 text-[10px] font-semibold text-slate-500">과제 줄</p>
              <ul className="space-y-1">
                {d!.assignmentLines!.map((line, idx) => (
                  <li key={idx} className="rounded border border-slate-700/80 bg-slate-900/60 px-2 py-1 text-[10px] text-slate-200">
                    <span className="text-slate-100">{line.text}</span>
                    {Array.isArray(line.scopes) && line.scopes.length > 0 && (
                      <span className="ml-1 text-slate-500">
                        ({line.scopes.map((s) => scopeLabelMap[s] ?? s).join(", ")})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {(slots.length > 0 || subMarkers.length > 0) && (
          <div className="min-w-0">
            <p className="mb-1 text-[10px] text-slate-500">미니 필드 (105×68m)</p>
            <PitchReadonly
              slots={slots}
              compact={Boolean(compact)}
              subPoints={subMarkers.length > 0 ? subMarkers : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}

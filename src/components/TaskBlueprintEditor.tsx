"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TaskDetails } from "@/lib/types";
import {
  FORMATION_LAYOUTS,
  FORMATION_PRESET_OPTIONS,
  PITCH_VB,
  type FormationSlot,
} from "@/lib/formationLayouts";

export type TaskBlueprintDraft = Partial<
  Pick<
    TaskDetails,
    | "subFocus"
    | "todayStrategy"
    | "formation"
    | "formationLabel"
    | "formationCustomSlots"
    | "preCheckTime"
    | "assignmentLines"
  >
>;

type SubFocusOpt = "이해" | "응용" | "활용" | "전략" | "점검" | "평가";

type AssignmentRow = {
  id: string;
  text: string;
  common: boolean;
  fw: boolean;
  mf: boolean;
  df: boolean;
  gk: boolean;
  individual: boolean;
};

function newFormationSlotId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `fs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clonePresetToCustomSlots(slots: FormationSlot[]): FormationSlot[] {
  return slots.map((s) => ({
    x: s.x,
    y: s.y,
    label: s.label,
    id: newFormationSlotId(),
  }));
}

function clampPitch(x: number, y: number) {
  return {
    x: Math.min(104.2, Math.max(0.8, x)),
    y: Math.min(67.2, Math.max(0.8, y)),
  };
}

function clientToSvgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return pt.matrixTransform(ctm.inverse());
}

function newAssignmentRow(): AssignmentRow {
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `r-${Date.now()}-${Math.random()}`,
    text: "",
    common: true,
    fw: false,
    mf: false,
    df: false,
    gk: false,
    individual: false,
  };
}

type Props = {
  /** 저장 시 details에 합치할 필드 (ref로만 써도 됨) */
  onDraftChange?: (draft: TaskBlueprintDraft) => void;
  className?: string;
};

export function TaskBlueprintEditor({ onDraftChange, className }: Props) {
  const subFocusOptions: SubFocusOpt[] = [
    "이해",
    "응용",
    "활용",
    "전략",
    "점검",
    "평가",
  ];

  const [subFocus, setSubFocus] = useState<SubFocusOpt | null>(null);
  const [todayStrategy, setTodayStrategy] = useState("");
  const [formation, setFormation] = useState("");
  const [formationNote, setFormationNote] = useState("");
  const [customFormationSlots, setCustomFormationSlots] = useState<
    FormationSlot[]
  >([]);
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const pitchSvgRef = useRef<SVGSVGElement | null>(null);
  const [preCheckTime, setPreCheckTime] = useState("");
  const [assignmentRows, setAssignmentRows] = useState<AssignmentRow[]>(() => [
    newAssignmentRow(),
  ]);

  const displayFormationSlots = useMemo(() => {
    if (formation === "custom") return customFormationSlots;
    if (!formation) return [] as FormationSlot[];
    return FORMATION_LAYOUTS[formation] ?? [];
  }, [formation, customFormationSlots]);

  const isCustomFormation = formation === "custom";

  const handleFormationSelect = useCallback(
    (next: string) => {
      if (next === "custom") {
        const seedKey = formation !== "custom" ? formation : "";
        setFormation("custom");
        setCustomFormationSlots((prev) => {
          if (prev.length > 0) return prev;
          const seed =
            seedKey && FORMATION_LAYOUTS[seedKey]
              ? FORMATION_LAYOUTS[seedKey]
              : null;
          if (seed) return clonePresetToCustomSlots(seed);
          return [{ x: 6, y: 34, label: "GK", id: newFormationSlotId() }];
        });
      } else {
        setFormation(next);
      }
    },
    [formation],
  );

  const applyPresetToCustomField = useCallback((presetKey: string) => {
    const seed = FORMATION_LAYOUTS[presetKey];
    if (!seed) return;
    setFormation("custom");
    setCustomFormationSlots(clonePresetToCustomSlots(seed));
  }, []);

  useEffect(() => {
    if (!draggingSlotId) return;
    const move = (e: PointerEvent) => {
      const svg = pitchSvgRef.current;
      if (!svg) return;
      const p = clientToSvgPoint(svg, e.clientX, e.clientY);
      const c = clampPitch(p.x, p.y);
      setCustomFormationSlots((prev) =>
        prev.map((s) =>
          s.id === draggingSlotId ? { ...s, x: c.x, y: c.y } : s,
        ),
      );
    };
    const up = () => setDraggingSlotId(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [draggingSlotId]);

  const buildDraft = useCallback((): TaskBlueprintDraft => {
    const assignmentLines = assignmentRows
      .filter((r) => r.text.trim())
      .map((r) => ({
        text: r.text.trim(),
        scopes: [
          r.common && "공통과제",
          r.fw && "FW",
          r.mf && "MF",
          r.df && "DF",
          r.gk && "GK",
          r.individual && "개인과제",
        ].filter(Boolean) as string[],
      }));

    return {
      subFocus: subFocus || undefined,
      todayStrategy: todayStrategy.trim() || undefined,
      formation: formation.trim() || undefined,
      formationLabel: formationNote.trim() || undefined,
      formationCustomSlots:
        formation === "custom" && customFormationSlots.length > 0
          ? customFormationSlots.map(({ x, y, label }) => ({
              x,
              y,
              ...(label ? { label } : {}),
            }))
          : undefined,
      preCheckTime: preCheckTime || undefined,
      assignmentLines: assignmentLines.length ? assignmentLines : undefined,
    };
  }, [
    assignmentRows,
    customFormationSlots,
    formation,
    formationNote,
    preCheckTime,
    subFocus,
    todayStrategy,
  ]);

  useEffect(() => {
    onDraftChange?.(buildDraft());
  }, [buildDraft, onDraftChange]);

  return (
    <section
      className={`space-y-4 rounded-2xl border border-lime-500/25 bg-slate-950/50 p-4 ${className ?? ""}`}
    >
      <div className="bg-gradient-to-r from-lime-400/90 to-emerald-500/90 px-3 py-2 text-center rounded-lg">
        <p className="text-[10px] font-bold tracking-[0.12em] text-slate-900">
          TEAM MISSION TRACKER
        </p>
        <p className="text-xs font-extrabold text-slate-950">
          전술 · 포메이션 · 미니 필드 (선택)
        </p>
        <p className="mt-0.5 text-[10px] text-slate-800/90">
          코치 과제와 같은 형식으로 저장되며, 목록·상세에서 미니맵으로 표시됩니다.
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
        <div className="mb-2 text-[11px] font-semibold text-slate-400">세부 초점</div>
        <div className="flex flex-wrap gap-2">
          {subFocusOptions.map((sf) => (
            <button
              key={sf}
              type="button"
              onClick={() => setSubFocus(subFocus === sf ? null : sf)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                subFocus === sf
                  ? "border-sky-400 bg-sky-500/20 text-sky-100"
                  : "border-slate-600 text-slate-200"
              }`}
            >
              {sf}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
        <div className="mb-3 text-[11px] font-semibold text-slate-400">
          전술 · 포메이션 · 미니 필드
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-300">오늘의 전술</label>
              <textarea
                value={todayStrategy}
                onChange={(e) => setTodayStrategy(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-lime-400"
                placeholder="전술 메모를 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="mb-1 block text-xs text-slate-300">
                포메이션 (프리셋 또는 직접 배치)
              </label>
              <select
                value={formation}
                onChange={(e) => handleFormationSelect(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-lime-400"
              >
                <option value="">선택 안 함</option>
                {FORMATION_PRESET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
                <option value="custom">직접 배치 (필드에서 편집)</option>
              </select>
              {isCustomFormation && (
                <>
                  <input
                    type="text"
                    value={formationNote}
                    onChange={(e) => setFormationNote(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-lime-400"
                    placeholder="전술 이름 (선택, 예: 3-2-3-2 변형)"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-slate-500">
                      프리셋을 불러온 뒤 필드에서 옮기기:
                    </span>
                    <select
                      className="max-w-[10rem] rounded border border-slate-600 bg-slate-950 px-2 py-1 text-[10px] text-slate-200"
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) applyPresetToCustomField(v);
                        e.target.value = "";
                      }}
                    >
                      <option value="">프리셋 불러오기…</option>
                      {FORMATION_PRESET_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setCustomFormationSlots([
                          {
                            x: 6,
                            y: 34,
                            label: "GK",
                            id: newFormationSlotId(),
                          },
                        ])
                      }
                      className="rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
                    >
                      GK만
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomFormationSlots([])}
                      className="rounded border border-rose-800/60 px-2 py-1 text-[10px] text-rose-200/90 hover:bg-rose-950/40"
                    >
                      마커 전부 삭제
                    </button>
                  </div>
                </>
              )}
            </div>
            <label className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span>사전 점검 시각</span>
              <input
                type="time"
                value={preCheckTime}
                onChange={(e) => setPreCheckTime(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-400"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">
                축소 경기장 (105×68m)
                {isCustomFormation
                  ? " · 직접 배치: 잔디 클릭=추가 · 드래그=이동 · 더블클릭=삭제"
                  : " · 프리셋을 선택하면 배치가 표시됩니다"}
              </p>
              {formation ? (
                <span className="max-w-[55%] truncate rounded border border-lime-500/40 bg-lime-500/10 px-2 py-0.5 text-[10px] font-semibold text-lime-200">
                  {formation === "custom"
                    ? formationNote.trim() || "직접 배치"
                    : formation}
                </span>
              ) : null}
            </div>
            <div className="relative w-full overflow-hidden rounded-xl border-2 border-emerald-600/70 shadow-inner shadow-black/40 ring-1 ring-white/10">
              <div
                className="relative w-full"
                style={{ aspectRatio: `${PITCH_VB.w} / ${PITCH_VB.h}` }}
              >
                <svg
                  ref={pitchSvgRef}
                  className="absolute inset-0 h-full w-full touch-none select-none"
                  viewBox={`0 0 ${PITCH_VB.w} ${PITCH_VB.h}`}
                  preserveAspectRatio="xMidYMid meet"
                  aria-label="포메이션 미니 필드"
                >
                  <defs>
                    <linearGradient
                      id="pitchGrassBasePlayer"
                      x1="0%"
                      y1="0%"
                      x2="0%"
                      y2="100%"
                    >
                      <stop offset="0%" stopColor="#1a5c3a" />
                      <stop offset="50%" stopColor="#0f4a2e" />
                      <stop offset="100%" stopColor="#0d3d28" />
                    </linearGradient>
                    <pattern
                      id="pitchStripesPlayer"
                      width="10.5"
                      height="68"
                      patternUnits="userSpaceOnUse"
                    >
                      <rect width="5.25" height="68" fill="#14804f" opacity="0.22" />
                      <rect
                        x="5.25"
                        width="5.25"
                        height="68"
                        fill="#0f6b42"
                        opacity="0.12"
                      />
                    </pattern>
                    <filter id="pitchShadowPlayer" x="-5%" y="-5%" width="110%" height="110%">
                      <feDropShadow
                        dx="0"
                        dy="1"
                        stdDeviation="1.2"
                        floodOpacity="0.35"
                      />
                    </filter>
                  </defs>
                  <rect
                    x="0"
                    y="0"
                    width={PITCH_VB.w}
                    height={PITCH_VB.h}
                    fill="url(#pitchGrassBasePlayer)"
                  />
                  <rect
                    x="0"
                    y="0"
                    width={PITCH_VB.w}
                    height={PITCH_VB.h}
                    fill="url(#pitchStripesPlayer)"
                    opacity="0.85"
                  />
                  <rect
                    x="0.35"
                    y="0.35"
                    width={PITCH_VB.w - 0.7}
                    height={PITCH_VB.h - 0.7}
                    fill="none"
                    stroke="rgba(255,255,255,0.88)"
                    strokeWidth="0.55"
                    filter="url(#pitchShadowPlayer)"
                  />
                  <line
                    x1="52.5"
                    y1="0"
                    x2="52.5"
                    y2="68"
                    stroke="rgba(255,255,255,0.88)"
                    strokeWidth="0.45"
                  />
                  <circle
                    cx="52.5"
                    cy="34"
                    r="9.15"
                    fill="none"
                    stroke="rgba(255,255,255,0.88)"
                    strokeWidth="0.45"
                  />
                  <circle
                    cx="52.5"
                    cy="34"
                    r="0.55"
                    fill="rgba(255,255,255,0.95)"
                  />
                  <rect
                    x="0"
                    y="13.84"
                    width="16.5"
                    height="40.32"
                    fill="none"
                    stroke="rgba(255,255,255,0.88)"
                    strokeWidth="0.45"
                  />
                  <rect
                    x="0"
                    y="24.84"
                    width="5.5"
                    height="18.32"
                    fill="none"
                    stroke="rgba(255,255,255,0.88)"
                    strokeWidth="0.45"
                  />
                  <circle cx="11" cy="34" r="0.5" fill="rgba(255,255,255,0.95)" />
                  <path
                    d="M 16.5 26.69 A 9.15 9.15 0 0 1 16.5 41.31"
                    fill="none"
                    stroke="rgba(255,255,255,0.75)"
                    strokeWidth="0.4"
                  />
                  <rect
                    x="88.5"
                    y="13.84"
                    width="16.5"
                    height="40.32"
                    fill="none"
                    stroke="rgba(255,255,255,0.88)"
                    strokeWidth="0.45"
                  />
                  <rect
                    x="99.5"
                    y="24.84"
                    width="5.5"
                    height="18.32"
                    fill="none"
                    stroke="rgba(255,255,255,0.88)"
                    strokeWidth="0.45"
                  />
                  <circle cx="94" cy="34" r="0.5" fill="rgba(255,255,255,0.95)" />
                  <path
                    d="M 88.5 26.69 A 9.15 9.15 0 0 0 88.5 41.31"
                    fill="none"
                    stroke="rgba(255,255,255,0.75)"
                    strokeWidth="0.4"
                  />
                  <line
                    x1="0"
                    y1="30.34"
                    x2="0"
                    y2="37.66"
                    stroke="rgba(250,250,250,0.95)"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                  />
                  <line
                    x1="105"
                    y1="30.34"
                    x2="105"
                    y2="37.66"
                    stroke="rgba(250,250,250,0.95)"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 0 1 A 1 1 0 0 1 1 0"
                    fill="none"
                    stroke="rgba(255,255,255,0.65)"
                    strokeWidth="0.35"
                  />
                  <path
                    d="M 104 0 A 1 1 0 0 1 105 1"
                    fill="none"
                    stroke="rgba(255,255,255,0.65)"
                    strokeWidth="0.35"
                  />
                  <path
                    d="M 0 67 A 1 1 0 0 0 1 68"
                    fill="none"
                    stroke="rgba(255,255,255,0.65)"
                    strokeWidth="0.35"
                  />
                  <path
                    d="M 105 67 A 1 1 0 0 1 104 68"
                    fill="none"
                    stroke="rgba(255,255,255,0.65)"
                    strokeWidth="0.35"
                  />
                  {isCustomFormation && (
                    <rect
                      x="0"
                      y="0"
                      width={PITCH_VB.w}
                      height={PITCH_VB.h}
                      fill="transparent"
                      style={{ cursor: "crosshair" }}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        const svg = pitchSvgRef.current;
                        if (!svg) return;
                        const p = clientToSvgPoint(svg, e.clientX, e.clientY);
                        const c = clampPitch(p.x, p.y);
                        setCustomFormationSlots((prev) => [
                          ...prev,
                          {
                            x: Math.round(c.x * 100) / 100,
                            y: Math.round(c.y * 100) / 100,
                            id: newFormationSlotId(),
                          },
                        ]);
                      }}
                    />
                  )}
                  {displayFormationSlots.map((slot, i) => {
                    const isGk = slot.label === "GK";
                    const slotKey =
                      slot.id ?? `preset-${slot.x}-${slot.y}-${i}`;
                    const editable = isCustomFormation && Boolean(slot.id);
                    return (
                      <g
                        key={slotKey}
                        data-formation-marker=""
                        style={{
                          cursor: editable
                            ? draggingSlotId === slot.id
                              ? "grabbing"
                              : "grab"
                            : "default",
                          pointerEvents: editable ? "auto" : "none",
                        }}
                        onPointerDown={(e) => {
                          if (!editable || !slot.id) return;
                          e.stopPropagation();
                          e.preventDefault();
                          setDraggingSlotId(slot.id);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (!editable || !slot.id) return;
                          setCustomFormationSlots((prev) =>
                            prev.filter((s) => s.id !== slot.id),
                          );
                        }}
                      >
                        <circle
                          cx={slot.x}
                          cy={slot.y}
                          r={isGk ? 2.35 : 2.05}
                          fill={
                            isGk
                              ? "rgba(250,204,21,0.35)"
                              : "rgba(163,230,53,0.28)"
                          }
                          stroke={
                            isGk
                              ? "rgba(250,204,21,0.95)"
                              : "rgba(190,242,100,0.95)"
                          }
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
                </svg>
                <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded bg-black/35 px-1.5 py-0.5 text-[8px] font-medium text-white/90 backdrop-blur-[2px]">
                  수비
                </div>
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-black/35 px-1.5 py-0.5 text-[8px] font-medium text-white/90 backdrop-blur-[2px]">
                  공격 →
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              {displayFormationSlots.length > 0
                ? `필드 ${displayFormationSlots.length}포지션 표시`
                : "프리셋 또는 직접 배치를 선택하면 표시됩니다"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-400">
          <span>과제 줄 (공통 / 포지션 / 개인)</span>
          <button
            type="button"
            onClick={() =>
              setAssignmentRows((prev) => [...prev, newAssignmentRow()])
            }
            className="rounded border border-slate-500 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
          >
            + 줄 추가
          </button>
        </div>
        <div className="space-y-3">
          {assignmentRows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-slate-600 bg-slate-900/80 p-3"
            >
              <div className="flex flex-wrap items-start gap-2">
                <input
                  value={row.text}
                  onChange={(e) =>
                    setAssignmentRows((prev) =>
                      prev.map((r) =>
                        r.id === row.id ? { ...r, text: e.target.value } : r,
                      ),
                    )
                  }
                  className="min-w-[200px] flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                  placeholder="예: 볼 뺏기지 않기, 미드 프레싱"
                />
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["common", "공통", row.common] as const,
                      ["fw", "FW", row.fw] as const,
                      ["mf", "MF", row.mf] as const,
                      ["df", "DF", row.df] as const,
                      ["gk", "GK", row.gk] as const,
                      ["individual", "개인", row.individual] as const,
                    ] as const
                  ).map(([key, label, on]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setAssignmentRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id
                              ? {
                                  ...r,
                                  [key]: !r[key as keyof AssignmentRow],
                                }
                              : r,
                          ),
                        )
                      }
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        on
                          ? "bg-lime-500/20 text-lime-100"
                          : "bg-slate-950 text-slate-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Player, TaskDetails } from "@/lib/types";
import {
  FORMATION_LAYOUTS,
  FORMATION_PRESET_OPTIONS,
  PITCH_VB,
  type FormationSlot,
} from "@/lib/formationLayouts";
import { assignPlayerToUniqueSlot } from "@/lib/formationSlotAssignments";
import { FlowPitchWatermark } from "@/components/FlowLogo";

export type TaskBlueprintDraft = Partial<
  Pick<
    TaskDetails,
    | "subFocus"
    | "todayStrategy"
    | "formation"
    | "formationLabel"
    | "formationCustomSlots"
    | "formationPlayerAssignments"
    | "preCheckTime"
    | "assignmentLines"
    | "players"
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
  candidatePlayers?: Player[];
  className?: string;
};

export function TaskBlueprintEditor({
  onDraftChange,
  candidatePlayers = [],
  className,
}: Props) {
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
  const [slotPlayerAssignments, setSlotPlayerAssignments] = useState<
    Record<number, string>
  >({});
  const [pendingSlotPlayerId, setPendingSlotPlayerId] = useState<
    string | null
  >(null);
  const [assignmentRows, setAssignmentRows] = useState<AssignmentRow[]>(() => [
    newAssignmentRow(),
  ]);
  const playerMap = useMemo(
    () => Object.fromEntries(candidatePlayers.map((p) => [p.id, p])),
    [candidatePlayers],
  );

  const displayFormationSlots = useMemo(() => {
    if (formation === "custom") return customFormationSlots;
    if (!formation) return [] as FormationSlot[];
    return FORMATION_LAYOUTS[formation] ?? [];
  }, [formation, customFormationSlots]);
  const normalizedSlotPlayerAssignments = useMemo(() => {
    const maxSlot = Math.max(0, displayFormationSlots.length - 1);
    const allowedIds = new Set(candidatePlayers.map((p) => p.id));
    const next: Record<number, string> = {};
    for (const [k, v] of Object.entries(slotPlayerAssignments)) {
      const idx = Number(k);
      if (!Number.isFinite(idx) || idx < 0 || idx > maxSlot) continue;
      if (!allowedIds.has(v)) continue;
      next[idx] = v;
    }
    return next;
  }, [slotPlayerAssignments, displayFormationSlots, candidatePlayers]);
  const assignedPlayerIds = useMemo(
    () => new Set(Object.values(normalizedSlotPlayerAssignments)),
    [normalizedSlotPlayerAssignments],
  );

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
      formationPlayerAssignments:
        Object.keys(normalizedSlotPlayerAssignments).length > 0
          ? Object.entries(normalizedSlotPlayerAssignments)
              .map(([slot, playerId]) => ({
                slot: Number(slot),
                playerId,
              }))
              .filter((x) => Number.isFinite(x.slot) && x.slot >= 0 && Boolean(x.playerId))
          : undefined,
      preCheckTime: preCheckTime || undefined,
      assignmentLines: assignmentLines.length ? assignmentLines : undefined,
      players:
        Object.keys(normalizedSlotPlayerAssignments).length > 0
          ? Array.from(new Set(Object.values(normalizedSlotPlayerAssignments)))
          : undefined,
    };
  }, [
    assignmentRows,
    normalizedSlotPlayerAssignments,
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
      className={`space-y-4 rounded-2xl border border-sky-200/80 bg-white/95 p-4 shadow-sm shadow-sky-900/5 ${className ?? ""}`}
    >
      <div className="rounded-lg bg-gradient-to-r from-sky-400/95 to-cyan-500/95 px-3 py-2 text-center">
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

      <div className="rounded-xl border border-sky-200 bg-sky-50/90 p-4">
        <div className="mb-2 text-[11px] font-semibold text-slate-500">세부 초점</div>
        <div className="flex flex-wrap gap-2">
          {subFocusOptions.map((sf) => (
            <button
              key={sf}
              type="button"
              onClick={() => setSubFocus(subFocus === sf ? null : sf)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                subFocus === sf
                  ? "border-sky-500 bg-sky-500/15 text-sky-900"
                  : "border-sky-200 text-slate-700 hover:bg-white/80"
              }`}
            >
              {sf}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-sky-200 bg-white/95 p-4">
        <div className="mb-3 text-[11px] font-semibold text-slate-500">
          전술 · 포메이션 · 미니 필드
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-600">오늘의 전술</label>
              <textarea
                value={todayStrategy}
                onChange={(e) => setTodayStrategy(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-500"
                placeholder="전술 메모를 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="mb-1 block text-xs text-slate-600">
                포메이션 (프리셋 또는 직접 배치)
              </label>
              <select
                value={formation}
                onChange={(e) => handleFormationSelect(e.target.value)}
                className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-500"
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
                    className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-500"
                    placeholder="전술 이름 (선택, 예: 3-2-3-2 변형)"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-slate-500">
                      프리셋을 불러온 뒤 필드에서 옮기기:
                    </span>
                    <select
                      className="max-w-[10rem] rounded border border-sky-200 bg-white px-2 py-1 text-[10px] text-slate-800"
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
                      className="rounded border border-sky-200 px-2 py-1 text-[10px] text-slate-600 hover:bg-sky-50"
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
            <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>사전 점검 시각</span>
              <input
                type="time"
                value={preCheckTime}
                onChange={(e) => setPreCheckTime(e.target.value)}
                className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-sky-500"
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
            <div className="relative w-full overflow-hidden rounded-xl border-2 border-sky-400/60 shadow-inner shadow-sky-900/10 ring-1 ring-sky-200/50">
              <div
                className="relative w-full"
                style={{ aspectRatio: `${PITCH_VB.w} / ${PITCH_VB.h}` }}
              >
                <svg
                  ref={pitchSvgRef}
                  className="absolute inset-0 h-full w-full select-none"
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
                  <FlowPitchWatermark />
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
                    const assignedPlayerId = normalizedSlotPlayerAssignments[i];
                    const assignedPlayer = assignedPlayerId
                      ? playerMap[assignedPlayerId]
                      : undefined;
                    const shortName = assignedPlayer?.name
                      ? assignedPlayer.name.length > 4
                        ? `${assignedPlayer.name.slice(0, 4)}…`
                        : assignedPlayer.name
                      : null;
                    const badgeText = assignedPlayer?.position
                      ? assignedPlayer.position.toUpperCase()
                      : null;
                    return (
                      <g
                        key={slotKey}
                        data-formation-marker=""
                        style={{
                          cursor: editable
                            ? draggingSlotId === slot.id
                              ? "grabbing"
                              : "grab"
                            : "copy",
                          pointerEvents: "auto",
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (e.dataTransfer) {
                            e.dataTransfer.dropEffect = "copy";
                          }
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          if (e.dataTransfer) {
                            e.dataTransfer.dropEffect = "copy";
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (editable) return;
                          if (!pendingSlotPlayerId) return;
                          setSlotPlayerAssignments((prev) =>
                            assignPlayerToUniqueSlot(prev, i, pendingSlotPlayerId),
                          );
                          setPendingSlotPlayerId(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const playerId =
                            e.dataTransfer.getData("text/player-id") ||
                            e.dataTransfer.getData("text/plain");
                          if (!playerId) return;
                          setSlotPlayerAssignments((prev) =>
                            assignPlayerToUniqueSlot(prev, i, playerId),
                          );
                          setPendingSlotPlayerId(null);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setSlotPlayerAssignments((prev) => {
                            const next = { ...prev };
                            delete next[i];
                            return next;
                          });
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
                          r={5.8}
                          fill="transparent"
                          stroke="none"
                          pointerEvents="all"
                        />
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
                          pointerEvents="none"
                        />
                        <text
                          x={slot.x}
                          y={slot.y + 0.85}
                          textAnchor="middle"
                          fontSize={isGk ? 2.1 : 2.35}
                          fontWeight="700"
                          fill="rgba(15,23,42,0.92)"
                          style={{ fontFamily: "system-ui, sans-serif" }}
                          pointerEvents="none"
                        >
                          {isGk ? "GK" : String(i + 1)}
                        </text>
                        {shortName && (
                          <text
                            x={slot.x}
                            y={slot.y + 3.7}
                            textAnchor="middle"
                            fontSize={1.8}
                            fontWeight="700"
                            fill="rgba(255,255,255,0.95)"
                            style={{ fontFamily: "system-ui, sans-serif" }}
                            pointerEvents="none"
                          >
                            {shortName}
                          </text>
                        )}
                        {badgeText && (
                          <text
                            x={slot.x}
                            y={slot.y + 5.7}
                            textAnchor="middle"
                            fontSize={1.5}
                            fontWeight="700"
                            fill="rgba(251,191,36,0.95)"
                            style={{ fontFamily: "system-ui, sans-serif" }}
                            pointerEvents="none"
                          >
                            {badgeText}
                          </text>
                        )}
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
              {Object.keys(normalizedSlotPlayerAssignments).length > 0
                ? ` · 배정 ${Object.keys(normalizedSlotPlayerAssignments).length}명`
                : ""}
            </p>
            {candidatePlayers.length > 0 ? (
              <div className="border-t border-sky-200/90 bg-sky-50/95 px-2 py-2">
                <p className="mb-1.5 text-[10px] text-slate-600">
                  대상 선수 (드래그 또는 탭 후 프리셋 슬롯 클릭 · 슬롯 우클릭 해제)
                </p>
                <div className="flex max-h-[4.5rem] flex-wrap gap-1 overflow-y-auto pr-0.5">
                  {candidatePlayers.slice(0, 24).map((p) => {
                    const pending = pendingSlotPlayerId === p.id;
                    return (
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", p.id);
                          e.dataTransfer.setData("text/player-id", p.id);
                          e.dataTransfer.effectAllowed = "copyMove";
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setPendingSlotPlayerId((prev) =>
                              prev === p.id ? null : p.id,
                            );
                          }
                        }}
                        onClick={() =>
                          setPendingSlotPlayerId((prev) =>
                            prev === p.id ? null : p.id,
                          )
                        }
                        className={`cursor-grab rounded-md border px-1.5 py-0.5 text-[10px] transition active:cursor-grabbing ${
                          pending
                            ? "border-lime-400 bg-lime-400 font-medium text-slate-950 shadow-sm shadow-lime-500/20"
                            : "border-sky-200 bg-white text-slate-700 hover:border-sky-400"
                        }`}
                      >
                        {p.name}
                        {assignedPlayerIds.has(p.id) && (
                          <span className="ml-1 text-[9px] text-amber-300">●</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="border-t border-sky-200/90 bg-sky-50/95 px-2 py-2 text-[10px] text-slate-600">
                <p className="mb-1">이 과제에 연결할 선수 명단이 없습니다.</p>
                <p>
                  <Link
                    href="/coach/players"
                    className="text-sky-700 underline underline-offset-2 hover:text-sky-900"
                  >
                    선수 관리
                  </Link>
                  에서 팀에 선수를 등록한 뒤, 이 블록을 쓰는 화면을 새로고침해 주세요.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-sky-200 bg-white/95 p-4">
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-500">
          <span>과제 줄 (공통 / 포지션 / 개인)</span>
          <button
            type="button"
            onClick={() =>
              setAssignmentRows((prev) => [...prev, newAssignmentRow()])
            }
            className="rounded border border-sky-300 px-2 py-0.5 text-slate-700 hover:bg-sky-50"
          >
            + 줄 추가
          </button>
        </div>
        <div className="space-y-3">
          {assignmentRows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-sky-200 bg-sky-50/80 p-3"
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
                  className="min-w-[200px] flex-1 rounded border border-sky-200 bg-white px-2 py-1.5 text-xs text-slate-900"
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
                          ? "bg-lime-500/20 text-lime-900"
                          : "bg-white text-slate-500 ring-1 ring-sky-200"
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

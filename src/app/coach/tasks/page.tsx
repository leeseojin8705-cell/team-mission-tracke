// @ts-nocheck
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  Task,
  TaskDetails,
  Team,
  Player,
  TaskCategory,
  TeamStaff,
  TaskProgress,
} from "@/lib/types";
import { FORMATION_PRESET_OPTIONS } from "@/lib/formationLayouts";
import {
  aggregatePhaseScores,
  getTaskScores,
  type EvaluationRow,
} from "@/lib/taskScore";
import { assignPlayerToUniqueSlot } from "@/lib/formationSlotAssignments";
import { FlowPitchWatermark } from "@/components/FlowLogo";

const categories: TaskCategory[] = ["기술", "체력", "멘탈", "전술"];

const MAX_SUB_POINTS = 7;

type TargetType = "team" | "player";
type HtmlTaskType = "daily" | "single";
type HtmlCategory = "selfcare" | "practice" | "practice_game" | "official" | null;

function mapHtmlCategoryToTaskCategory(cat: HtmlCategory): TaskCategory {
  if (!cat) return "기술";
  if (cat === "selfcare") return "멘탈";
  if (cat === "official") return "전술";
  if (cat === "practice_game") return "체력";
  return "기술";
}

/** FIFA 규격 비율 viewBox 105×68 (m) — 좌측이 자기 진영, 공격은 오른쪽 */
const PITCH_VB = { w: 105, h: 68 };

type FormationSlot = { x: number; y: number; label?: string; id?: string };

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

/** 교체 포인트 근처 클릭 시 삭제 판정 (SVG 좌표 단위) */
function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
const SUB_POINT_HIT_R = 3.5;

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

const FORMATION_LAYOUTS: Record<string, FormationSlot[]> = {
  "4-4-2": [
    { x: 6, y: 34, label: "GK" },
    { x: 22, y: 11 },
    { x: 22, y: 25 },
    { x: 22, y: 43 },
    { x: 22, y: 57 },
    { x: 44, y: 12 },
    { x: 44, y: 28 },
    { x: 44, y: 40 },
    { x: 44, y: 56 },
    { x: 66, y: 26 },
    { x: 66, y: 42 },
  ],
  "4-3-3": [
    { x: 6, y: 34, label: "GK" },
    { x: 22, y: 12 },
    { x: 22, y: 28 },
    { x: 22, y: 40 },
    { x: 22, y: 56 },
    { x: 44, y: 22 },
    { x: 44, y: 34 },
    { x: 44, y: 46 },
    { x: 66, y: 16 },
    { x: 66, y: 34 },
    { x: 66, y: 52 },
  ],
  "3-5-2": [
    { x: 6, y: 34, label: "GK" },
    { x: 22, y: 22 },
    { x: 22, y: 34 },
    { x: 22, y: 46 },
    { x: 42, y: 10 },
    { x: 42, y: 22 },
    { x: 42, y: 34 },
    { x: 42, y: 46 },
    { x: 42, y: 58 },
    { x: 66, y: 28 },
    { x: 66, y: 40 },
  ],
  "4-2-3-1": [
    { x: 6, y: 34, label: "GK" },
    { x: 22, y: 11 },
    { x: 22, y: 25 },
    { x: 22, y: 43 },
    { x: 22, y: 57 },
    { x: 38, y: 28 },
    { x: 38, y: 40 },
    { x: 54, y: 16 },
    { x: 54, y: 34 },
    { x: 54, y: 52 },
    { x: 70, y: 34 },
  ],
  "3-4-3": [
    { x: 6, y: 34, label: "GK" },
    { x: 22, y: 22 },
    { x: 22, y: 34 },
    { x: 22, y: 46 },
    { x: 42, y: 14 },
    { x: 42, y: 28 },
    { x: 42, y: 40 },
    { x: 42, y: 54 },
    { x: 66, y: 22 },
    { x: 66, y: 34 },
    { x: 66, y: 46 },
  ],
  "4-1-4-1": [
    { x: 6, y: 34, label: "GK" },
    { x: 22, y: 11 },
    { x: 22, y: 26 },
    { x: 22, y: 42 },
    { x: 22, y: 57 },
    { x: 36, y: 34 },
    { x: 52, y: 12 },
    { x: 52, y: 28 },
    { x: 52, y: 40 },
    { x: 52, y: 56 },
    { x: 72, y: 34 },
  ],
  "5-3-2": [
    { x: 6, y: 34, label: "GK" },
    { x: 20, y: 8 },
    { x: 20, y: 22 },
    { x: 20, y: 34 },
    { x: 20, y: 46 },
    { x: 20, y: 60 },
    { x: 44, y: 22 },
    { x: 44, y: 34 },
    { x: 44, y: 46 },
    { x: 68, y: 28 },
    { x: 68, y: 40 },
  ],
  "5-4-1": [
    { x: 6, y: 34, label: "GK" },
    { x: 20, y: 8 },
    { x: 20, y: 22 },
    { x: 20, y: 34 },
    { x: 20, y: 46 },
    { x: 20, y: 60 },
    { x: 44, y: 12 },
    { x: 44, y: 28 },
    { x: 44, y: 40 },
    { x: 44, y: 56 },
    { x: 70, y: 34 },
  ],
};

export default function CoachTasksPage() {
  const searchParams = useSearchParams();
  const lockedTeamId = (searchParams.get("teamId") ?? "").trim();
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [staff, setStaff] = useState<TeamStaff[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  // 공통 필드 (DB에 실제로 저장되는 값)
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>("기술");
  const [dueDate, setDueDate] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("team");
  const [targetId, setTargetId] = useState<string>("");
  /** 선수 과제: 동일 내용으로 여러 명에게 일괄 생성 */
  const [targetPlayerIds, setTargetPlayerIds] = useState<string[]>([]);
  /** 교체(벤치) 필드 포인트 — 선발 슬롯과 별도 색상 */
  const [formationSubPoints, setFormationSubPoints] = useState<
    { playerId: string; x: number; y: number }[]
  >([]);
  const [subBenchPickId, setSubBenchPickId] = useState<string>("");

  // 확장 UI 상태 (HTML 템플릿 반영, 현재는 미리보기/UX 용)
  const [htmlTaskType, setHtmlTaskType] = useState<HtmlTaskType>("daily");
  const [htmlCategory, setHtmlCategory] = useState<HtmlCategory>("practice");
  type TaskTypeLabel =
    | "자기관리"
    | "연습 및 훈련"
    | "연습 경기"
    | "정식 경기";
  /** 유형: 복수 선택 (첫 항목이 htmlCategory·초점 행 기준) */
  const [taskTypeSelections, setTaskTypeSelections] = useState<TaskTypeLabel[]>([
    "연습 및 훈련",
  ]);
  const [dailyStart, setDailyStart] = useState("");
  const [dailyEnd, setDailyEnd] = useState("");
  const [singleDate, setSingleDate] = useState("");
  const [weekdaySet, setWeekdaySet] = useState<Set<string>>(new Set());
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [contentTags, setContentTags] = useState<string[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [selectedEvaluatorIds, setSelectedEvaluatorIds] = useState<Set<string>>(new Set());
  const [slotPlayerAssignments, setSlotPlayerAssignments] = useState<
    Record<number, string>
  >({});
  /** true: 전체 명단에서 체크만 / false: 확정된 명단만 드래그·탭 배치 */
  const [rosterPickMode, setRosterPickMode] = useState(true);
  const [rosterSelectedIds, setRosterSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const skipRosterResetRef = useRef(false);

  /** 목업(코치-선수 과제 등록) 확장 필드 */
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
    fwWeight: number;
    mfWeight: number;
    dfWeight: number;
    gkWeight: number;
  };
  const [subFocus, setSubFocus] = useState<SubFocusOpt | null>(null);
  const [todayStrategy, setTodayStrategy] = useState("");
  const [formation, setFormation] = useState("");
  /** 자유 배치 시 이름(예: 3-2-3-2 변형) — details.formationLabel */
  const [formationNote, setFormationNote] = useState("");
  const [customFormationSlots, setCustomFormationSlots] = useState<
    FormationSlot[]
  >([]);
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const pitchSvgRef = useRef<SVGSVGElement | null>(null);
  const [assignmentRows, setAssignmentRows] = useState<AssignmentRow[]>(() => [
    {
      id: typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `r-${Date.now()}`,
      text: "",
      common: true,
      fw: false,
      mf: false,
      df: false,
      gk: false,
      individual: false,
      fwWeight: 0,
      mfWeight: 0,
      dfWeight: 0,
      gkWeight: 0,
    },
  ]);

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
      fwWeight: 0,
      mfWeight: 0,
      dfWeight: 0,
      gkWeight: 0,
    };
  }

  const assignmentWeightTotals = useMemo(() => {
    return assignmentRows.reduce(
      (acc, row) => {
        if (row.fw) acc.FW += row.fwWeight || 0;
        if (row.mf) acc.MF += row.mfWeight || 0;
        if (row.df) acc.DF += row.dfWeight || 0;
        if (row.gk) acc.GK += row.gkWeight || 0;
        return acc;
      },
      { FW: 0, MF: 0, DF: 0, GK: 0 },
    );
  }, [assignmentRows]);

  const hasAssignmentWeightOverflow = useMemo(
    () =>
      assignmentWeightTotals.FW > 100 ||
      assignmentWeightTotals.MF > 100 ||
      assignmentWeightTotals.DF > 100 ||
      assignmentWeightTotals.GK > 100,
    [assignmentWeightTotals],
  );

  function toggleTaskType(label: TaskTypeLabel) {
    setTaskTypeSelections((prev) => {
      const next = prev.includes(label)
        ? prev.filter((x) => x !== label)
        : [...prev, label];
      if (next.length === 0) return prev;

      const map: Record<string, HtmlCategory> = {
        자기관리: "selfcare",
        "연습 및 훈련": "practice",
        "연습 경기": "practice_game",
        "정식 경기": "official",
      };
      const oldCat = prev[0] ? map[prev[0]] : null;
      const newCat = next[0] ? map[next[0]] : null;
      const oldSelf = oldCat === "selfcare";
      const newSelf = newCat === "selfcare";
      if (oldSelf !== newSelf) {
        setContentTags([]);
      }
      setHtmlCategory(newCat);
      return next;
    });
  }

  function toggleFocusTag(id: string) {
    setContentTags((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const resolvedContentCategory = useMemo((): NonNullable<
    TaskDetails["contentCategory"]
  > => {
    if (!htmlCategory) return "기술";
    if (htmlCategory === "selfcare") return "멘탈";
    const mapCat: Record<
      string,
      "기술" | "신체" | "전술" | "심리" | "인지" | "태도"
    > = {
      skill: "기술",
      physical: "신체",
      tactical: "전술",
      mental: "심리",
      cognitive: "인지",
      attitude: "태도",
    };
    const first = contentTags[0];
    return first ? mapCat[first] ?? "기술" : "기술";
  }, [htmlCategory, contentTags]);

  const focusAxisOptions: { id: string; label: string }[] = [
    { id: "skill", label: "기술" },
    { id: "physical", label: "신체" },
    { id: "tactical", label: "전술" },
    { id: "mental", label: "심리" },
    { id: "cognitive", label: "인지" },
    { id: "attitude", label: "태도" },
  ];

  const subFocusOptions: SubFocusOpt[] = [
    "이해",
    "응용",
    "활용",
    "전략",
    "점검",
    "평가",
  ];

  const teamOptions = useMemo(
    () =>
      teams
        .filter((t) => !lockedTeamId || t.id === lockedTeamId)
        .map((t) => ({ id: t.id, name: t.name })),
    [teams, lockedTeamId],
  );
  const playerOptions = useMemo(
    () =>
      players
        .filter((p) => !lockedTeamId || p.teamId === lockedTeamId)
        .map((p) => ({ id: p.id, name: p.name })),
    [players, lockedTeamId],
  );

  const submitBlockedReason = useMemo(() => {
    if (submitting) return null;
    if (targetType === "team" && !targetId) {
      return "과제 대상(팀)을 선택해 주세요.";
    }
    if (targetType === "player" && targetPlayerIds.length === 0) {
      return "과제 대상 선수를 한 명 이상 선택해 주세요.";
    }
    if (targetType === "team" && teamOptions.length === 0) {
      return "등록된 팀이 없습니다. 조직·팀을 먼저 만든 뒤 다시 시도해 주세요.";
    }
    if (targetType === "player" && playerOptions.length === 0) {
      return "등록된 선수가 없습니다. 선수 관리에서 선수를 등록해 주세요.";
    }
    if (
      !title.trim() &&
      !assignmentRows.some((r) => r.text.trim())
    ) {
      return "과제 제목을 입력하거나, 과제 줄에 최소 한 줄 이상 입력해 주세요.";
    }
    return null;
  }, [
    submitting,
    targetId,
    targetPlayerIds.length,
    targetType,
    teamOptions.length,
    playerOptions.length,
    title,
    assignmentRows,
  ]);

  // 현재 과제가 연결될 팀 id (팀 과제면 그 팀, 선수 과제면 선택 선수들의 팀 — 동일 팀만 허용)
  const currentTeamIdForTask = useMemo(() => {
    if (targetType === "team" && targetId) return targetId;
    if (targetType === "player" && targetPlayerIds.length > 0) {
      const p = players.find((pl) => pl.id === targetPlayerIds[0]);
      return p?.teamId ?? null;
    }
    return null;
  }, [players, targetPlayerIds, targetId, targetType]);

  // 엔트리/선수 지정 후보: 현재 팀 소속 선수들만
  const entryCandidatePlayers = useMemo(() => {
    if (!currentTeamIdForTask) return players;
    return players.filter((p) => p.teamId === currentTeamIdForTask);
  }, [currentTeamIdForTask, players]);
  const entryPlayerMap = useMemo(
    () => Object.fromEntries(entryCandidatePlayers.map((p) => [p.id, p])),
    [entryCandidatePlayers],
  );
  const assignedPlayerIds = useMemo(
    () => new Set(Object.values(slotPlayerAssignments)),
    [slotPlayerAssignments],
  );

  const subBenchCandidates = useMemo(
    () =>
      entryCandidatePlayers.filter(
        (p) =>
          rosterSelectedIds.has(p.id) &&
          !assignedPlayerIds.has(p.id) &&
          !formationSubPoints.some((s) => s.playerId === p.id),
      ),
    [
      entryCandidatePlayers,
      rosterSelectedIds,
      assignedPlayerIds,
      formationSubPoints,
    ],
  );

  useEffect(() => {
    setFormationSubPoints((prev) =>
      prev.filter((sp) => !assignedPlayerIds.has(sp.playerId)),
    );
  }, [assignedPlayerIds]);

  const formationDragPlayers = useMemo(
    () =>
      rosterPickMode
        ? []
        : entryCandidatePlayers.filter((p) => rosterSelectedIds.has(p.id)),
    [rosterPickMode, entryCandidatePlayers, rosterSelectedIds],
  );

  const slotAllowedPlayerIds = useMemo(() => {
    if (rosterPickMode) {
      return new Set(entryCandidatePlayers.map((p) => p.id));
    }
    return rosterSelectedIds;
  }, [rosterPickMode, entryCandidatePlayers, rosterSelectedIds]);

  const entryRosterKey = useMemo(
    () =>
      `${currentTeamIdForTask ?? "none"}:${entryCandidatePlayers.map((p) => p.id).join(",")}`,
    [currentTeamIdForTask, entryCandidatePlayers],
  );

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

  useEffect(() => {
    setSlotPlayerAssignments((prev) => {
      const maxSlot = Math.max(0, displayFormationSlots.length - 1);
      const allowedIds = slotAllowedPlayerIds;
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const idx = Number(k);
        if (!Number.isFinite(idx) || idx < 0 || idx > maxSlot) continue;
        if (!allowedIds.has(v)) continue;
        next[idx] = v;
      }
      return next;
    });
  }, [displayFormationSlots, slotAllowedPlayerIds]);

  useEffect(() => {
    if (skipRosterResetRef.current) {
      skipRosterResetRef.current = false;
      return;
    }
    const list = entryCandidatePlayers;
    if (list.length === 0) {
      setRosterSelectedIds(new Set());
      setRosterPickMode(true);
      return;
    }
    setRosterSelectedIds(new Set(list.map((p) => p.id)));
    setRosterPickMode(true);
  }, [entryRosterKey]);

  const [filterType, setFilterType] = useState<TargetType | "all">("all");
  const [filterTeamId, setFilterTeamId] = useState<string>("all");
  const [filterPlayerId, setFilterPlayerId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "overdue">("all");
  const [taskSortOrder, setTaskSortOrder] = useState<"dueDate" | "title">("dueDate");
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [taskPeriodPreset, setTaskPeriodPreset] = useState<"all" | "30d" | "custom">("all");
  const [taskDateFrom, setTaskDateFrom] = useState("");
  const [taskDateTo, setTaskDateTo] = useState("");
  const [selectedTaskForModal, setSelectedTaskForModal] = useState<Task | null>(null);
  const [taskProgressList, setTaskProgressList] = useState<TaskProgress[]>([]);
  const [progressSaving, setProgressSaving] = useState<string | null>(null);
  const [showLoadFromTaskModal, setShowLoadFromTaskModal] = useState(false);
  const [taskSummaries, setTaskSummaries] = useState<Record<string, {
    taskId: string;
    completed: number;
    total: number;
    understanding: number;
    achievement: number;
    evaluation: number;
  }>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [teamsRes, playersRes, tasksRes] = await Promise.all([
          fetch("/api/teams"),
          fetch("/api/players"),
          fetch("/api/tasks"),
        ]);

        if (!teamsRes.ok || !playersRes.ok || !tasksRes.ok) {
          throw new Error("데이터를 불러오지 못했습니다.");
        }

        const [teamsData, playersData, tasksDataRaw]: [Team[], Player[], any[]] =
          await Promise.all([
            teamsRes.json(),
            playersRes.json(),
            tasksRes.json(),
          ]);

        if (!cancelled) {
          setTeams(teamsData);
          setPlayers(playersData);
          const tasksData: Task[] = tasksDataRaw.map((t) => ({
            ...t,
            dueDate:
              t.dueDate && typeof t.dueDate !== "string"
                ? new Date(t.dueDate as unknown as string).toISOString()
                : t.dueDate,
            details:
              typeof t.details === "string"
                ? (() => {
                    try {
                      return JSON.parse(t.details);
                    } catch {
                      return null;
                    }
                  })()
                : t.details ?? null,
          }));
          setTasks(tasksData);

          if (targetType === "team" && !targetId) {
            const firstTeam = lockedTeamId
              ? teamsData.find((t) => t.id === lockedTeamId)
              : teamsData[0];
            if (firstTeam) setTargetId(firstTeam.id);
          } else if (targetType === "player") {
            const firstPlayer = lockedTeamId
              ? playersData.find((p) => p.teamId === lockedTeamId)
              : playersData[0];
            if (firstPlayer) {
              setTargetPlayerIds((prev) =>
                prev.length === 0 ? [firstPlayer.id] : prev,
              );
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [targetId, targetType, lockedTeamId]);

  useEffect(() => {
    if (!lockedTeamId) return;
    if (targetType === "team") {
      if (targetId !== lockedTeamId) {
        setTargetId(lockedTeamId);
      }
      return;
    }
    if (targetType === "player") {
      const scopedPlayers = players.filter((p) => p.teamId === lockedTeamId);
      if (scopedPlayers.length === 0) {
        setTargetPlayerIds([]);
        return;
      }
      const allowed = new Set(scopedPlayers.map((p) => p.id));
      const next = targetPlayerIds.filter((id) => allowed.has(id));
      if (next.length === 0) {
        setTargetPlayerIds([scopedPlayers[0].id]);
      } else if (next.length !== targetPlayerIds.length) {
        setTargetPlayerIds(next);
      }
    }
  }, [lockedTeamId, players, targetPlayerIds, targetType]);

  // 현재 대상 팀 기준으로 코칭 스텝(평가자 후보) 불러오기
  useEffect(() => {
    let cancelled = false;

    async function loadStaff() {
      try {
        // 대상 팀 id 결정
        let teamIdForStaff: string | null = null;
        if (targetType === "team" && targetId) {
          teamIdForStaff = targetId;
        } else if (targetType === "player" && targetPlayerIds.length > 0) {
          const player = players.find((p) => p.id === targetPlayerIds[0]);
          teamIdForStaff = player?.teamId ?? null;
        }
        if (!teamIdForStaff) {
          if (!cancelled) setStaff([]);
          return;
        }

        const res = await fetch(`/api/teams/${teamIdForStaff}/staff`);
        if (!res.ok) {
          if (!cancelled) setStaff([]);
          return;
        }
        const data = (await res.json()) as TeamStaff[];
        if (!cancelled) {
          // 기본은 지도(true)로 체크된 코치들만 우선 사용,
          // 한 명도 없으면 팀 전체 스태프를 후보로 사용
          const guidance = data.filter((s) => s.guidance);
          setStaff(guidance.length > 0 ? guidance : data);
        }
      } catch {
        if (!cancelled) setStaff([]);
      }
    }

    loadStaff();

    return () => {
      cancelled = true;
    };
  }, [players, targetId, targetType, targetPlayerIds]);

  useEffect(() => {
    if (!selectedTaskForModal?.id) {
      setTaskProgressList([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/task-progress?taskId=${encodeURIComponent(selectedTaskForModal.id)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: TaskProgress[]) => {
        if (!cancelled) setTaskProgressList(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setTaskProgressList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTaskForModal?.id]);

  async function saveTaskProgress(playerId: string, completed: boolean, note: string) {
    if (!selectedTaskForModal?.id) return;
    setProgressSaving(playerId);
    try {
      const res = await fetch("/api/task-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: selectedTaskForModal.id,
          playerId,
          completed,
          note: note ?? "",
        }),
      });
      if (res.ok) {
        const updated = (await res.json()) as TaskProgress;
        setTaskProgressList((prev) => {
          const rest = prev.filter((p) => p.playerId !== playerId);
          return [...rest, updated];
        });
      }
    } finally {
      setProgressSaving(null);
    }
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setCategory("기술");
    setDueDate("");
    setTargetType("team");
    setTargetId(teams[0]?.id ?? "");
    setHtmlTaskType("daily");
    setTaskTypeSelections(["연습 및 훈련"]);
    setHtmlCategory("practice");
    setDailyStart("");
    setDailyEnd("");
    setSingleDate("");
    setWeekdaySet(new Set());
    setTimeStart("");
    setTimeEnd("");
    setContentTags([]);
    setSelectedPlayerIds(new Set());
    setSelectedEvaluatorIds(new Set());
    skipRosterResetRef.current = true;
    {
      const tid = teams[0]?.id ?? "";
      const list = tid
        ? players.filter(
            (p) =>
              p.teamId === tid &&
              (!lockedTeamId || p.teamId === lockedTeamId),
          )
        : [];
      setRosterSelectedIds(new Set(list.map((p) => p.id)));
      setRosterPickMode(true);
    }
    setSlotPlayerAssignments({});
    setSubFocus(null);
    setTodayStrategy("");
    setFormation("");
    setFormationNote("");
    setCustomFormationSlots([]);
    setDraggingSlotId(null);
    setAssignmentRows([newAssignmentRow()]);
    setTargetPlayerIds([]);
    setFormationSubPoints([]);
    setSubBenchPickId("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (targetType === "team" && !targetId) return;
    if (targetType === "player" && targetPlayerIds.length === 0) return;

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
        weights: {
          ...(r.fw ? { FW: r.fwWeight || 0 } : {}),
          ...(r.mf ? { MF: r.mfWeight || 0 } : {}),
          ...(r.df ? { DF: r.dfWeight || 0 } : {}),
          ...(r.gk ? { GK: r.gkWeight || 0 } : {}),
        },
      }));

    if (hasAssignmentWeightOverflow) {
      setError("포지션별 과제 가중치 합이 100%를 넘었습니다. 과제 줄 가중치를 조정해 주세요.");
      return;
    }

    const assignmentTexts = assignmentLines.map((l) => l.text);
    if (
      assignmentTexts.length > 1 &&
      new Set(assignmentTexts).size !== assignmentTexts.length
    ) {
      setError(
        "과제 줄에 동일한 문구가 중복되었습니다. 각 줄의 내용을 구분해 주세요.",
      );
      return;
    }

    const resolvedTitle =
      title.trim() ||
      assignmentLines[0]?.text ||
      "";
    if (!resolvedTitle) return;

    const starterIds = new Set(Object.values(slotPlayerAssignments));
    if (formationSubPoints.length > MAX_SUB_POINTS) {
      setError(`교체 포인트는 최대 ${MAX_SUB_POINTS}명까지 지정할 수 있습니다.`);
      return;
    }
    for (const sp of formationSubPoints) {
      if (starterIds.has(sp.playerId)) {
        setError(
          "교체 포인트는 선발 슬롯에 배치한 선수와 겹칠 수 없습니다. 슬롯에서 먼저 빼거나 교체 마커를 조정해 주세요.",
        );
        return;
      }
    }

    // HTML 과제 유형/분류 → 기존 Task 필드로 매핑
    const mappedCategory = mapHtmlCategoryToTaskCategory(htmlCategory);
    const mappedDueDate =
      htmlTaskType === "single"
        ? singleDate || dueDate
        : dailyEnd || dueDate;

    const finalCategory = mappedCategory ?? category;
    const finalDueDate = mappedDueDate || undefined;

    const details = {
      htmlTaskType,
      htmlCategory,
      taskType: taskTypeSelections[0] ?? "연습 및 훈련",
      taskTypes:
        taskTypeSelections.length > 1 ? taskTypeSelections : undefined,
      contentCategory: resolvedContentCategory,
      contents: contentTags.length ? contentTags : undefined,
      dailyStart: dailyStart || undefined,
      dailyEnd: dailyEnd || undefined,
      singleDate: singleDate || undefined,
      weekdays: weekdaySet.size ? Array.from(weekdaySet) : undefined,
      timeStart: timeStart || undefined,
      timeEnd: timeEnd || undefined,
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
        Object.keys(slotPlayerAssignments).length > 0
          ? Object.entries(slotPlayerAssignments)
              .map(([slot, playerId]) => ({
                slot: Number(slot),
                playerId,
              }))
              .filter((x) => Number.isFinite(x.slot) && x.slot >= 0 && Boolean(x.playerId))
          : undefined,
      assignmentLines: assignmentLines.length ? assignmentLines : undefined,
      players:
        rosterSelectedIds.size > 0
          ? Array.from(rosterSelectedIds)
          : undefined,
      evaluators:
        selectedEvaluatorIds.size > 0
          ? Array.from(selectedEvaluatorIds)
          : undefined,
      formationSubPoints:
        formationSubPoints.length > 0 ? formationSubPoints : undefined,
    };

    try {
      setSubmitting(true);
      setError(null);

      if (editingId) {
        const patchTargetId =
          targetType === "team"
            ? targetId
            : targetPlayerIds[0] ?? targetId;
        const res = await fetch(`/api/tasks/${editingId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: resolvedTitle,
            category: finalCategory,
            dueDate: finalDueDate,
            targetType,
            targetId: patchTargetId,
            details,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          let msg = "과제를 수정하지 못했습니다.";
          try {
            const j = JSON.parse(text) as { error?: string };
            if (j.error) msg = j.error;
          } catch {
            if (text) msg = text;
          }
          throw new Error(msg);
        }

        const updated: Task = await res.json();
        setTasks((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t)),
        );
      } else {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: resolvedTitle,
            category: finalCategory,
            dueDate: finalDueDate,
            targetType,
            targetId:
              targetType === "player" ? targetPlayerIds[0] ?? "" : targetId,
            targetIds: targetType === "player" ? targetPlayerIds : undefined,
            details,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          let msg = "과제를 저장하지 못했습니다.";
          try {
            const j = JSON.parse(text) as { error?: string };
            if (j.error) msg = j.error;
          } catch {
            if (text) msg = text;
          }
          throw new Error(msg);
        }

        const data = (await res.json()) as { created?: Task[] };
        const created = Array.isArray(data.created) ? data.created : [];
        setTasks((prev) => [...prev, ...created]);
      }

      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function fillFormFromTask(task: Task, asEdit: boolean) {
    if (asEdit) setEditingId(task.id);
    else setEditingId(null);
    setTitle(task.title);
    setCategory(task.category);
    setDueDate(
      task.dueDate && typeof task.dueDate === "string" ? task.dueDate : "",
    );

    if (task.details) {
      setHtmlTaskType(task.details.htmlTaskType ?? "daily");
      const d = task.details as TaskDetails;
      const tts = d.taskTypes;
      if (Array.isArray(tts) && tts.length > 0) {
        setTaskTypeSelections(tts);
      } else if (d.taskType) {
        setTaskTypeSelections([d.taskType]);
      } else {
        setTaskTypeSelections(["연습 및 훈련"]);
      }
      const mapCat: Record<string, HtmlCategory> = {
        자기관리: "selfcare",
        "연습 및 훈련": "practice",
        "연습 경기": "practice_game",
        "정식 경기": "official",
      };
      const primary = (Array.isArray(tts) && tts.length > 0
        ? tts[0]
        : d.taskType) ?? "연습 및 훈련";
      setHtmlCategory(d.htmlCategory ?? mapCat[primary] ?? null);
      setDailyStart(task.details.dailyStart ?? "");
      setDailyEnd(task.details.dailyEnd ?? "");
      setSingleDate(task.details.singleDate ?? "");
      setWeekdaySet(
        new Set<string>(Array.isArray(task.details.weekdays) ? task.details.weekdays : []),
      );
      setTimeStart(task.details.timeStart ?? "");
      setTimeEnd(task.details.timeEnd ?? "");
      setContentTags(
        Array.isArray(task.details.contents)
          ? (task.details.contents as string[])
          : [],
      );
      setSelectedPlayerIds(
        new Set<string>(
          Array.isArray(task.details.players)
            ? (task.details.players as string[])
            : [],
        ),
      );
      setSelectedEvaluatorIds(
        new Set<string>(
          Array.isArray(task.details.evaluators)
            ? (task.details.evaluators as string[])
            : [],
        ),
      );
      const fp = (task.details as { formationPlayerAssignments?: unknown })
        .formationPlayerAssignments;
      if (Array.isArray(fp)) {
        const mapped: Record<number, string> = {};
        for (const row of fp as { slot?: number; playerId?: string }[]) {
          if (typeof row.slot === "number" && typeof row.playerId === "string") {
            mapped[row.slot] = row.playerId;
          }
        }
        setSlotPlayerAssignments(mapped);
      } else {
        setSlotPlayerAssignments({});
      }
      {
        const fsp = (task.details as TaskDetails)?.formationSubPoints;
        if (Array.isArray(fsp)) {
          setFormationSubPoints(
            fsp.filter(
              (x): x is { playerId: string; x: number; y: number } =>
                typeof (x as { playerId?: unknown }).playerId === "string" &&
                typeof (x as { x?: unknown }).x === "number" &&
                typeof (x as { y?: unknown }).y === "number",
            ),
          );
        } else {
          setFormationSubPoints([]);
        }
      }
      setSubFocus(
        (task.details as { subFocus?: SubFocusOpt }).subFocus ?? null,
      );
      setTodayStrategy(
        (task.details as { todayStrategy?: string }).todayStrategy ?? "",
      );
      setFormation((task.details as { formation?: string }).formation ?? "");
      setFormationNote(
        (task.details as { formationLabel?: string }).formationLabel ?? "",
      );
      const fc = (task.details as { formationCustomSlots?: unknown })
        .formationCustomSlots;
      if (
        (task.details as { formation?: string }).formation === "custom" &&
        Array.isArray(fc) &&
        fc.length > 0
      ) {
        setCustomFormationSlots(
          fc.map((row: { x?: number; y?: number; label?: string }) => ({
            x: typeof row.x === "number" ? row.x : 0,
            y: typeof row.y === "number" ? row.y : 34,
            ...(row.label ? { label: row.label } : {}),
            id: newFormationSlotId(),
          })),
        );
      } else {
        setCustomFormationSlots([]);
      }
      const al = (task.details as { assignmentLines?: unknown })
        .assignmentLines;
      if (Array.isArray(al) && al.length > 0) {
        setAssignmentRows(
          al.map((row: { text?: string; scopes?: string[] }) => ({
            id: newAssignmentRow().id,
            text: typeof row.text === "string" ? row.text : "",
            common: Array.isArray(row.scopes) && row.scopes.includes("공통과제"),
            fw: Array.isArray(row.scopes) && row.scopes.includes("FW"),
            mf: Array.isArray(row.scopes) && row.scopes.includes("MF"),
            df: Array.isArray(row.scopes) && row.scopes.includes("DF"),
            gk: Array.isArray(row.scopes) && row.scopes.includes("GK"),
            individual:
              Array.isArray(row.scopes) && row.scopes.includes("개인과제"),
            fwWeight:
              typeof (row as { weights?: { FW?: number } }).weights?.FW === "number"
                ? Math.max(0, Math.min(100, (row as { weights?: { FW?: number } }).weights!.FW!))
                : 0,
            mfWeight:
              typeof (row as { weights?: { MF?: number } }).weights?.MF === "number"
                ? Math.max(0, Math.min(100, (row as { weights?: { MF?: number } }).weights!.MF!))
                : 0,
            dfWeight:
              typeof (row as { weights?: { DF?: number } }).weights?.DF === "number"
                ? Math.max(0, Math.min(100, (row as { weights?: { DF?: number } }).weights!.DF!))
                : 0,
            gkWeight:
              typeof (row as { weights?: { GK?: number } }).weights?.GK === "number"
                ? Math.max(0, Math.min(100, (row as { weights?: { GK?: number } }).weights!.GK!))
                : 0,
          })),
        );
      } else {
        setAssignmentRows([newAssignmentRow()]);
      }
    } else {
      setSlotPlayerAssignments({});
      setFormationSubPoints([]);
    }

    {
      const teamIdForRoster =
        task.teamId ??
        (task.playerId
          ? players.find((pl) => pl.id === task.playerId)?.teamId
          : null);
      const candidates = teamIdForRoster
        ? players.filter(
            (pl) =>
              pl.teamId === teamIdForRoster &&
              (!lockedTeamId || pl.teamId === lockedTeamId),
          )
        : [];
      const savedPl =
        task.details && Array.isArray((task.details as TaskDetails).players)
          ? ((task.details as TaskDetails).players as string[])
          : [];
      skipRosterResetRef.current = true;
      if (savedPl.length > 0) {
        setRosterSelectedIds(new Set(savedPl));
        setRosterPickMode(false);
      } else {
        setRosterSelectedIds(new Set(candidates.map((c) => c.id)));
        setRosterPickMode(true);
      }
    }

    if (task.teamId) {
      setTargetType("team");
      setTargetId(task.teamId);
      setTargetPlayerIds([]);
    } else if (task.playerId) {
      setTargetType("player");
      setTargetId(task.playerId);
      setTargetPlayerIds([task.playerId]);
    }
  }

  function handleEdit(task: Task) {
    fillFormFromTask(task, true);
  }

  function loadFromTask(task: Task) {
    fillFormFromTask(task, false);
    setShowLoadFromTaskModal(false);
  }

  async function handleDelete(id: string) {
    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("과제를 삭제하지 못했습니다.");
      }

      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) {
        resetForm();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const visibleTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 기간 필터용 from/to 계산
    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;
    if (taskPeriodPreset === "30d") {
      to = now;
      from = new Date(now);
      from.setDate(from.getDate() - 30);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    } else if (taskPeriodPreset === "custom") {
      if (taskDateFrom) {
        const f = new Date(taskDateFrom);
        if (!Number.isNaN(f.getTime())) {
          f.setHours(0, 0, 0, 0);
          from = f;
        }
      }
      if (taskDateTo) {
        const t = new Date(taskDateTo);
        if (!Number.isNaN(t.getTime())) {
          t.setHours(23, 59, 59, 999);
          to = t;
        }
      }
    }

    const filtered = tasks.filter((task) => {
      // 사이드바 링크 ?teamId= 로 특정 팀 컨텍스트일 때: 그 팀 과제만 표시 (다른 팀 과제는 숨김)
      if (lockedTeamId) {
        const taskTeamId =
          task.teamId ??
          (task.playerId
            ? players.find((p) => p.id === task.playerId)?.teamId
            : undefined);
        if (taskTeamId !== lockedTeamId) return false;
      }

      // 선수 개인이 만든 개인 과제( playerId 가 있고, 평가자를 지정한 경우 )는
      // 이 화면(팀/코치 과제 관리)에서는 제외한다.
      if (task.playerId && Array.isArray(task.details?.evaluators) && task.details.evaluators.length > 0) {
        return false;
      }

      if (filterType === "team") {
        if (!task.teamId) return false;
        if (filterTeamId !== "all" && task.teamId !== filterTeamId) return false;
      } else if (filterType === "player") {
        if (!task.playerId) return false;
        if (filterPlayerId !== "all" && task.playerId !== filterPlayerId)
          return false;
      }

      if (statusFilter !== "all" || taskPeriodPreset !== "all") {
        if (!task.dueDate) return false;
        const d = new Date(task.dueDate);
        if (Number.isNaN(d.getTime())) return false;
        d.setHours(0, 0, 0, 0);
        const isActive = d >= today;
        if (statusFilter === "active" && !isActive) return false;
        if (statusFilter === "overdue" && isActive) return false;

        // 기간 필터: 마감일 기준으로 from/to 안에 있는 과제만
        if (from && d < from) return false;
        if (to && d > to) return false;
      }

      const q = taskSearchQuery.trim().toLowerCase();
      if (q && !(task.title ?? "").toLowerCase().includes(q)) return false;

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (taskSortOrder === "dueDate") {
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (aDue !== bDue) return aDue - bDue;
      }
      return (a.title ?? "").localeCompare(b.title ?? "", "ko");
    });
    return sorted;
  }, [
    tasks,
    players,
    lockedTeamId,
    filterType,
    filterTeamId,
    filterPlayerId,
    statusFilter,
    taskSortOrder,
    taskSearchQuery,
    taskPeriodPreset,
    taskDateFrom,
    taskDateTo,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummaries() {
      if (visibleTasks.length === 0) {
        setTaskSummaries({});
        return;
      }

      try {
        const next: typeof taskSummaries = {};

        await Promise.all(
          visibleTasks.map(async (t) => {
            // 1) TaskProgress: 완료/전체
            let completed = 0;
            let total = 0;
            try {
              const res = await fetch(`/api/task-progress?taskId=${encodeURIComponent(t.id)}`);
              if (res.ok) {
                const list: { completed: boolean }[] = await res.json();
                total = list.length;
                completed = list.filter((p) => p.completed).length;
              }
            } catch {
              // ignore
            }

            // 2) PlayerEvaluation: 이해/달성/코치 평균
            let understanding = 0;
            let achievement = 0;
            let evaluation = 0;

            if (t.teamId) {
              try {
                const evalRes = await fetch(
                  `/api/teams/${encodeURIComponent(
                    t.teamId,
                  )}/player-evaluations?taskId=${encodeURIComponent(t.id)}`,
                );
                if (evalRes.ok) {
                  const evalList = (await evalRes.json()) as EvaluationRow[];
                  if (evalList.length > 0) {
                    const byPhase = aggregatePhaseScores(evalList);
                    const playerIds = Object.keys(byPhase);
                    if (playerIds.length > 0) {
                      let sumU = 0;
                      let sumA = 0;
                      let sumE = 0;
                      for (const pid of playerIds) {
                        const s = getTaskScores(byPhase, pid);
                        sumU += s.understanding;
                        sumA += s.achievement;
                        sumE += s.evaluation;
                      }
                      understanding = sumU / playerIds.length;
                      achievement = sumA / playerIds.length;
                      evaluation = sumE / playerIds.length;
                    }
                  }
                }
              } catch {
                // ignore
              }
            }

            next[t.id] = {
              taskId: t.id,
              completed,
              total,
              understanding,
              achievement,
              evaluation,
            };
          }),
        );

        if (!cancelled) {
          setTaskSummaries(next);
        }
      } catch {
        if (!cancelled) setTaskSummaries({});
      }
    }

    loadSummaries();
    return () => {
      cancelled = true;
    };
  }, [visibleTasks]);

  const summary = useMemo(() => {
    const total = tasks.length;
    const teamCount = tasks.filter((t) => t.teamId).length;
    const playerCount = tasks.filter((t) => t.playerId).length;
    const now = new Date();
    let active = 0;
    let overdue = 0;
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      if (Number.isNaN(d.getTime())) continue;
      if (d >= new Date(now.toDateString())) active += 1;
      else overdue += 1;
    }
    return { total, teamCount, playerCount, active, overdue };
  }, [tasks]);

  return (
    <div className="space-y-4 rounded-2xl border border-white/60 bg-white/95 p-4 shadow-md shadow-sky-900/10 text-slate-800 md:p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900">과제 관리</h2>
        <p className="text-sm text-slate-600">
          팀 전체 공식 과제와 선수 개인 과제가 Prisma + SQLite DB에 실제로 저장됩니다.
        </p>
      </header>

      {/* 과제 현황 카드 */}
      <div className="grid gap-3 rounded-2xl border border-sky-200/90 bg-white/92 p-3 text-xs text-slate-700 md:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setFilterType("all");
            setStatusFilter("all");
          }}
          className="flex flex-col justify-between rounded-xl bg-sky-50/92 p-3 text-left hover:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 border border-transparent"
        >
          <div className="text-[11px] text-slate-400">전체 과제</div>
          <div className="mt-1 text-2xl font-semibold text-sky-600">
            {summary.total}
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            setFilterType("team");
            setStatusFilter("all");
          }}
          className="flex flex-col justify-between rounded-xl bg-sky-50/92 p-3 text-left hover:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 border border-transparent"
        >
          <div className="text-[11px] text-slate-400">팀 과제</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {summary.teamCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">팀에 걸린 공통 과제 수</div>
        </button>
        <button
          type="button"
          onClick={() => {
            setFilterType("player");
            setStatusFilter("all");
          }}
          className="flex flex-col justify-between rounded-xl bg-sky-50/92 p-3 text-left hover:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 border border-transparent"
        >
          <div className="text-[11px] text-slate-400">개인 과제</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {summary.playerCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">선수 개인별 과제 수</div>
        </button>
        <button
          type="button"
          onClick={() =>
            setStatusFilter((prev) =>
              prev === "active" ? "overdue" : "active",
            )
          }
          className="flex flex-col justify-between rounded-xl bg-sky-50/92 p-3 text-left hover:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 border border-transparent"
        >
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>진행 / 마감</span>
            <span className="rounded-full bg-sky-200 px-2 py-0.5 text-[10px] text-slate-600">
              {statusFilter === "all"
                ? "전체"
                : statusFilter === "active"
                  ? "진행만"
                  : "마감만"}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-lg font-semibold text-sky-600">
              {summary.active}
            </span>
            <span className="text-sm text-slate-400">진행 중</span>
          </div>
          <div className="mt-0.5 text-[11px] text-rose-600">
            마감 지난 과제 {summary.overdue}개
          </div>
        </button>
      </div>

      {/* 선택된 조건 과제 요약 (위쪽에 바로 확인) */}
      <div className="rounded-2xl border border-sky-200/90 bg-sky-50/88 p-3 text-xs text-slate-700">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sky-200 px-2 py-1 text-[11px] text-slate-700">
              {filterType === "all"
                ? "대상: 전체"
                : filterType === "team"
                  ? "대상: 팀 과제"
                  : "대상: 개인 과제"}
            </span>
            <span className="rounded-full bg-sky-200 px-2 py-1 text-[11px] text-slate-700">
              상태:{" "}
              {statusFilter === "all"
                ? "전체"
                : statusFilter === "active"
                  ? "진행 중만"
                  : "마감 지난 과제만"}
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            현재 조건에 해당하는 과제 {visibleTasks.length}개
          </span>
        </div>
        {visibleTasks.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            선택된 조건에 해당하는 과제가 없습니다. 위 카드나 필터를 변경해 보세요.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleTasks.slice(0, 6).map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/92 px-3 py-1.5 text-left"
              >
                <button
                  type="button"
                  onClick={() => setSelectedTaskForModal(task)}
                  className="flex flex-1 items-center gap-2 text-left hover:text-sky-800"
                >
                  <span className="rounded-full bg-sky-200 px-2 py-0.5 text-[10px] text-slate-600">
                    {task.teamId ? "팀" : task.playerId ? "선수" : "기타"}
                  </span>
                  <span className="text-[12px] font-medium text-slate-900">
                    {task.title}
                  </span>
                  {task.dueDate && (
                    <span className="text-[10px] text-slate-400">
                      마감 {String(task.dueDate).slice(0, 10)}
                    </span>
                  )}
                </button>
                {task.teamId && (
                  <Link
                    href={`/coach/tasks/${task.id}/results`}
                    className="rounded-md border border-sky-300 px-2 py-1 text-[10px] text-slate-700 hover:border-sky-500 hover:text-sky-800"
                  >
                    평가 결과
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 상단 필터 */}
      <div className="flex flex-col gap-2 rounded-2xl border border-sky-200/90 bg-sky-50/85 p-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px]">목록 필터</span>
          <input
            type="text"
            value={taskSearchQuery}
            onChange={(e) => setTaskSearchQuery(e.target.value)}
            placeholder="제목 검색"
            className="w-28 rounded-md border border-sky-200 bg-white px-2 py-1 text-xs outline-none focus:border-sky-500 placeholder:text-slate-500"
          />
          <select
            value={filterType}
            onChange={(e) => {
              const value = e.target.value as typeof filterType;
              setFilterType(value);
            }}
            className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs outline-none focus:border-sky-500"
          >
            <option value="all">전체</option>
            <option value="team">팀 과제만</option>
            <option value="player">개인 과제만</option>
          </select>
          {filterType === "team" && (
            <select
              value={filterTeamId}
              onChange={(e) => setFilterTeamId(e.target.value)}
              className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs outline-none focus:border-sky-500"
            >
              <option value="all">모든 팀</option>
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {filterType === "player" && (
            <select
              value={filterPlayerId}
              onChange={(e) => setFilterPlayerId(e.target.value)}
              className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs outline-none focus:border-sky-500"
            >
              <option value="all">모든 선수</option>
              {playerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <span className="text-slate-500">|</span>
          <select
            value={taskSortOrder}
            onChange={(e) => setTaskSortOrder(e.target.value as "dueDate" | "title")}
            className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs outline-none focus:border-sky-500"
          >
            <option value="dueDate">마감일 순</option>
            <option value="title">제목 순</option>
          </select>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-[11px]">마감일 기간</span>
          <select
            value={taskPeriodPreset}
            onChange={(e) =>
              setTaskPeriodPreset(e.target.value as "all" | "30d" | "custom")
            }
            className="rounded-md border border-sky-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-sky-500"
          >
            <option value="all">전체</option>
            <option value="30d">최근 30일(마감 기준)</option>
            <option value="custom">직접 선택</option>
          </select>
          {taskPeriodPreset === "custom" && (
            <>
              <input
                type="date"
                value={taskDateFrom}
                onChange={(e) => setTaskDateFrom(e.target.value)}
                className="rounded-md border border-sky-200 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-sky-500"
              />
              <span className="text-[11px] text-slate-500">~</span>
              <input
                type="date"
                value={taskDateTo}
                onChange={(e) => setTaskDateTo(e.target.value)}
                className="rounded-md border border-sky-200 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-sky-500"
              />
            </>
          )}
        </div>
        <span className="text-[11px] text-slate-400">
          표시: {visibleTasks.length}개 / 총 {tasks.length}개
        </span>
      </div>

      {/* 과제 등록 폼 — 코치-선수 과제 등록(목업) */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border-2 border-lime-400/40 bg-white/95 text-sm shadow-lg shadow-lime-500/5"
      >
        <div className="bg-gradient-to-r from-sky-400 to-cyan-500 px-4 py-3 text-center">
          <p className="text-xs font-bold tracking-[0.2em] text-slate-900">
            TEAM MISSION TRACKER
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-slate-950">
            코치-선수 과제 등록
          </h2>
        </div>
        <div className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200/90 pb-3">
          <span className="text-xs font-semibold text-slate-600">과제 등록</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-sky-300 bg-sky-200 px-3 py-1.5 text-[11px] text-slate-700 hover:bg-sky-200"
            >
              새로 작성
            </button>
            <button
              type="button"
              onClick={() => setShowLoadFromTaskModal(true)}
              className="rounded-lg border border-sky-300 bg-sky-200 px-3 py-1.5 text-[11px] text-slate-700 hover:bg-sky-200"
            >
              불러오기
            </button>
          </div>
        </div>

        {/* 과제 대상·제목: 먼저 고르면 아래 포메이션·선수 목록이 맞춰집니다 */}
        <section className="space-y-3 rounded-xl border border-lime-500/35 bg-white/93 p-4">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-lime-200/95">
            <span className="h-2 w-2 rounded-full bg-lime-400" />
            과제 대상 및 제목
          </div>
          <p className="text-[10px] text-slate-500">
            팀 또는 선수를 먼저 지정한 뒤 전술판에 선수를 배치할 수 있습니다. 선수 이름은 여기서 직접 입력하지 않고,{" "}
            <Link
              href="/coach/players"
              className="text-sky-600 underline underline-offset-2 hover:text-sky-800"
            >
              선수 관리
            </Link>
            에서 등록한 명단을 불러옵니다.
          </p>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),minmax(0,1fr),minmax(0,1.2fr)]">
            <div>
              <label className="mb-1 block text-xs text-slate-600">대상 종류</label>
              <select
                value={targetType}
                onChange={(e) => {
                  const value = e.target.value as TargetType;
                  setTargetType(value);
                  if (value === "team") {
                    setTargetId(teamOptions[0]?.id ?? "");
                    setTargetPlayerIds([]);
                  } else {
                    setTargetId("");
                    const first = playerOptions[0]?.id;
                    setTargetPlayerIds(first ? [first] : []);
                  }
                }}
                className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
              >
                <option value="team">팀</option>
                <option value="player">선수</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">
                {targetType === "team" ? "대상 선택" : "대상 선택 (복수)"}
              </label>
              {targetType === "team" ? (
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
                  disabled={teamOptions.length === 0}
                >
                  {teamOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex max-h-36 flex-col gap-1 overflow-y-auto rounded-md border border-sky-200 bg-white px-2 py-2 text-sm text-slate-900">
                  {playerOptions.length === 0 ? (
                    <span className="text-xs text-slate-500">선수 없음</span>
                  ) : (
                    <>
                      {playerOptions.map((opt) => (
                        <label
                          key={opt.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-sky-50/92"
                        >
                          <input
                            type="checkbox"
                            className="accent-rose-500"
                            checked={targetPlayerIds.includes(opt.id)}
                            onChange={(e) => {
                              setTargetPlayerIds((prev) => {
                                if (e.target.checked) {
                                  if (prev.includes(opt.id)) return prev;
                                  return [...prev, opt.id];
                                }
                                return prev.filter((id) => id !== opt.id);
                              });
                            }}
                          />
                          <span className="text-xs">{opt.name}</span>
                        </label>
                      ))}
                      <div className="mt-1 flex flex-wrap gap-1 border-t border-sky-200/90 pt-1">
                        <button
                          type="button"
                          className="rounded border border-sky-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-sky-100"
                          onClick={() =>
                            setTargetPlayerIds(playerOptions.map((p) => p.id))
                          }
                        >
                          전체 선택
                        </button>
                        <button
                          type="button"
                          className="rounded border border-sky-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-sky-100"
                          onClick={() => setTargetPlayerIds([])}
                        >
                          전체 해제
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        선택한 선수 수만큼 동일 과제가 생성됩니다. 각 선수
                        화면에 개별로 표시됩니다.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">과제 제목</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
                placeholder="목록에 표시될 제목 (비우면 첫 과제 줄 사용)"
              />
            </div>
          </div>
        </section>

        {/* ① 반복 / 단일 */}
        <section className="rounded-xl border border-sky-200 bg-sky-50/88 p-4">
          <div className="mb-2 text-[11px] font-semibold text-slate-400">과제 형태</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setHtmlTaskType("daily")}
              className={`rounded-lg border px-4 py-2 text-xs font-medium ${
                htmlTaskType === "daily"
                  ? "border-lime-400 bg-lime-400/20 text-lime-100"
                  : "border-sky-300 text-slate-600"
              }`}
            >
              매일 과제
            </button>
            <button
              type="button"
              onClick={() => setHtmlTaskType("single")}
              className={`rounded-lg border px-4 py-2 text-xs font-medium ${
                htmlTaskType === "single"
                  ? "border-lime-400 bg-lime-400/20 text-lime-100"
                  : "border-sky-300 text-slate-600"
              }`}
            >
              단일 과제
            </button>
          </div>
        </section>

        {/* Row1 유형 */}
        <section className="rounded-xl border border-sky-200 bg-sky-50/88 p-4">
          <div className="mb-1 text-[11px] font-semibold text-slate-400">유형</div>
          <p className="mb-2 text-[10px] text-slate-500">복수 선택 가능 (최소 1개, 첫 번째가 초점 행 기준)</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                "자기관리",
                "연습 및 훈련",
                "연습 경기",
                "정식 경기",
              ] as const
            ).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTaskType(t)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  taskTypeSelections.includes(t)
                    ? "border-lime-400 bg-lime-400 text-slate-950"
                    : "border-sky-300 text-slate-700 hover:border-lime-500/60"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {/* Row2 초점: 복수 선택 → contents */}
        <section className="rounded-xl border border-sky-200 bg-sky-50/88 p-4">
          <div className="mb-1 text-[11px] font-semibold text-slate-400">초점</div>
          <p className="mb-2 text-[10px] text-slate-500">복수 선택 가능</p>
          {!htmlCategory ? (
            <p className="text-[11px] text-slate-500">위에서 유형을 먼저 선택하세요.</p>
          ) : htmlCategory === "selfcare" ? (
            <div className="flex flex-wrap gap-2">
              {[
                { id: "routine", label: "루틴" },
                { id: "nutrition", label: "식단" },
                { id: "sleep", label: "수면" },
                { id: "recovery", label: "회복" },
              ].map((opt) => {
                const on = contentTags.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleFocusTag(opt.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      on
                        ? "border-lime-400 bg-lime-400 text-slate-950"
                        : "border-sky-300 text-slate-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {focusAxisOptions.map((opt) => {
                const on = contentTags.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleFocusTag(opt.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      on
                        ? "border-lime-400 bg-lime-400 text-slate-950"
                        : "border-sky-300 text-slate-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Row3 세부 초점: 단일 선택(한 번에 하나만) */}
        <section className="rounded-xl border border-sky-200 bg-sky-50/88 p-4">
          <div className="mb-2 text-[11px] font-semibold text-slate-400">세부 초점</div>
          <div className="flex flex-wrap gap-2">
            {subFocusOptions.map((sf) => (
              <button
                key={sf}
                type="button"
                onClick={() => setSubFocus(sf)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  subFocus === sf
                    ? "border-sky-400 bg-sky-500/20 text-sky-100"
                    : "border-sky-300 text-slate-700"
                }`}
              >
                {sf}
              </button>
            ))}
          </div>
        </section>

        {/* ② 기간 / 요일 / 시간 */}
        <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/92 p-4">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            기간 · 요일 · 시간
          </div>
          {htmlTaskType === "daily" ? (
            <>
              <p className="text-[11px] text-slate-500">
                반복 과제입니다. 과제가 유효한 기간과 요일, 시간대를 선택하세요.
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-2">
                  <span className="text-slate-600">시작일</span>
                  <input
                    type="date"
                    value={dailyStart}
                    onChange={(e) => setDailyStart(e.target.value)}
                    className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-sky-500"
                  />
                </label>
                <span className="text-slate-500">~</span>
                <label className="flex items-center gap-2">
                  <span className="text-slate-600">종료일</span>
                  <input
                    type="date"
                    value={dailyEnd}
                    onChange={(e) => setDailyEnd(e.target.value)}
                    className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-sky-500"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <span>요일</span>
                {["일", "월", "화", "수", "목", "금", "토"].map((label, idx) => {
                  const key = String(idx);
                  const on = weekdaySet.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setWeekdaySet((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                      className={`min-w-[2rem] rounded-full border px-2 py-0.5 text-center ${
                        on
                          ? "border-sky-500 bg-sky-500/10 text-sky-900"
                          : "border-sky-200 bg-white text-slate-600 hover:border-sky-500"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-2">
                  <span className="text-slate-600">시작 시간</span>
                  <input
                    type="time"
                    value={timeStart}
                    onChange={(e) => setTimeStart(e.target.value)}
                    className="h-8 rounded-md border border-sky-200 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-slate-600">종료 시간</span>
                  <input
                    type="time"
                    value={timeEnd}
                    onChange={(e) => setTimeEnd(e.target.value)}
                    className="h-8 rounded-md border border-sky-200 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500"
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] text-slate-500">
                단일 과제입니다. 평가가 이루어질 날짜와 시간대를 선택하세요.
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-2">
                  <span className="text-slate-600">일자</span>
                  <input
                    type="date"
                    value={singleDate}
                    onChange={(e) => setSingleDate(e.target.value)}
                    className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-sky-500"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-slate-600">시작 시간</span>
                  <input
                    type="time"
                    value={timeStart}
                    onChange={(e) => setTimeStart(e.target.value)}
                    className="h-8 rounded-md border border-sky-200 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-slate-600">종료 시간</span>
                  <input
                    type="time"
                    value={timeEnd}
                    onChange={(e) => setTimeEnd(e.target.value)}
                    className="h-8 rounded-md border border-sky-200 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500"
                  />
                </label>
              </div>
            </>
          )}
        </section>

        {/* 전술 · 포메이션 · 미니 필드 · 과제 줄 (목업) */}
        <section className="rounded-xl border border-sky-200 bg-sky-50/88 p-4">
          <div className="mb-3 text-[11px] font-semibold text-slate-400">
            전술 · 포메이션 · 대상 선수
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-600">오늘의 전술</label>
                <textarea
                  value={todayStrategy}
                  onChange={(e) => setTodayStrategy(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-500"
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
                  className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-500"
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
                      className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-500"
                      placeholder="전술 이름 (선택, 예: 3-2-3-2 변형, 역삼각 미드)"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-slate-500">
                        프리셋을 불러온 뒤 필드에서 옮기기:
                      </span>
                      <select
                        className="max-w-[10rem] rounded border border-sky-300 bg-white px-2 py-1 text-[10px] text-slate-700"
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
                        className="rounded border border-sky-300 px-2 py-1 text-[10px] text-slate-600 hover:bg-sky-100"
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
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-slate-400">
                  축소 경기장 (105×68m)
                  {isCustomFormation
                    ? " · 직접 배치: 잔디 클릭=추가 · 드래그=이동 · 더블클릭=삭제"
                    : " · 프리셋: 선발=연두 슬롯 · 교체(최대 7)=주황 포인트 · 선수 탭으로 슬롯 지정"}
                </p>
                {formation && (
                  <span className="max-w-[55%] truncate rounded border border-lime-500/40 bg-lime-500/10 px-2 py-0.5 text-[10px] font-semibold text-lime-200">
                    {formation === "custom"
                      ? formationNote.trim() || "직접 배치"
                      : formation}
                  </span>
                )}
              </div>
              <div className="relative w-full overflow-hidden rounded-xl border-2 border-sky-400/55 bg-gradient-to-b from-sky-950/80 via-sky-950/40 to-slate-950/90 shadow-inner shadow-sky-900/30 ring-1 ring-sky-400/20">
                {/* 비율: FIFA 길이·너비 (105:68) */}
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
                        id="pitchGrassBase"
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
                        id="pitchStripes"
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
                      <filter id="pitchShadow" x="-5%" y="-5%" width="110%" height="110%">
                        <feDropShadow
                          dx="0"
                          dy="1"
                          stdDeviation="1.2"
                          floodOpacity="0.35"
                        />
                      </filter>
                    </defs>
                    {/* 잔디 */}
                    <rect
                      x="0"
                      y="0"
                      width={PITCH_VB.w}
                      height={PITCH_VB.h}
                      fill="url(#pitchGrassBase)"
                    />
                    <rect
                      x="0"
                      y="0"
                      width={PITCH_VB.w}
                      height={PITCH_VB.h}
                      fill="url(#pitchStripes)"
                      opacity="0.85"
                    />
                    {/* 바깥 터치라인 */}
                    <rect
                      x="0.35"
                      y="0.35"
                      width={PITCH_VB.w - 0.7}
                      height={PITCH_VB.h - 0.7}
                      fill="none"
                      stroke="rgba(255,255,255,0.88)"
                      strokeWidth="0.55"
                      filter="url(#pitchShadow)"
                    />
                    {/* 센터 라인 */}
                    <line
                      x1="52.5"
                      y1="0"
                      x2="52.5"
                      y2="68"
                      stroke="rgba(255,255,255,0.88)"
                      strokeWidth="0.45"
                    />
                    {/* 센터 서클 */}
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
                    {/* 좌측(자기) 페널티 · 골 에어리어 */}
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
                    <circle
                      cx="11"
                      cy="34"
                      r="0.5"
                      fill="rgba(255,255,255,0.95)"
                    />
                    {/* 페널티 아크 (페널티 마크 11,34 기준 r=9.15m) */}
                    <path
                      d="M 16.5 26.69 A 9.15 9.15 0 0 1 16.5 41.31"
                      fill="none"
                      stroke="rgba(255,255,255,0.75)"
                      strokeWidth="0.4"
                    />
                    {/* 우측(상대) 페널티 · 골 에어리어 */}
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
                    <circle
                      cx="94"
                      cy="34"
                      r="0.5"
                      fill="rgba(255,255,255,0.95)"
                    />
                    <path
                      d="M 88.5 26.69 A 9.15 9.15 0 0 0 88.5 41.31"
                      fill="none"
                      stroke="rgba(255,255,255,0.75)"
                      strokeWidth="0.4"
                    />
                    {/* 골대(단순화) */}
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
                    {/* 코너 호 (1m) */}
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
                    {/* 직접 배치: 빈 영역 클릭 시 마커 추가 (마커는 위 레이어에서 가로챔) */}
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
                    {!isCustomFormation && formation ? (
                      <rect
                        x="0"
                        y="0"
                        width={PITCH_VB.w}
                        height={PITCH_VB.h}
                        fill="transparent"
                        style={{
                          cursor: subBenchPickId ? "crosshair" : "default",
                        }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          const svg = pitchSvgRef.current;
                          if (!svg) return;
                          const p = clientToSvgPoint(svg, e.clientX, e.clientY);
                          const c = clampPitch(p.x, p.y);
                          const r2 = SUB_POINT_HIT_R * SUB_POINT_HIT_R;
                          // 기존 교체 포인트 위/근처를 다시 클릭하면 해제
                          for (let i = formationSubPoints.length - 1; i >= 0; i--) {
                            const sp = formationSubPoints[i];
                            if (dist2(c.x, c.y, sp.x, sp.y) <= r2) {
                              setFormationSubPoints((prev) =>
                                prev.filter((_, j) => j !== i),
                              );
                              return;
                            }
                          }
                          if (!subBenchPickId) return;
                          if (formationSubPoints.length >= MAX_SUB_POINTS) return;
                          setFormationSubPoints((prev) => [
                            ...prev,
                            {
                              playerId: subBenchPickId,
                              x: Math.round(c.x * 100) / 100,
                              y: Math.round(c.y * 100) / 100,
                            },
                          ]);
                          setSubBenchPickId("");
                        }}
                      />
                    ) : null}
                    {/* 포메이션 슬롯 */}
                    {displayFormationSlots.map((slot, i) => {
                      const isGk = slot.label === "GK";
                      const slotKey =
                        slot.id ?? `preset-${slot.x}-${slot.y}-${i}`;
                      const editable = isCustomFormation && Boolean(slot.id);
                      const assignedPlayerId = slotPlayerAssignments[i];
                      const assignedPlayer = assignedPlayerId
                        ? entryPlayerMap[assignedPlayerId]
                        : undefined;
                      const shortName = assignedPlayer?.name
                        ? assignedPlayer.name.length > 4
                          ? `${assignedPlayer.name.slice(0, 4)}…`
                          : assignedPlayer.name
                        : null;
                      const badgeText = assignedPlayer
                        ? [
                            assignedPlayer.position?.toUpperCase(),
                            assignedPlayer.loginId ? `#${assignedPlayer.loginId}` : null,
                          ]
                            .filter(Boolean)
                            .join(" ")
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
                            if (editable || rosterPickMode) return;
                            if (selectedPlayerIds.size !== 1) return;
                            const [onlyId] = Array.from(selectedPlayerIds);
                            if (!onlyId || !rosterSelectedIds.has(onlyId)) return;
                            setSlotPlayerAssignments((prev) =>
                              assignPlayerToUniqueSlot(prev, i, onlyId),
                            );
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (rosterPickMode) return;
                            const playerId =
                              e.dataTransfer.getData("text/player-id") ||
                              e.dataTransfer.getData("text/plain");
                            if (!playerId || !rosterSelectedIds.has(playerId))
                              return;
                            setSlotPlayerAssignments((prev) =>
                              assignPlayerToUniqueSlot(prev, i, playerId),
                            );
                            setSelectedPlayerIds((prev) => {
                              const n = new Set(prev);
                              n.add(playerId);
                              return n;
                            });
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
                    {formationSubPoints.map((sp, idx) => {
                      const pl = entryPlayerMap[sp.playerId];
                      const shortName = pl?.name
                        ? pl.name.length > 4
                          ? `${pl.name.slice(0, 4)}…`
                          : pl.name
                        : "?";
                      return (
                        <g
                          key={`sub-${sp.playerId}-${idx}-${sp.x}-${sp.y}`}
                          style={{ cursor: "pointer" }}
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            e.preventDefault();
                            setFormationSubPoints((prev) =>
                              prev.filter((_, i) => i !== idx),
                            );
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setFormationSubPoints((prev) =>
                              prev.filter((_, i) => i !== idx),
                            );
                          }}
                        >
                          <circle
                            cx={sp.x}
                            cy={sp.y}
                            r={4.2}
                            fill="transparent"
                            stroke="none"
                            pointerEvents="all"
                          />
                          <circle
                            cx={sp.x}
                            cy={sp.y}
                            r={2.55}
                            fill="rgba(249,115,22,0.42)"
                            stroke="rgba(251,146,60,0.95)"
                            strokeWidth="0.5"
                            pointerEvents="none"
                          />
                          <text
                            x={sp.x}
                            y={sp.y - 3.1}
                            textAnchor="middle"
                            fontSize={1.35}
                            fontWeight="700"
                            fill="rgba(254,215,170,0.95)"
                            style={{ fontFamily: "system-ui, sans-serif" }}
                          >
                            교체
                          </text>
                          <text
                            x={sp.x}
                            y={sp.y + 4.1}
                            textAnchor="middle"
                            fontSize={1.65}
                            fontWeight="700"
                            fill="rgba(255,247,237,0.98)"
                            style={{ fontFamily: "system-ui, sans-serif" }}
                          >
                            {shortName}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                  {/* 방향 라벨 */}
                  <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded bg-black/35 px-1.5 py-0.5 text-[8px] font-medium text-white/90 backdrop-blur-[2px]">
                    수비
                  </div>
                  <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-black/35 px-1.5 py-0.5 text-[8px] font-medium text-white/90 backdrop-blur-[2px]">
                    공격 →
                  </div>
                </div>
                {!isCustomFormation && formation ? (
                  <div className="rounded-lg border border-orange-500/35 bg-white/95 px-2 py-2 text-[10px] text-slate-600">
                    <p className="mb-1 font-semibold text-orange-200/95">
                      교체 포인트 (최대 {MAX_SUB_POINTS}명 · 선발 슬롯과 색 구분)
                    </p>
                    <p className="mb-2 text-slate-500">
                      명단 확정 후, 선발에 넣지 않은 선수를 고른 뒤 잔디를 클릭하면
                      주황색 교체 포인트가 찍힙니다. 같은 위치를 다시 클릭하거나
                      마커를 클릭하면 해제됩니다. 직접 배치(커스텀) 모드와는 함께 쓸
                      수 없습니다.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={subBenchPickId}
                        onChange={(e) => setSubBenchPickId(e.target.value)}
                        className="max-w-[min(100%,14rem)] rounded-md border border-sky-300 bg-white px-2 py-1 text-[11px] outline-none focus:border-orange-400"
                      >
                        <option value="">
                          {subBenchCandidates.length === 0
                            ? "교체로 둘 선수 없음 (명단·슬롯 확인)"
                            : "선수 선택 후 필드 클릭"}
                        </option>
                        {subBenchCandidates.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.position ? ` · ${p.position}` : ""}
                          </option>
                        ))}
                      </select>
                      <span className="text-slate-500">
                        찍은 교체 {formationSubPoints.length}/{MAX_SUB_POINTS}
                      </span>
                      {subBenchPickId ? (
                        <span className="text-orange-300/90">
                          → 필드 빈 곳을 클릭하세요
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="border-t border-sky-200/90 bg-sky-50/95 px-2 py-2">
                  {entryCandidatePlayers.length === 0 ? (
                    <div className="space-y-1 text-[10px] text-slate-500">
                      <p>
                        {currentTeamIdForTask
                          ? "이 팀에 등록된 선수가 없습니다."
                          : "위에서 과제 대상(팀·선수)을 먼저 선택하면 해당 팀 선수가 표시됩니다."}
                      </p>
                      <p>
                        <Link
                          href="/coach/players"
                          className="text-sky-600 underline underline-offset-2 hover:text-sky-800"
                        >
                          선수 관리
                        </Link>
                        에서 선수를 등록한 뒤 다시 이 화면을 열어 주세요.
                      </p>
                    </div>
                  ) : rosterPickMode ? (
                    <div className="space-y-2">
                      <p className="text-[10px] text-slate-500">
                        팀 전체 명단에서 이번 과제에 넣을 선수를 체크한 뒤, 명단을
                        확정하면 필드에 드래그할 수 있습니다.
                      </p>
                      <div className="max-h-52 overflow-y-auto rounded border border-sky-200 bg-white/95 px-2 py-2">
                        <ul className="space-y-1.5">
                          {entryCandidatePlayers.map((p) => (
                            <li key={p.id}>
                              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-700">
                                <input
                                  type="checkbox"
                                  className="rounded border-sky-300"
                                  checked={rosterSelectedIds.has(p.id)}
                                  onChange={() => {
                                    setRosterSelectedIds((prev) => {
                                      const n = new Set(prev);
                                      if (n.has(p.id)) n.delete(p.id);
                                      else n.add(p.id);
                                      return n;
                                    });
                                  }}
                                />
                                <span>{p.name}</span>
                                {p.position ? (
                                  <span className="text-[10px] text-slate-500">
                                    {p.position}
                                  </span>
                                ) : null}
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setRosterSelectedIds(
                              new Set(
                                entryCandidatePlayers.map((p) => p.id),
                              ),
                            )
                          }
                          className="rounded border border-sky-300 px-2 py-1 text-[10px] text-slate-700 hover:bg-sky-100"
                        >
                          전체 선택
                        </button>
                        <button
                          type="button"
                          onClick={() => setRosterSelectedIds(new Set())}
                          className="rounded border border-sky-300 px-2 py-1 text-[10px] text-slate-700 hover:bg-sky-100"
                        >
                          전체 해제
                        </button>
                        <button
                          type="button"
                          disabled={rosterSelectedIds.size === 0}
                          onClick={() => {
                            setSelectedPlayerIds(new Set(rosterSelectedIds));
                            setRosterPickMode(false);
                            setSlotPlayerAssignments((prev) => {
                              const allowed = rosterSelectedIds;
                              const next = { ...prev };
                              for (const [k, v] of Object.entries(next)) {
                                if (!allowed.has(v)) delete next[Number(k)];
                              }
                              return next;
                            });
                          }}
                          className="rounded border border-lime-500/70 bg-lime-500/15 px-2 py-1 text-[10px] font-medium text-lime-100 hover:bg-lime-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          이 명단으로 포메이션 배치
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] text-slate-500">
                          확정 명단 ({formationDragPlayers.length}명) — 탭 선택 ·
                          드래그 또는 선수 1명만 선택 후 슬롯 클릭
                        </p>
                        <button
                          type="button"
                          onClick={() => setRosterPickMode(true)}
                          className="shrink-0 rounded border border-sky-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-sky-100"
                        >
                          명단 다시 고르기
                        </button>
                      </div>
                      <div className="flex max-h-[6rem] flex-wrap gap-1 overflow-y-auto pr-0.5">
                        {formationDragPlayers.map((p) => {
                          const on = selectedPlayerIds.has(p.id);
                          const toggle = () =>
                            setSelectedPlayerIds((prev) => {
                              const n = new Set(prev);
                              if (n.has(p.id)) n.delete(p.id);
                              else n.add(p.id);
                              return n;
                            });
                          return (
                            <div
                              key={p.id}
                              role="button"
                              tabIndex={0}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", p.id);
                                e.dataTransfer.setData(
                                  "text/player-id",
                                  p.id,
                                );
                                e.dataTransfer.effectAllowed = "copyMove";
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  toggle();
                                }
                              }}
                              onClick={toggle}
                              className={`cursor-grab rounded-md border px-1.5 py-0.5 text-[10px] transition active:cursor-grabbing ${
                                on
                                  ? "border-lime-400 bg-lime-400 font-medium text-slate-950 shadow-sm shadow-lime-500/20"
                                  : "border-sky-300/90 bg-white/92 text-slate-700 hover:border-sky-400"
                              }`}
                            >
                              {p.name}
                              {assignedPlayerIds.has(p.id) && (
                                <span className="ml-1 text-[9px] text-amber-300">
                                  ●
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                {rosterPickMode
                  ? `명단 선택 중 (체크 ${rosterSelectedIds.size}명 / 전체 ${entryCandidatePlayers.length}명)`
                  : `탭 선택 ${selectedPlayerIds.size}명 · 확정 명단 ${formationDragPlayers.length}명`}
                {displayFormationSlots.length > 0
                  ? ` · 필드 ${displayFormationSlots.length}포지션 표시`
                  : " · 프리셋 또는 직접 배치를 선택하면 표시됩니다"}
                {Object.keys(slotPlayerAssignments).length > 0
                  ? ` · 배정 ${Object.keys(slotPlayerAssignments).length}명`
                  : ""}
                {!rosterPickMode ? " · 슬롯 우클릭으로 배정 해제" : ""}
              </p>
              {Object.keys(slotPlayerAssignments).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setSlotPlayerAssignments({})}
                    className="rounded border border-rose-700/50 px-2 py-0.5 text-rose-200 hover:bg-rose-950/40"
                  >
                    배정 초기화
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-sky-200 bg-sky-50/88 p-4">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>과제 줄 (공통 / 포지션 / 개인)</span>
            <button
              type="button"
              onClick={() =>
                setAssignmentRows((prev) => [...prev, newAssignmentRow()])
              }
              className="rounded border border-sky-300 px-2 py-0.5 text-slate-700 hover:bg-sky-200"
            >
              + 줄 추가
            </button>
          </div>
          <div className="mb-2 space-y-1 rounded-lg border border-sky-200/90 bg-sky-50/88 px-2 py-1.5 text-[10px] text-slate-400">
            <p>
              FW {assignmentWeightTotals.FW}% / MF {assignmentWeightTotals.MF}% / DF{" "}
              {assignmentWeightTotals.DF}% / GK {assignmentWeightTotals.GK}%
              {hasAssignmentWeightOverflow && (
                <span className="ml-2 text-rose-600">
                  포지션별 합계는 100%를 넘을 수 없습니다.
                </span>
              )}
            </p>
            <p className="text-slate-500">
              비율(%) 입력란은{" "}
              <span className="text-slate-600">FW·MF·DF·GK</span> 칸을 먼저 켠 뒤에만
              활성화됩니다. 꺼져 있으면 해당 포지션에 과제 줄이 없다는 뜻입니다.
            </p>
          </div>
          <div className="space-y-3">
            {assignmentRows.map((row, idx) => (
              <div
                key={row.id}
                className="rounded-lg border border-sky-300 bg-sky-50/92 p-3"
              >
                <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
                  <input
                    value={row.text}
                    onChange={(e) =>
                      setAssignmentRows((prev) =>
                        prev.map((r) =>
                          r.id === row.id ? { ...r, text: e.target.value } : r,
                        ),
                      )
                    }
                    className="min-w-[220px] flex-1 rounded border border-sky-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                    placeholder="예: 볼 뺏기지 않기, 미드 프레싱"
                  />
                  <div className="flex flex-nowrap items-center gap-1 rounded bg-sky-100/55 px-1 py-1">
                    {(
                      [
                        ["common", "공통", row.common] as const,
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
                        className={`rounded border px-2 py-1 text-[10px] ${
                          on
                            ? "border-lime-400 bg-lime-400/20 text-lime-100"
                            : "border-sky-300 text-slate-400"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-nowrap items-center gap-1 rounded bg-sky-100/55 px-1 py-1">
                    {(
                      [
                        ["fw", "FW", row.fw, row.fwWeight, "fwWeight"] as const,
                        ["mf", "MF", row.mf, row.mfWeight, "mfWeight"] as const,
                        ["df", "DF", row.df, row.dfWeight, "dfWeight"] as const,
                        ["gk", "GK", row.gk, row.gkWeight, "gkWeight"] as const,
                      ] as const
                    ).map(([key, label, on, val, weightKey]) => (
                      <div
                        key={key}
                        className={`flex items-center gap-1 rounded border px-1.5 py-1 ${
                          on
                            ? "border-sky-300 bg-white text-slate-700"
                            : "border-sky-200/90 bg-sky-50/75 text-slate-500"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setAssignmentRows((prev) =>
                              prev.map((r) => {
                                if (r.id !== row.id) return r;
                                const nextOn = !r[key as keyof AssignmentRow] as boolean;
                                return {
                                  ...r,
                                  [key]: nextOn,
                                  ...(nextOn ? {} : { [weightKey]: 0 }),
                                };
                              }),
                            )
                          }
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            on ? "text-lime-200" : "text-slate-400"
                          }`}
                        >
                          {label}
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          disabled={!on}
                          value={on ? val : 0}
                          onChange={(e) => {
                            const next = Math.max(
                              0,
                              Math.min(100, Number(e.target.value) || 0),
                            );
                            setAssignmentRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id ? { ...r, [weightKey]: next } : r,
                              ),
                            );
                          }}
                          className="h-7 w-12 rounded border border-sky-200 bg-white px-1.5 text-[10px] text-slate-900 outline-none disabled:opacity-40"
                        />
                        <span className="text-[10px]">%</span>
                      </div>
                    ))}
                  </div>
                  {assignmentRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAssignmentRows((prev) =>
                          prev.filter((r) => r.id !== row.id),
                        )
                      }
                      className="rounded border border-rose-700/50 px-2 text-rose-600"
                    >
                      −
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ③ 일정: 과제 일정 + 공개 일정(한 박스) */}
        <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/92 p-4">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            일정
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-sky-200/90 bg-sky-50/75 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">과제 일정</p>
              {htmlTaskType === "daily" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">시작 날짜</label>
                    <input
                      type="date"
                      value={dailyStart}
                      onChange={(e) => setDailyStart(e.target.value)}
                      className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">종료 날짜</label>
                    <input
                      type="date"
                      value={dailyEnd}
                      onChange={(e) => setDailyEnd(e.target.value)}
                      className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-slate-600">날짜</label>
                  <input
                    type="date"
                    value={singleDate}
                    onChange={(e) => setSingleDate(e.target.value)}
                    className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
                  />
                </div>
              )}
            </div>

            <div className="rounded-lg border border-sky-200/90 bg-sky-50/75 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">공개 일정</p>
              <label className="mb-1 block text-xs text-slate-600">공개일</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
              />
              <p className="mt-2 text-[10px] text-slate-500">
                비워두면 과제 일정 기준으로 자동 계산됩니다.
              </p>
            </div>
          </div>
        </section>

        {/* ⑥ 평가자 지정 */}
        <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/92 p-4">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            평가자 지정
          </div>
          <p className="text-[11px] text-slate-500">
            현재 선택된 팀(또는 선수 소속 팀)의 코칭 스텝 중, 이 과제를 평가할 인원을 선택합니다.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span>코칭 스텝: {staff.length}명</span>
            <span>선택: {selectedEvaluatorIds.size}명</span>
          </div>
          {staff.length === 0 ? (
            <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/92 p-2 text-[11px] text-slate-400">
              현재 선택된 팀에 등록된 코칭 스텝이 없습니다. 팀 관리에서 코칭 스텝을 먼저 추가해 주세요.
            </div>
          ) : (
            <div className="mt-2 grid max-h-56 grid-cols-2 gap-2 overflow-y-auto md:grid-cols-3">
              {staff.map((s) => {
                const on = selectedEvaluatorIds.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setSelectedEvaluatorIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      })
                    }
                    className={`flex flex-col rounded-md border px-2 py-1.5 text-left text-[11px] transition ${
                      on
                        ? "border-sky-500 bg-sky-500/10 text-sky-900"
                        : "border-sky-200 bg-white text-slate-700 hover:border-sky-500"
                    }`}
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="text-[10px] text-slate-400">{s.role}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        </div>

        {/* 하단 버튼 */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-sky-200/90 bg-sky-100/55 px-4 py-4 md:px-5">
          <button
            type="button"
            onClick={() => setShowLoadFromTaskModal(true)}
            className="rounded-lg border border-sky-300 px-4 py-2 text-xs text-slate-600 hover:bg-sky-100"
          >
            이전 과제에서 불러오기
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border border-sky-300 px-4 py-2 text-xs text-slate-700 hover:bg-sky-100"
          >
            {editingId ? "취소" : "초기화"}
          </button>
          <div className="flex w-full flex-col items-end gap-2">
            {(submitBlockedReason || hasAssignmentWeightOverflow) && (
              <p className="max-w-md text-right text-[11px] text-amber-800">
                {hasAssignmentWeightOverflow
                  ? "포지션별 과제 가중치 합이 100%를 넘었습니다. 줄의 비율을 조정한 뒤 저장할 수 있습니다."
                  : submitBlockedReason}
              </p>
            )}
            <button
              type="submit"
              disabled={
                submitting ||
                !!submitBlockedReason ||
                hasAssignmentWeightOverflow
              }
              className="min-w-[140px] rounded-lg bg-sky-500 px-6 py-2.5 text-sm font-bold text-white shadow-inner ring-1 ring-sky-400/50 hover:bg-sky-600 disabled:opacity-50"
            >
              {submitting
                ? "저장 중..."
                : editingId
                  ? "수정 완료"
                  : "작성 완료"}
            </button>
          </div>
        </div>
      </form>

      {/* 이전 과제 불러오기 모달 */}
      {showLoadFromTaskModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => setShowLoadFromTaskModal(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-sky-200 p-4">
              <h3 className="text-lg font-semibold text-slate-900">이전 과제에서 불러오기</h3>
              <p className="mt-1 text-xs text-slate-400">
                선택한 과제의 제목·분류·일정·전술·대상 선수·평가자 설정이 폼에 채워집니다. 수정 후 새로 등록하면 됩니다.
              </p>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {tasks.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-500">등록된 과제가 없습니다.</p>
              ) : (
                <ul className="space-y-1">
                  {tasks.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => loadFromTask(task)}
                        className="w-full rounded-lg border border-sky-200 bg-sky-100/80 px-3 py-2.5 text-left text-sm hover:bg-sky-200/70"
                      >
                        <span className="font-medium text-slate-900">{task.title}</span>
                        <span className="ml-2 text-xs text-slate-500">
                          {task.dueDate
                            ? String(task.dueDate).slice(0, 10)
                            : "—"}
                          {" · "}
                          {task.category}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-sky-200 p-3 text-right">
              <button
                type="button"
                onClick={() => setShowLoadFromTaskModal(false)}
                className="rounded-lg border border-sky-300 px-4 py-2 text-sm text-slate-600 hover:bg-sky-100"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 과제 상세 모달 */}
      {selectedTaskForModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => setSelectedTaskForModal(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-sky-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-lg font-semibold text-slate-900">
              과제 정보 — {selectedTaskForModal.title}
            </h3>
            <p className="mb-4 text-xs text-slate-400">
              이 과제에 저장된 유형·일정·대상 선수 등을 한눈에 확인할 수 있습니다.
            </p>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-slate-400">대상</div>
                  <div className="mt-1 text-slate-900">
                    {selectedTaskForModal.teamId
                      ? "팀 과제"
                      : selectedTaskForModal.playerId
                        ? "개인 과제"
                        : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">마감일</div>
                  <div className="mt-1 text-slate-900">
                    {selectedTaskForModal.dueDate
                      ? String(selectedTaskForModal.dueDate).slice(0, 10)
                      : "—"}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-400">과제 유형 / 분류</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-sky-200 px-2 py-1 text-slate-900">
                    유형:{" "}
                    {selectedTaskForModal.details?.htmlTaskType === "single"
                      ? "단일 과제"
                      : "매일 과제"}
                  </span>
                  {selectedTaskForModal.details?.htmlCategory && (
                    <span className="rounded-full bg-sky-200 px-2 py-1 text-slate-900">
                      분류: {selectedTaskForModal.details.htmlCategory}
                    </span>
                  )}
                  <span className="rounded-full bg-sky-200 px-2 py-1 text-slate-900">
                    저장 카테고리: {selectedTaskForModal.category}
                  </span>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-400">평가 항목</div>
                {selectedTaskForModal.details?.contents &&
                selectedTaskForModal.details.contents.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedTaskForModal.details.contents.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-sky-200 px-2 py-1 text-[11px] text-slate-900"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-sky-200 bg-sky-50/92 p-2 text-xs text-slate-400">
                    선택된 평가 항목이 없습니다.
                  </div>
                )}
              </div>

              {(selectedTaskForModal.details?.dailyStart ||
                selectedTaskForModal.details?.dailyEnd ||
                selectedTaskForModal.details?.singleDate) && (
                <div>
                  <div className="mb-1 text-xs text-slate-400">일정</div>
                  <div className="rounded-lg border border-sky-200 bg-sky-50/92 p-3 text-xs text-slate-900">
                    {selectedTaskForModal.details?.htmlTaskType === "single" ? (
                      <>
                        <div>단일 날짜: {selectedTaskForModal.details?.singleDate ?? "—"}</div>
                      </>
                    ) : (
                      <>
                        <div>
                          기간: {selectedTaskForModal.details?.dailyStart ?? "—"} ~{" "}
                          {selectedTaskForModal.details?.dailyEnd ?? "—"}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1 text-xs text-slate-400">선수 지정</div>
                {selectedTaskForModal.details?.players &&
                selectedTaskForModal.details.players.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedTaskForModal.details.players.map((pid) => {
                      const player = players.find((p) => p.id === pid);
                      return (
                        <span
                          key={pid}
                          className="rounded-full bg-sky-200 px-2 py-1 text-[11px] text-slate-900"
                        >
                          {player?.name ?? pid}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-sky-200 bg-sky-50/92 p-2 text-xs text-slate-400">
                    이 과제에 지정된 선수가 없습니다.
                  </div>
                )}
              </div>

              {(() => {
                const rows = (selectedTaskForModal.details as {
                  formationPlayerAssignments?: { slot: number; playerId: string }[];
                } | null)?.formationPlayerAssignments;
                if (!Array.isArray(rows) || rows.length === 0) return null;
                return (
                  <div>
                    <div className="mb-1 text-xs text-slate-400">포메이션 슬롯 배정</div>
                    <div className="flex flex-wrap gap-2">
                      {rows
                        .slice()
                        .sort((a, b) => a.slot - b.slot)
                        .map((row) => {
                          const player = players.find((p) => p.id === row.playerId);
                          return (
                            <span
                              key={`${row.slot}-${row.playerId}`}
                              className="rounded-full border border-lime-500/40 bg-lime-500/10 px-2 py-1 text-[11px] text-lime-100"
                            >
                              슬롯 {row.slot + 1}: {player?.name ?? row.playerId}
                              {player?.position ? ` (${player.position})` : ""}
                            </span>
                          );
                        })}
                    </div>
                  </div>
                );
              })()}

              <div>
                <div className="mb-1 text-xs text-slate-400">평가자 지정</div>
                {selectedTaskForModal.details?.evaluators &&
                selectedTaskForModal.details.evaluators.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedTaskForModal.details.evaluators.map((sid) => {
                      const s = staff.find((st) => st.id === sid);
                      return (
                        <span
                          key={sid}
                          className="rounded-full bg-sky-200 px-2 py-1 text-[11px] text-slate-900"
                        >
                          {s?.name ?? sid}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-sky-200 bg-sky-50/92 p-2 text-xs text-slate-400">
                    이 과제에 지정된 평가자가 없습니다.
                  </div>
                )}
              </div>

              {/* 선수별 진행도 */}
              {(() => {
                const task = selectedTaskForModal;
                const playerIds: string[] =
                  task.details?.players && task.details.players.length > 0
                    ? task.details.players
                    : task.teamId
                      ? players.filter((p) => p.teamId === task.teamId).map((p) => p.id)
                      : task.playerId
                        ? [task.playerId]
                        : [];
                if (playerIds.length === 0) return null;
                return (
                  <div>
                    <div className="mb-2 text-xs text-slate-400">선수별 진행도</div>
                    <div className="rounded-lg border border-sky-200 bg-sky-50/92 overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-sky-200 bg-sky-100/80">
                            <th className="px-3 py-2 text-slate-400 font-medium">선수</th>
                            <th className="px-3 py-2 text-slate-400 font-medium w-24">완료</th>
                            <th className="px-3 py-2 text-slate-400 font-medium">메모</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playerIds.map((pid) => {
                            const player = players.find((p) => p.id === pid);
                            const prog = taskProgressList.find((p) => p.playerId === pid);
                            const completed = prog?.completed ?? false;
                            const note = prog?.note ?? "";
                            const isSaving = progressSaving === pid;
                            return (
                              <tr key={pid} className="border-b border-sky-200/90 last:border-0">
                                <td className="px-3 py-2 text-slate-900">
                                  {player?.name ?? pid}
                                  {player?.position && (
                                    <span className="ml-1 text-xs text-slate-500">{player.position}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="checkbox"
                                    checked={completed}
                                    onChange={(e) =>
                                      saveTaskProgress(pid, e.target.checked, note)
                                    }
                                    disabled={isSaving}
                                    className="h-4 w-4 rounded border-sky-300 bg-sky-200 text-sky-600"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="text"
                                    value={note}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setTaskProgressList((prev) => {
                                        const rest = prev.filter((p) => p.playerId !== pid);
                                        const next: TaskProgress = prog
                                          ? { ...prog, note: v }
                                          : {
                                              id: "",
                                              taskId: task.id,
                                              playerId: pid,
                                              completed: false,
                                              note: v,
                                            };
                                        return [...rest, next];
                                      });
                                    }}
                                    onBlur={(e) => {
                                      const v = e.target.value.trim();
                                      if (v !== (prog?.note ?? "")) saveTaskProgress(pid, completed, v);
                                    }}
                                    placeholder="메모"
                                    disabled={isSaving}
                                    className="w-full rounded border border-sky-300 bg-sky-200 px-2 py-1 text-xs text-slate-900 placeholder:text-slate-500"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  handleEdit(selectedTaskForModal);
                  setSelectedTaskForModal(null);
                }}
                className="rounded-lg border border-sky-500 px-4 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100"
              >
                이 과제 수정
              </button>
              <button
                type="button"
                onClick={() => setSelectedTaskForModal(null)}
                className="rounded-lg border border-sky-300 px-4 py-2 text-xs text-slate-700 hover:bg-sky-100"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-rose-600">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-sky-200/90 bg-sky-50/85">
        <table className="min-w-full text-sm">
          <thead className="bg-sky-100">
            <tr>
              <th className="px-4 py-2 text-left">제목</th>
              <th className="px-4 py-2 text-left">대상(팀/선수)</th>
              <th className="px-4 py-2 text-left">카테고리</th>
              <th className="px-4 py-2 text-left">마감일</th>
            <th className="px-4 py-2 text-right">진행 / 평가 요약</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-slate-400"
                >
                  과제 목록을 불러오는 중입니다...
                </td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-slate-400"
                >
                  등록된 과제가 없습니다. 위 폼에서 과제를 추가해 보세요.
                </td>
              </tr>
            ) : visibleTasks.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-slate-400"
                >
                  {lockedTeamId
                    ? "현재 선택된 팀에 해당하는 과제가 없습니다. (다른 팀 과제는 팀 컨텍스트 밖에서 보입니다.)"
                    : "필터 조건에 맞는 과제가 없습니다."}
                </td>
              </tr>
            ) : (
              visibleTasks.map((task) => {
                const team = task.teamId
                  ? teams.find((t) => t.id === task.teamId)
                  : undefined;
                const player = task.playerId
                  ? players.find((p) => p.id === task.playerId)
                  : undefined;

                const targetName = team?.name ?? player?.name ?? "-";

                return (
                  <tr key={task.id} className="border-t border-sky-200/90">
                    <td className="px-4 py-2">{task.title}</td>
                    <td className="px-4 py-2 text-slate-700">{targetName}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {task.category ?? "-"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {task.dueDate ?? "-"}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-700">
                      {(() => {
                        const s = taskSummaries[task.id];
                        if (!s) return <span className="text-slate-500">요약 계산 중…</span>;
                        const rate =
                          s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
                        const safeU = Math.max(0, Math.min(100, s.understanding));
                        const safeA = Math.max(0, Math.min(100, s.achievement));
                        const safeE = Math.max(0, Math.min(100, s.evaluation));
                        return (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-600">
                                완료 {s.completed}/{s.total}
                              </span>
                              <span className="font-semibold text-sky-600">
                                {rate}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-sky-200">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600"
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <div className="mt-1 grid grid-cols-3 gap-2 text-[10px] text-slate-600">
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">이해</span>
                                  <span>{safeU.toFixed(1)}%</span>
                                </div>
                                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-sky-200">
                                  <div
                                    className="h-full rounded-full bg-sky-500/90"
                                    style={{ width: `${safeU}%` }}
                                  />
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">달성</span>
                                  <span>{safeA.toFixed(1)}%</span>
                                </div>
                                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-sky-200">
                                  <div
                                    className="h-full rounded-full bg-sky-600"
                                    style={{ width: `${safeA}%` }}
                                  />
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">코치</span>
                                  <span>{safeE.toFixed(1)}%</span>
                                </div>
                                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-sky-200">
                                  <div
                                    className="h-full rounded-full bg-sky-500"
                                    style={{ width: `${safeE}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2 text-right text-xs space-x-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(task)}
                        className="rounded-md border border-sky-300 px-2 py-1 hover:bg-sky-100"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(task.id)}
                        className="rounded-md border border-rose-600 px-2 py-1 text-rose-200 hover:bg-rose-950"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


export type Role = "coach" | "player";

/** 팀 조직: 프론트/코칭스텝/선수별 직책(역할·포지션) 목록 */
export interface TeamOrganization {
  front: string[];
  coaching: string[];
  player: string[];
}

export interface Team {
  id: string;
  name: string;
  season: string;
  /** DB Organization 모델과 연결된 경우 같은 조직 소속 팀을 묶음 */
  organizationId?: string | null;
  organization?: TeamOrganization | null;
  statDefinition?: StatDefinition | null;
  /** 관리자 전체 팀 목록 등 — 팀을 만든 코치 User.id (없을 수 있음) */
  createdByUserId?: string | null;
}

/** 팀 프론트/코칭 직책별 등록된 개인 정보 */
export interface TeamStaff {
  id: string;
  teamId: string;
  role: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  guidance?: boolean | null;
}

/** 스탯 평가 카테고리 (선수 스탯 평가 시스템) */
export interface StatCategory {
  id: string;
  label: string;
  color: string;
}

/** 카테고리별 평가 방식: 기입(1~5) | 측정(수치+단위) */
export type CategoryEvaluationType = "rating" | "measurement";

/** 스탯 정의: 카테고리별 항목, 선택적 가중치·평가방식·단위 */
export interface StatDefinition {
  categories: StatCategory[];
  items: Record<string, string[]>; // categoryId -> 항목명[]
  categoryWeights?: Record<string, number>; // categoryId -> 0~100, 합 100 권장 (가중 평균용)
  categoryEvaluationType?: Record<string, CategoryEvaluationType>; // 기입(1~5) | 측정
  categoryUnit?: Record<string, string>; // 측정 시 단위 (예: 초, m, kg)
  /**
   * 선수 자기평가 화면에만 노출할 카테고리 id.
   * 빈 배열이면 자기평가 문항 없음.
   * 필드가 없으면(구 데이터) 선수 화면은 레거시 호환으로 활성 카테고리 전부를 자기평가에 쓸 수 있음.
   * 코치 팀 저장 시에는 항상 배열로 명시하는 것을 권장.
   */
  selfEvalCategoryIds?: string[];
}

/** 스태프 평가 저장 (항목별 1~5 점수) */
export interface StaffEvaluation {
  id: string;
  teamId: string;
  evaluatorStaffId: string;
  subjectStaffId: string;
  scores: Record<string, number[]>; // categoryId -> number[]
  createdAt?: string;
}

export interface Player {
  id: string;
  name: string;
  teamId: string;
  position?: string;
  height?: string | null;
  weight?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  photo?: string | null;
  phone?: string | null;
  parentPhone?: string | null;
  address?: string | null;
  school?: string | null;
  loginId?: string | null;
}

export type TaskCategory = "기술" | "체력" | "멘탈" | "전술";

export interface Task {
  id: string;
  title: string;
  category: TaskCategory;
  dueDate?: string;
  teamId?: string;
  playerId?: string;
  details?: TaskDetails | null;
}

export interface TaskDetails {
  htmlTaskType?: "daily" | "single";
  htmlCategory?: "selfcare" | "practice" | "practice_game" | "official";
  /** 과제 분류: 자기관리 / 연습 및 훈련 / 연습 경기 / 정식 경기 (대표 1개, 하위 호환) */
  taskType?: "자기관리" | "연습 및 훈련" | "연습 경기" | "정식 경기";
  /** 코치 과제에서 유형 복수 선택 시 전체 목록 (첫 항목이 taskType과 동일하게 취급) */
  taskTypes?: ("자기관리" | "연습 및 훈련" | "연습 경기" | "정식 경기")[];
  /** 과제 내용 축: 기술 / 신체 / 전술 / 심리 / 인지 / 태도 / 멘탈(자기관리 등) */
  contentCategory?:
    | "기술"
    | "신체"
    | "전술"
    | "심리"
    | "인지"
    | "태도"
    | "멘탈";
  contents?: string[]; // 선택된 태그 value 목록
  detailText?: string; // 세부 과제
  goalText?: string; // 과제 목표
  dailyStart?: string;
  dailyEnd?: string;
  singleDate?: string;
  weekdays?: string[]; // "0"~"6"
  timeStart?: string;
  timeEnd?: string;
  /** 측정 일정: 선수에게 과제가 공개되는 일시(ISO) */
  publicAt?: string;
  /** 선수 API 응답 전용 — 공개일시 전에는 상세가 제거됨 */
  playerLocked?: boolean;
  /** 사전 점검 시각 (코치 과제 등록) */
  preCheckTime?: string;
  /** 세부 초점: 이해·응용·활용 등 (구버전 단일 string, 신규 복수 string[]) */
  subFocus?: string | string[];
  /** 오늘의 전술 메모 */
  todayStrategy?: string;
  /** 포메이션 프리셋 키 또는 "custom" */
  formation?: string;
  /** 직접 배치 시 전술 이름 */
  formationLabel?: string;
  /** 직접 배치 좌표 */
  formationCustomSlots?: { x: number; y: number; label?: string }[];
  /** 포메이션 슬롯 인덱스별 선수 배정 */
  formationPlayerAssignments?: { slot: number; playerId: string }[];
  /** 교체(벤치) — 필드 위 포인트 좌표 (선발 슬롯과 별도, 최대 7명 권장) */
  formationSubPoints?: { playerId: string; x: number; y: number }[];
  /** 과제 줄: 텍스트 + 범위 태그 + 포지션별 가중치(%) */
  assignmentLines?: {
    text: string;
    scopes?: string[];
    weights?: Partial<Record<"FW" | "MF" | "DF" | "GK", number>>;
  }[];
  positions?: string[]; // ["GK","DF","MF","FW"] 또는 ["ALL"]
  positionWeights?: Record<string, number>; // 포지션별 중요도 %
  /** 코치 화면 명단/포메이션 등 — 접근 제어에는 쓰지 않음 */
  players?: string[];
  /** 팀 과제(teamId + playerId null)에서 과제·선수 API 노출 대상만 제한; 없으면 해당 팀 전체 */
  assigneePlayerIds?: string[];
  evaluators?: string[]; // 평가자(코칭 스텝) id 목록
}

export interface Schedule {
  id: string;
  title: string;
  date: string;
  teamId: string;
}

export interface TaskProgress {
  id: string;
  taskId: string;
  playerId: string;
  completed: boolean;
  note?: string;
}

export type AnalysisHalf = "first" | "second";

export interface MatchAnalysisEvent {
  half: AnalysisHalf;
  [key: string]: unknown;
}

export interface MatchAnalysisEventsPayload {
  atk: MatchAnalysisEvent[];
  def: MatchAnalysisEvent[];
  pass: MatchAnalysisEvent[];
  gk: MatchAnalysisEvent[];
}

/** 선수별 제출 데이터: playerId -> 코치 분석과 동일한 events 구조 */
export type PlayerEventsMap = Record<string, MatchAnalysisEventsPayload>;

/** 선수들 events를 하나로 합침 (기록관 '선수 데이터 전체 합산'용) */
export function aggregatePlayerEvents(
  playerEvents: PlayerEventsMap | null | undefined,
): MatchAnalysisEventsPayload {
  if (!playerEvents || typeof playerEvents !== "object") {
    return { atk: [], def: [], pass: [], gk: [] };
  }
  const atk: MatchAnalysisEvent[] = [];
  const def: MatchAnalysisEvent[] = [];
  const pass: MatchAnalysisEvent[] = [];
  const gk: MatchAnalysisEvent[] = [];
  for (const ev of Object.values(playerEvents)) {
    if (ev && typeof ev === "object") {
      if (Array.isArray(ev.atk)) atk.push(...ev.atk);
      if (Array.isArray(ev.def)) def.push(...ev.def);
      if (Array.isArray(ev.pass)) pass.push(...ev.pass);
      if (Array.isArray(ev.gk)) gk.push(...ev.gk);
    }
  }
  return { atk, def, pass, gk };
}

export interface MatchAnalysis {
  id: string;
  scheduleId?: string | null;
  teamId?: string | null;
  opponent?: string | null;
  matchDate?: string | null;
  matchName?: string | null;
  result?: string | null;
  events: MatchAnalysisEventsPayload;
  /** 선수별 포인트 제출 (선수가 코치에게 보낸 데이터) */
  playerEvents?: PlayerEventsMap | null;
  updatedAt: string;
  schedule?: { id: string; title: string; date: string } | null;
  team?: { id: string; name: string } | null;
}

/** 저장된 subFocus를 폼/표시용으로 정규화 (구 string → [string]) */
export function normalizeSubFocusFromStored(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of raw) {
      if (typeof x !== "string" || !x.length || seen.has(x)) continue;
      seen.add(x);
      out.push(x);
    }
    return out;
  }
  if (typeof raw === "string" && raw.length > 0) return [raw];
  return [];
}

export function formatSubFocusForDisplay(
  sub: TaskDetails["subFocus"] | undefined,
): string {
  return normalizeSubFocusFromStored(sub).join(" · ");
}


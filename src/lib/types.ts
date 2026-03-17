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
  organization?: TeamOrganization | null;
  statDefinition?: StatDefinition | null;
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
  contents?: string[]; // 선택된 태그 value 목록
  detailText?: string; // 세부 과제
  goalText?: string; // 과제 목표
  dailyStart?: string;
  dailyEnd?: string;
  singleDate?: string;
  weekdays?: string[]; // "0"~"6"
   positions?: string[]; // ["GK","DF","MF","FW"] 또는 ["ALL"]
   positionWeights?: Record<string, number>; // 포지션별 중요도 %
  players?: string[]; // 과제에 포함된 선수 id 목록 (대표 대상은 별도 targetId로 저장)
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


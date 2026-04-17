/**
 * 과제 평가 점수 유틸 (2단계: 이해/달성/평가)
 * - 이해: 선수 사전(PLAYER_PRE) 평균 → 0~100
 * - 달성: 선수 사후(PLAYER_POST) 평균 → 0~100
 * - 평가: 코치 사후(COACH_POST) 평균 → 0~100
 */

export type EvalPhaseType = "PLAYER_PRE" | "PLAYER_POST" | "COACH_POST";

export interface EvaluationRow {
  subjectPlayerId: string;
  phase?: string | EvalPhaseType | null;
  scores: Record<string, number[]>;
  /** 평가 행 생성 시각(ISO 등) — 대시보드 기간 필터용 */
  createdAt?: string | null;
}

export interface PhaseAverages {
  PLAYER_PRE?: number;
  PLAYER_POST?: number;
  COACH_POST?: number;
}

/** 1~5점 평균을 0~100 점수로 환산 */
export function toPercent(mean5: number): number {
  return Math.max(0, Math.min(100, (mean5 / 5) * 100));
}

/**
 * 평가 목록을 선수별·단계별로 집계 (1~5점 평균)
 * categoryIds가 비어 있으면 모든 카테고리 평균 사용
 */
export function aggregatePhaseScores(
  evaluations: EvaluationRow[],
  categoryIds: string[] = [],
): Record<string, PhaseAverages> {
  const bySubject: Record<
    string,
    { PRE: number[]; POST: number[]; COACH: number[] }
  > = {};

  for (const e of evaluations) {
    const sid = e.subjectPlayerId;
    if (!bySubject[sid]) {
      bySubject[sid] = { PRE: [], POST: [], COACH: [] };
    }
    const bucket = bySubject[sid];
    const cats = categoryIds.length > 0 ? categoryIds : Object.keys(e.scores);

    let sum = 0;
    let count = 0;
    for (const cid of cats) {
      const arr = e.scores[cid];
      if (Array.isArray(arr) && arr.length > 0) {
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        sum += avg;
        count += 1;
      }
    }
    const mean = count > 0 ? sum / count : 0;
    const phase = (e.phase ?? "COACH_POST") as EvalPhaseType;

    if (phase === "PLAYER_PRE") bucket.PRE.push(mean);
    else if (phase === "PLAYER_POST") bucket.POST.push(mean);
    else bucket.COACH.push(mean);
  }

  const result: Record<string, PhaseAverages> = {};
  for (const [sid, bucket] of Object.entries(bySubject)) {
    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : undefined;
    result[sid] = {
      PLAYER_PRE: avg(bucket.PRE),
      PLAYER_POST: avg(bucket.POST),
      COACH_POST: avg(bucket.COACH),
    };
  }
  return result;
}

export interface TaskScoreTriple {
  understanding: number;
  achievement: number;
  evaluation: number;
}

/**
 * 선수별 phase 집계에서 한 명의 이해/달성/평가 점수(0~100) 계산
 */
export function getTaskScores(
  byPhase: Record<string, PhaseAverages>,
  subjectPlayerId: string,
): TaskScoreTriple {
  const p = byPhase[subjectPlayerId] ?? {};
  return {
    understanding: toPercent(p.PLAYER_PRE ?? 0),
    achievement: toPercent(p.PLAYER_POST ?? 0),
    evaluation: toPercent(p.COACH_POST ?? 0),
  };
}

/**
 * 이해·달성 둘 다 데이터가 있을 때 개선 점수 (달성 − 이해). 없으면 null.
 */
export function getImprovement(
  byPhase: Record<string, PhaseAverages>,
  subjectPlayerId: string,
): number | null {
  const p = byPhase[subjectPlayerId] ?? {};
  const pre = p.PLAYER_PRE;
  const post = p.PLAYER_POST;
  if (pre == null || post == null) return null;
  return toPercent(post) - toPercent(pre);
}

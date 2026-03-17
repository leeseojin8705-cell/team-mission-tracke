import type { StatDefinition } from "./types";

/** 설정된 스탯 정의의 전체 항목 수 (평가 진행률 계산용) */
export function getStatDefinitionTotalItems(def: StatDefinition): number {
  if (!def?.categories?.length || !def.items) return 0;
  return def.categories.reduce((acc, c) => acc + (def.items[c.id]?.length ?? 0), 0);
}

/** 한 건의 평가에서 채워진 항목 비율 0~100 (설정된 정의 기준) */
export function getEvaluationProgressPercent(
  scores: Record<string, number[]>,
  def: StatDefinition,
): number {
  const total = getStatDefinitionTotalItems(def);
  if (total === 0) return 100;
  const filled = def.categories.reduce((acc, c) => {
    const arr = scores[c.id] ?? [];
    const count = isMeasurementCategory(def, c.id)
      ? arr.filter((n) => typeof n === "number" && Number.isFinite(n)).length
      : arr.filter((n) => n >= 1 && n <= 5).length;
    return acc + count;
  }, 0);
  return Math.min(100, Math.round((filled / total) * 100));
}

/** 측정 카테고리 여부 (가중 평균에서 제외) */
export function isMeasurementCategory(def: StatDefinition, categoryId: string): boolean {
  return def.categoryEvaluationType?.[categoryId] === "measurement";
}

/** 표시용: 기입은 "4.2", 측정은 "4.5초" 형태 */
export function formatCategoryValue(def: StatDefinition, categoryId: string, value: number): string {
  const unit = (def.categoryUnit?.[categoryId] ?? "").trim();
  if (def.categoryEvaluationType?.[categoryId] === "measurement") {
    return unit ? `${value}${unit}` : String(value);
  }
  return value.toFixed(1);
}

/** 카테고리별 점수로 전체 가중 평균 계산. 측정 카테고리는 제외하고 기입(1~5)만 반영 */
export function getWeightedOverall(
  byCat: Record<string, number>,
  def: StatDefinition,
): number {
  const ratingCats = def.categories.filter(
    (c) => !isMeasurementCategory(def, c.id) && ((byCat[c.id] ?? 0) > 0 || byCat[c.id] === 0),
  );
  if (ratingCats.length === 0) return 0;
  const weights = def.categoryWeights;
  if (weights && typeof weights === "object") {
    let sum = 0;
    let totalW = 0;
    for (const c of ratingCats) {
      const w = Math.max(0, Number(weights[c.id]) ?? 0);
      if (w > 0) {
        sum += (byCat[c.id] ?? 0) * w;
        totalW += w;
      }
    }
    if (totalW > 0) return Math.round((sum / totalW) * 10) / 10;
  }
  const sum = ratingCats.reduce((acc, c) => acc + (byCat[c.id] ?? 0), 0);
  return Math.round((sum / ratingCats.length) * 10) / 10;
}

/** 기본 스탯 평가 카테고리·항목 (선수 스탯 평가 시스템 기준) */
export const DEFAULT_STAT_DEFINITION: StatDefinition = {
  categories: [
    { id: "skill", label: "기술", color: "#4f7cff" },
    { id: "physical", label: "신체", color: "#22c984" },
    { id: "tactical", label: "전술", color: "#ffb930" },
    { id: "mental", label: "심리", color: "#ff4f6a" },
    { id: "cognitive", label: "인지", color: "#c97cff" },
    { id: "attitude", label: "태도", color: "#ff7c4f" },
    { id: "management", label: "관리", color: "#4fdbff" },
  ],
  items: {
    skill: ["패스 정확도", "드리블", "슈팅"],
    physical: ["스프린트 속도", "지구력", "근력"],
    tactical: ["포지셔닝", "공간 인식", "압박 타이밍"],
    mental: ["집중력", "승부근성", "스트레스 관리"],
    cognitive: ["경기 읽기", "결단력", "전술 이해"],
    attitude: ["훈련 태도", "팀워크", "리더십"],
    management: ["시간 관리", "자기 관리", "커뮤니케이션"],
  },
};

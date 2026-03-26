import type { TaskDetails } from "@/lib/types";

/** FIFA 규격 비율 viewBox 105×68 (m) */
export const PITCH_VB = { w: 105, h: 68 };

export type FormationSlot = { x: number; y: number; label?: string; id?: string };

/** 포메이션 드롭다운용 (값은 FORMATION_LAYOUTS 키와 동일) */
export const FORMATION_PRESET_OPTIONS: { value: string; label: string }[] = [
  { value: "4-4-2", label: "4-4-2" },
  { value: "4-3-3", label: "4-3-3" },
  { value: "3-4-3", label: "3-4-3" },
  { value: "3-5-2", label: "3-5-2" },
  { value: "4-2-3-1", label: "4-2-3-1" },
  { value: "4-1-4-1", label: "4-1-4-1" },
  { value: "5-3-2", label: "5-3-2" },
  { value: "5-4-1", label: "5-4-1" },
];

export const FORMATION_LAYOUTS: Record<string, FormationSlot[]> = {
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

/** 코치 과제 details 에서 필드에 그릴 슬롯 목록 */
export function getFormationSlotsFromTaskDetails(
  d: TaskDetails | null | undefined,
): FormationSlot[] {
  if (!d) return [];
  const formation = d.formation?.trim();
  if (!formation) return [];
  if (formation === "custom") {
    const slots = d.formationCustomSlots;
    if (!Array.isArray(slots) || slots.length === 0) return [];
    return slots.map((s, i) => ({
      x: typeof s.x === "number" ? s.x : 0,
      y: typeof s.y === "number" ? s.y : 34,
      label: s.label,
      id: `s-${i}`,
    }));
  }
  return FORMATION_LAYOUTS[formation] ?? [];
}

export function hasCoachBlueprintContent(
  d: TaskDetails | null | undefined,
): boolean {
  if (!d) return false;
  if (d.subFocus) return true;
  if (d.todayStrategy?.trim()) return true;
  if (d.formation?.trim()) return true;
  if (d.formationLabel?.trim()) return true;
  if (d.preCheckTime) return true;
  if (Array.isArray(d.assignmentLines) && d.assignmentLines.length > 0)
    return true;
  if (Array.isArray(d.formationCustomSlots) && d.formationCustomSlots.length > 0)
    return true;
  if (
    Array.isArray(d.formationPlayerAssignments) &&
    d.formationPlayerAssignments.length > 0
  )
    return true;
  return false;
}

/**
 * 포메이션 슬롯에 선수를 배정할 때, 동일 선수가 여러 슬롯에 중복되지 않도록 합니다.
 */
export function assignPlayerToUniqueSlot(
  prev: Record<number, string>,
  slotIndex: number,
  playerId: string,
): Record<number, string> {
  const next: Record<number, string> = {};
  for (const [k, v] of Object.entries(prev)) {
    const idx = Number(k);
    if (!Number.isFinite(idx)) continue;
    if (idx === slotIndex) continue;
    if (v === playerId) continue;
    next[idx] = v;
  }
  next[slotIndex] = playerId;
  return next;
}

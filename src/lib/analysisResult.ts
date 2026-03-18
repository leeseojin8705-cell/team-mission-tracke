/**
 * 경기 결과 문자열 파싱 (예: "2-1 승", "1-2 패", "1-1 무")
 * 전술 데이터·기록관 통계에 공통 사용
 */
export function parseResult(
  result: string | null,
): { outcome: "win" | "loss" | "draw"; our: number; opp: number } | null {
  if (!result || !result.trim()) return null;
  const s = result.trim();
  const winMatch = s.match(/^(\d+)\s*-\s*(\d+)\s*승\s*$/);
  const lossMatch = s.match(/^(\d+)\s*-\s*(\d+)\s*패\s*$/);
  const drawMatch = s.match(/^(\d+)\s*-\s*(\d+)\s*무\s*$/);
  const scoreOnly = s.match(/^(\d+)\s*-\s*(\d+)\s*$/);
  if (winMatch) {
    return { outcome: "win", our: parseInt(winMatch[1], 10), opp: parseInt(winMatch[2], 10) };
  }
  if (lossMatch) {
    return { outcome: "loss", our: parseInt(lossMatch[1], 10), opp: parseInt(lossMatch[2], 10) };
  }
  if (drawMatch) {
    return { outcome: "draw", our: parseInt(drawMatch[1], 10), opp: parseInt(drawMatch[2], 10) };
  }
  if (scoreOnly) {
    const our = parseInt(scoreOnly[1], 10);
    const opp = parseInt(scoreOnly[2], 10);
    const outcome = our > opp ? "win" : our < opp ? "loss" : "draw";
    return { outcome, our, opp };
  }
  return null;
}

export function aggregateResults(items: { result: string | null }[]) {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (const a of items) {
    const p = parseResult(a.result);
    if (!p) continue;
    if (p.outcome === "win") wins++;
    else if (p.outcome === "loss") losses++;
    else draws++;
    goalsFor += p.our;
    goalsAgainst += p.opp;
  }
  const total = wins + losses + draws;
  const winRate = total > 0 ? (wins / total) * 100 : 0;
  const goalDiff = goalsFor - goalsAgainst;
  return {
    wins,
    losses,
    draws,
    total,
    goalsFor,
    goalsAgainst,
    goalDiff,
    winRate,
  };
}

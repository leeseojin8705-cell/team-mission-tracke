"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import type { Player, Team, TeamStaff } from "@/lib/types";
import type { StatCategory } from "@/lib/types";
import { DEFAULT_STAT_DEFINITION, getWeightedOverall, isMeasurementCategory } from "@/lib/statDefinition";

const RADAR_SIZE = 280;
const RADAR_CX = RADAR_SIZE / 2;
const RADAR_CY = RADAR_SIZE / 2;
const RADAR_R = (RADAR_SIZE / 2) * 0.85;

function StackRadarChart({ categories, values }: { categories: StatCategory[]; values: Record<string, number> }) {
  const n = categories.length;
  if (n === 0) return null;
  const angleStep = (2 * Math.PI) / n;
  const getPoint = (value: number, index: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (Math.max(0, Math.min(5, value)) / 5) * RADAR_R;
    return { x: RADAR_CX + r * Math.cos(angle), y: RADAR_CY + r * Math.sin(angle) };
  };
  const polygonPoints = categories
    .map((c, i) => getPoint(values[c.id] ?? 0, i))
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
  const axisEndPoints = categories.map((_, i) => getPoint(5, i));
  const labelPoints = categories.map((_, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const r = RADAR_R + 18;
    return { x: RADAR_CX + r * Math.cos(angle), y: RADAR_CY + r * Math.sin(angle), label: categories[i].label, color: categories[i].color };
  });
  return (
    <div className="flex justify-center">
      <svg width={RADAR_SIZE} height={RADAR_SIZE} className="overflow-visible">
        {[1, 2, 3, 4, 5].map((level) => {
          const r = (level / 5) * RADAR_R;
          const pts = categories
            .map((_, i) => {
              const angle = angleStep * i - Math.PI / 2;
              return `${RADAR_CX + r * Math.cos(angle)},${RADAR_CY + r * Math.sin(angle)}`;
            })
            .join(" ");
          return <polygon key={level} points={pts} fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="1" />;
        })}
        {axisEndPoints.map((end, i) => (
          <line key={i} x1={RADAR_CX} y1={RADAR_CY} x2={end.x} y2={end.y} stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
        ))}
        <polygon points={polygonPoints} fill="rgba(16,185,129,0.25)" stroke="rgba(16,185,129,0.9)" strokeWidth="2" strokeLinejoin="round" />
        {labelPoints.map((lp, i) => (
          <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" className="text-[11px] font-medium fill-slate-300" style={{ fill: lp.color }}>
            {lp.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default function CoachPlayersPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerFormRef = useRef<HTMLFormElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterTeamId, setFilterTeamId] = useState<string>("all");
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [position, setPosition] = useState("");

  const [stackTeam, setStackTeam] = useState<Team | null>(null);
  const [stackStaff, setStackStaff] = useState<TeamStaff[]>([]);
  const [stackEvaluations, setStackEvaluations] = useState<{ evaluatorStaffId: string; subjectPlayerId: string; scores: Record<string, number[]> }[]>([]);
  const [stackSelectedEvaluators, setStackSelectedEvaluators] = useState<Set<string>>(new Set());
  const [stackLoading, setStackLoading] = useState(false);

  const [profilePlayer, setProfilePlayer] = useState<Player | null>(null);
  const [profileForm, setProfileForm] = useState({ name: "", position: "", height: "", weight: "", dateOfBirth: "", gender: "", photo: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const teamOptions = useMemo(
    () => teams.map((t) => ({ id: t.id, name: t.name })),
    [teams],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [teamsRes, playersRes] = await Promise.all([
          fetch("/api/teams"),
          fetch("/api/players"),
        ]);

        if (!teamsRes.ok || !playersRes.ok) {
          throw new Error("데이터를 불러오지 못했습니다.");
        }

        const [teamsData, playersData]: [Team[], Player[]] =
          await Promise.all([teamsRes.json(), playersRes.json()]);

        if (!cancelled) {
          setTeams(teamsData);
          setPlayers(playersData);
          if (!teamId && teamsData[0]) {
            setTeamId(teamsData[0].id);
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
  }, [teamId]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setTeamId(teams[0]?.id ?? "");
    setPosition("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !teamId) return;

    try {
      setSubmitting(true);
      setError(null);

      if (editingId) {
        const res = await fetch(`/api/players/${editingId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            teamId,
            position: position.trim() || undefined,
          }),
        });

        if (!res.ok) {
          throw new Error("선수를 수정하지 못했습니다.");
        }

        const updated: Player = await res.json();
        setPlayers((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p)),
        );
      } else {
        const res = await fetch("/api/players", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            teamId,
            position: position.trim() || undefined,
          }),
        });

        if (!res.ok) {
          throw new Error("선수를 저장하지 못했습니다.");
        }

        const created: Player = await res.json();
        setPlayers((prev) => [...prev, created]);
      }

      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(player: Player) {
    setEditingId(player.id);
    setName(player.name);
    setTeamId(player.teamId);
    setPosition(player.position ?? "");
    setTimeout(() => playerFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  async function handleDelete(id: string) {
    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch(`/api/players/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("선수를 삭제하지 못했습니다.");
      }

      setPlayers((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) {
        resetForm();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const visiblePlayers = useMemo(
    () =>
      filterTeamId === "all"
        ? players
        : players.filter((p) => p.teamId === filterTeamId),
    [players, filterTeamId],
  );

  useEffect(() => {
    if (!stackTeam) {
      setStackStaff([]);
      setStackEvaluations([]);
      setStackSelectedEvaluators(new Set());
      return;
    }
    let cancelled = false;
    setStackLoading(true);
    const tid = stackTeam.id;
    const safeJson = async <T,>(r: Response, fallback: T): Promise<T> => {
      const text = await r.text();
      if (!text.trim()) return fallback;
      try {
        return JSON.parse(text) as T;
      } catch {
        return fallback;
      }
    };
    Promise.all([
      fetch(`/api/teams/${tid}/staff`).then((r) => safeJson(r, [] as TeamStaff[])),
      fetch(`/api/teams/${tid}/player-evaluations`).then((r) =>
        safeJson(r, [] as { evaluatorStaffId: string; subjectPlayerId: string; scores: Record<string, number[]> }[]),
      ),
    ])
      .then(([staffListRes, evalsRes]) => {
        if (!cancelled) {
          const staff = Array.isArray(staffListRes) ? staffListRes : [];
          const evals = Array.isArray(evalsRes) ? evalsRes : [];
          setStackStaff(staff);
          setStackEvaluations(evals);
          const guidanceIds = staff.filter((s) => s.guidance).map((s) => s.id);
          setStackSelectedEvaluators(new Set(guidanceIds.length > 0 ? guidanceIds : staff.map((s) => s.id)));
        }
      })
      .finally(() => {
        if (!cancelled) setStackLoading(false);
      });
    return () => { cancelled = true; };
  }, [stackTeam]);

  const stackCoaches = useMemo(() => stackStaff.filter((s) => s.guidance), [stackStaff]);
  const stackDef = stackTeam?.statDefinition ?? DEFAULT_STAT_DEFINITION;
  const stackAggregated = useMemo(() => {
    const selected = stackSelectedEvaluators;
    const evals = stackEvaluations.filter((e) => selected.has(e.evaluatorStaffId));
    const bySubject: Record<string, { count: number; sumByCat: Record<string, number>; countByCat: Record<string, number> }> = {};
    const def = stackTeam?.statDefinition ?? DEFAULT_STAT_DEFINITION;
    for (const e of evals) {
      if (!bySubject[e.subjectPlayerId]) {
        bySubject[e.subjectPlayerId] = { count: 0, sumByCat: {}, countByCat: {} };
      }
      const sub = bySubject[e.subjectPlayerId];
      sub.count += 1;
      for (const [catId, arr] of Object.entries(e.scores)) {
        if (!Array.isArray(arr)) continue;
        const sum = arr.reduce((a, b) => a + b, 0);
        const n = arr.length;
        if (n > 0) {
          sub.sumByCat[catId] = (sub.sumByCat[catId] ?? 0) + sum / n;
          sub.countByCat[catId] = (sub.countByCat[catId] ?? 0) + 1;
        }
      }
    }
    const result: { subjectPlayerId: string; overall: number; byCat: Record<string, number> }[] = [];
    for (const [subjectPlayerId, data] of Object.entries(bySubject)) {
      const byCat: Record<string, number> = {};
      def.categories.forEach((c) => {
        const avg = data.countByCat[c.id] ? data.sumByCat[c.id]! / data.countByCat[c.id]! : 0;
        byCat[c.id] = Math.round(avg * 10) / 10;
      });
      const overall = getWeightedOverall(byCat, def);
      result.push({ subjectPlayerId, overall, byCat });
    }
    result.sort((a, b) => b.overall - a.overall);
    return result;
  }, [stackEvaluations, stackSelectedEvaluators, stackTeam?.statDefinition]);

  const toggleStackEvaluator = useCallback((staffId: string) => {
    setStackSelectedEvaluators((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  }, []);

  const stackTeamPlayers = useMemo(
    () => (stackTeam ? players.filter((p) => p.teamId === stackTeam.id) : []),
    [stackTeam, players],
  );

  const stackTeamAvgByCategory = useMemo(() => {
    const def = stackTeam?.statDefinition ?? DEFAULT_STAT_DEFINITION;
    const byCat: Record<string, number> = {};
    if (stackAggregated.length === 0) {
      def.categories.forEach((c) => { byCat[c.id] = 0; });
      return byCat;
    }
    def.categories.forEach((c) => {
      const sum = stackAggregated.reduce((acc, r) => acc + (r.byCat[c.id] ?? 0), 0);
      byCat[c.id] = Math.round((sum / stackAggregated.length) * 10) / 10;
    });
    return byCat;
  }, [stackAggregated, stackTeam?.statDefinition]);

  const stackRatingCategories = useMemo(() => {
    const def = stackTeam?.statDefinition ?? DEFAULT_STAT_DEFINITION;
    return def.categories.filter((c) => !isMeasurementCategory(def, c.id));
  }, [stackTeam?.statDefinition]);

  const handlePhotoInputChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setProfileError(null);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/player-photo", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "업로드에 실패했습니다.");
      }
      setProfileForm((prev) => ({ ...prev, photo: data.url ?? "" }));
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      // allow re-selecting the same file
      e.target.value = "";
    }
  }, []);

  useEffect(() => {
    if (!profilePlayer) return;
    setProfileForm({
      name: profilePlayer.name ?? "",
      position: profilePlayer.position ?? "",
      height: profilePlayer.height ?? "",
      weight: profilePlayer.weight ?? "",
      dateOfBirth: profilePlayer.dateOfBirth ?? "",
      gender: profilePlayer.gender ?? "",
      photo: profilePlayer.photo ?? "",
      phone: profilePlayer.phone ?? "",
    });
  }, [profilePlayer]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profilePlayer) return;
    setProfileSaving(true);
    setProfileError(null);
    try {
      const res = await fetch(`/api/players/${profilePlayer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileForm.name,
          position: profileForm.position || null,
          height: profileForm.height || null,
          weight: profileForm.weight || null,
          dateOfBirth: profileForm.dateOfBirth || null,
          gender: profileForm.gender || null,
          photo: profileForm.photo || null,
          phone: profileForm.phone || null,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = "저장에 실패했습니다.";
        try {
          const data = JSON.parse(text) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          if (text) message = text;
        }
        throw new Error(message);
      }
      const updated = (await res.json()) as Player;
      setPlayers((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setProfilePlayer(null);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">선수 관리</h2>
        <p className="text-sm text-slate-300">
          선수별로 스탯 보기를 누르면 해당 팀 스탯(집계)이 개인마다 보이게 열립니다. 스탯 평가는 팀 화면에서 평가 코너로 진행하세요.
        </p>
      </header>

      <div className="flex items-center justify-between gap-3 text-xs text-slate-300 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px]">팀 필터</span>
          <select
            value={filterTeamId}
            onChange={(e) => setFilterTeamId(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs outline-none focus:border-emerald-400"
          >
            <option value="all">전체 팀</option>
            {teamOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <span className="text-[11px] text-slate-400">
          표시: {visiblePlayers.length}명 / 총 {players.length}명
        </span>
        {filterTeamId !== "all" && teams.find((t) => t.id === filterTeamId) && (
          <button
            type="button"
            onClick={() => setStackTeam(teams.find((t) => t.id === filterTeamId) ?? null)}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            팀 스탯 (집계)
          </button>
        )}
      </div>

      {editingId && (
        <p className="rounded-lg border border-emerald-600/50 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200">
          수정 중: <strong>{players.find((p) => p.id === editingId)?.name ?? "선수"}</strong> — 아래 폼에서 변경 후 «선수 수정»을 누르세요.
        </p>
      )}

      <form
        ref={playerFormRef}
        id="player-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:grid md:grid-cols-[2fr,2fr,1.5fr,auto]"
      >
        <div className="space-y-1">
          <label className="text-xs text-slate-300">선수 이름</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            placeholder="예: 홍길동"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-300">소속 팀</label>
          {teamOptions.length === 0 ? (
            <div className="text-xs text-slate-400">
              먼저 팀 관리 화면에서 팀을 한 개 이상 등록해 주세요.
            </div>
          ) : (
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            >
              {teamOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-300">포지션</label>
          <input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            placeholder="예: FW / MF / DF / GK"
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            disabled={submitting || teamOptions.length === 0}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {submitting
              ? "저장 중..."
              : editingId
                ? "선수 수정"
                : "선수 추가"}
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            {editingId ? "취소" : "초기화"}
          </button>
        </div>
      </form>

      {error && (
        <p className="text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-4 py-2 text-left">이름</th>
              <th className="px-4 py-2 text-left">팀</th>
              <th className="px-4 py-2 text-left">포지션</th>
              <th className="px-4 py-2 text-left">팀 스탯</th>
              <th className="px-4 py-2 text-right">동작</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-slate-400"
                >
                  선수 목록을 불러오는 중입니다...
                </td>
              </tr>
            ) : players.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-slate-400"
                >
                  등록된 선수가 없습니다. 위 폼에서 선수를 추가해 보세요.
                </td>
              </tr>
            ) : (
              visiblePlayers.map((player) => {
                const team = teams.find((t) => t.id === player.teamId);
                return (
                  <tr key={player.id} className="border-t border-slate-800">
                    <td className="px-4 py-2">{player.name}</td>
                    <td className="px-4 py-2 text-slate-200">
                      {team?.name ?? "-"}
                    </td>
                    <td className="px-4 py-2 text-slate-300">
                      {player.position ?? "-"}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          const team = teams.find((t) => t.id === player.teamId);
                          if (team) setStackTeam(team);
                        }}
                        className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
                      >
                        스탯 보기
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right text-xs space-x-2">
                      <button
                        type="button"
                        onClick={() => setProfilePlayer(player)}
                        className="rounded-md border border-slate-600 px-2 py-1 hover:bg-slate-800"
                      >
                        개인 정보
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(player)}
                        className="rounded-md border border-slate-600 px-2 py-1 hover:bg-slate-800"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(player.id)}
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

      {stackTeam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setStackTeam(null)}
        >
          <div
            className="max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl text-base"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-xl font-semibold text-slate-100">팀 스탯 (선수) — {stackTeam.name}</h3>
            <p className="mb-5 text-sm text-slate-400">합쳐질 코치를 선택하면 해당 코치들의 선수 평가만 모아 자동 계산됩니다.</p>

            {stackLoading ? (
              <p className="text-sm text-slate-500">불러오는 중…</p>
            ) : (
              <>
                <div className="mb-5 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                  <p className="mb-2 text-sm font-semibold text-slate-400">합쳐질 코치 선택</p>
                  {stackStaff.length === 0 ? (
                    <p className="text-xs text-slate-500">팀에 등록된 코치·프론트가 없습니다. 팀 관리에서 수정 후 명단을 추가하세요.</p>
                  ) : (
                    <>
                      {stackCoaches.length === 0 && (
                        <p className="mb-2 text-xs text-amber-400/90">지도로 지정된 코치가 없습니다. 아래 팀 소속 인원 중 평가에 포함할 사람을 선택하세요.</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {(stackCoaches.length > 0 ? stackCoaches : stackStaff).map((c) => (
                          <label
                            key={c.id}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={stackSelectedEvaluators.has(c.id)}
                              onChange={() => toggleStackEvaluator(c.id)}
                              className="h-4 w-4 rounded border-slate-600 text-emerald-500"
                            />
                            <span className="text-slate-200">{c.name}</span>
                            <span className="text-xs text-slate-500">({c.role})</span>
                            {c.guidance && <span className="text-[10px] text-emerald-400">지도</span>}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {stackAggregated.length > 0 && stackRatingCategories.length > 0 && (
                  <div className="mb-5 rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                    <p className="mb-2 text-sm font-semibold text-slate-300">다각화 (전체 통계)</p>
                    <p className="mb-4 text-xs text-slate-500">팀 집계 대상 선수들의 카테고리별 평균을 다각형으로 표시합니다. (기입 1~5점 카테고리만)</p>
                    <StackRadarChart categories={stackRatingCategories} values={stackTeamAvgByCategory} />
                  </div>
                )}

                <div className="mb-5 rounded-xl border border-slate-700 bg-slate-800/30 overflow-hidden">
                  <p className="border-b border-slate-700 px-4 py-3 text-sm font-semibold text-slate-400">집계 결과 (선택한 코치 평가만)</p>
                  {stackAggregated.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">평가 데이터가 없거나 선택된 코치가 없습니다.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="px-4 py-3 text-left font-semibold text-slate-300">선수</th>
                            <th className="px-4 py-3 text-right font-semibold text-slate-300">전체</th>
                            {stackDef.categories.map((c) => (
                              <th key={c.id} className="px-3 py-3 text-right font-medium" style={{ color: c.color }}>{c.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {stackAggregated.map((row) => {
                            const pl = stackTeamPlayers.find((p) => p.id === row.subjectPlayerId);
                            return (
                              <tr key={row.subjectPlayerId} className="border-b border-slate-700/80">
                                <td className="px-4 py-3 font-medium text-slate-200">{pl?.name ?? row.subjectPlayerId}</td>
                                <td className="px-4 py-3 text-right font-semibold text-emerald-400">{row.overall.toFixed(1)}</td>
                                {stackDef.categories.map((cat) => (
                                  <td key={cat.id} className="px-3 py-3 text-right text-slate-400">{row.byCat[cat.id]?.toFixed(1) ?? "-"}</td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStackTeam(null)}
                    className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                  >
                    닫기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {profilePlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setProfilePlayer(null)}
        >
          <div
            className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-slate-100">개인 정보 — {profilePlayer.name}</h3>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {profileError && <p className="text-sm text-rose-400">{profileError}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">이름</label>
                  <input
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">포지션</label>
                  <input
                    value={profileForm.position}
                    onChange={(e) => setProfileForm((p) => ({ ...p, position: e.target.value }))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500"
                    placeholder="예: FW, MF, DF, GK"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">키 (cm)</label>
                  <input
                    value={profileForm.height}
                    onChange={(e) => setProfileForm((p) => ({ ...p, height: e.target.value }))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500"
                    placeholder="예: 180"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">체중 (kg)</label>
                  <input
                    value={profileForm.weight}
                    onChange={(e) => setProfileForm((p) => ({ ...p, weight: e.target.value }))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500"
                    placeholder="예: 70"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">생년월일</label>
                  <input
                    type="date"
                    value={profileForm.dateOfBirth}
                    onChange={(e) => setProfileForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">성별</label>
                  <select
                    value={profileForm.gender}
                    onChange={(e) => setProfileForm((p) => ({ ...p, gender: e.target.value }))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500"
                  >
                    <option value="">선택</option>
                    <option value="M">남</option>
                    <option value="F">여</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">전화번호</label>
                <input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500"
                  placeholder="예: 010-1234-5678"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">사진 (URL)</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoInputChange}
                    className="w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-100 hover:file:bg-slate-600"
                  />
                </div>
                {profileForm.photo && (
                  <div className="mt-2 flex justify-center">
                    <img
                      src={profileForm.photo}
                      alt=""
                      className="max-h-32 rounded-lg border border-slate-600 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setProfilePlayer(null)}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  닫기
                </button>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {profileSaving ? "저장 중…" : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


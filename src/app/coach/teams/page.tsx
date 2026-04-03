"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Player, Team, TeamOrganization, TeamStaff } from "@/lib/types";
import type { CategoryEvaluationType, StatDefinition } from "@/lib/types";
import { DEFAULT_STAT_DEFINITION, getEvaluationProgressPercent, getStatDefinitionTotalItems, getWeightedOverall } from "@/lib/statDefinition";

const defaultOrganization: TeamOrganization = {
  front: [],
  coaching: [],
  player: [],
};

export default function CoachTeamsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contextTeamId = searchParams.get("teamId");
  const [teams, setTeams] = useState<Team[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");
  const [organization, setOrganization] = useState<TeamOrganization>({ ...defaultOrganization });
  const [staffList, setStaffList] = useState<TeamStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [newStaffByRole, setNewStaffByRole] = useState<Record<string, { name: string; phone: string; email: string }>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamStackTeam, setTeamStackTeam] = useState<Team | null>(null);
  const [stackStaff, setStackStaff] = useState<TeamStaff[]>([]);
  const [stackEvaluations, setStackEvaluations] = useState<{ evaluatorStaffId: string; subjectStaffId: string; scores: Record<string, number[]> }[]>([]);
  const [stackSelectedEvaluators, setStackSelectedEvaluators] = useState<Set<string>>(new Set());
  const [stackLoading, setStackLoading] = useState(false);

  const [statActiveCats, setStatActiveCats] = useState<Set<string>>(new Set());
  const [statItemCounts, setStatItemCounts] = useState<Record<string, 3 | 5 | 7>>({});
  const [statItemLabels, setStatItemLabels] = useState<Record<string, string[]>>({});
  const [statSectionsOpen, setStatSectionsOpen] = useState<Set<string>>(new Set());
  const [statCategoryWeights, setStatCategoryWeights] = useState<Record<string, number>>({});
  const [statEvalType, setStatEvalType] = useState<Record<string, CategoryEvaluationType>>({});
  const [statEvalUnit, setStatEvalUnit] = useState<Record<string, string>>({});

  const [expandedEvaluations, setExpandedEvaluations] = useState<{ evaluatorStaffId: string; subjectStaffId: string; scores: Record<string, number[]> }[]>([]);
  const [expandedEvaluationsLoading, setExpandedEvaluationsLoading] = useState(false);
  const [expandedTeamPlayers, setExpandedTeamPlayers] = useState<Player[]>([]);
  const [expandedTeamPlayersLoading, setExpandedTeamPlayersLoading] = useState(false);
  const [evalCornerStaffId, setEvalCornerStaffId] = useState("");
  const [evalCornerPlayerId, setEvalCornerPlayerId] = useState("");

  const addRole = useCallback(
    (category: keyof TeamOrganization) => {
      setOrganization((prev) => ({
        ...prev,
        [category]: [...prev[category], ""],
      }));
    },
    [],
  );
  const setRoleAt = useCallback(
    (category: keyof TeamOrganization, index: number, value: string) => {
      setOrganization((prev) => {
        const next = [...prev[category]];
        next[index] = value;
        return { ...prev, [category]: next };
      });
    },
    [],
  );
  const removeRole = useCallback(
    (category: keyof TeamOrganization, index: number) => {
      setOrganization((prev) => ({
        ...prev,
        [category]: prev[category].filter((_, i) => i !== index),
      }));
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTeams() {
      try {
        setLoading(true);
        const adminOn =
          typeof window !== "undefined" &&
          window.localStorage.getItem("tmt:adminMode") === "on";
        const qs = new URLSearchParams();
        if (adminOn) {
          qs.set("listAll", "1");
        } else if (contextTeamId) {
          qs.set("contextTeamId", contextTeamId);
        }
        const url = qs.toString() ? `/api/teams?${qs.toString()}` : "/api/teams";
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) {
          throw new Error("팀 목록을 불러오지 못했습니다.");
        }
        const data: Team[] = await res.json();
        if (!cancelled) {
          setTeams(data);
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

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [contextTeamId]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setSeason("");
    setOrganization({ ...defaultOrganization });
    setStaffList([]);
    setNewStaffByRole({});
    setStatActiveCats(new Set());
    setStatItemCounts({});
    setStatItemLabels({});
    setStatSectionsOpen(new Set());
    setStatCategoryWeights({});
    setStatEvalType({});
    setStatEvalUnit({});
  }

  function initStatDefinitionFrom(def: StatDefinition | null | undefined) {
    const defToUse = def && def.categories?.length && def.items ? def : DEFAULT_STAT_DEFINITION;
    const cats = defToUse.categories;
    const items = defToUse.items;
    const active = new Set<string>();
    const counts: Record<string, 3 | 5 | 7> = {};
    const labels: Record<string, string[]> = {};
    for (const c of cats) {
      const arr = items[c.id];
      if (Array.isArray(arr) && arr.length > 0) {
        active.add(c.id);
        const len = Math.min(7, Math.max(3, arr.length));
        counts[c.id] = (len === 5 || len === 7 ? len : 3) as 3 | 5 | 7;
        labels[c.id] = arr.slice(0, counts[c.id]).map((s) => String(s ?? "").trim());
        while (labels[c.id].length < counts[c.id]) labels[c.id].push("");
      }
    }
    const weights: Record<string, number> = {};
    const activeArr = [...active];
    if (defToUse.categoryWeights && typeof defToUse.categoryWeights === "object") {
      activeArr.forEach((id) => { weights[id] = Math.max(0, Number(defToUse.categoryWeights![id]) ?? 0); });
    }
    if (Object.keys(weights).length === 0 && activeArr.length > 0) {
      const eq = Math.round((100 / activeArr.length) * 10) / 10;
      activeArr.forEach((id, i) => { weights[id] = i === activeArr.length - 1 ? 100 - eq * (activeArr.length - 1) : eq; });
    }
    setStatActiveCats(active);
    setStatItemCounts(counts);
    setStatItemLabels(labels);
    setStatSectionsOpen(new Set(active));
    setStatCategoryWeights(weights);
    const evalTypes: Record<string, CategoryEvaluationType> = {};
    const evalUnits: Record<string, string> = {};
    activeArr.forEach((id) => {
      evalTypes[id] = defToUse.categoryEvaluationType?.[id] === "measurement" ? "measurement" : "rating";
      evalUnits[id] = (defToUse.categoryUnit?.[id] ?? "").trim();
    });
    setStatEvalType(evalTypes);
    setStatEvalUnit(evalUnits);
  }

  function buildStatDefinition(): StatDefinition {
    const categories = DEFAULT_STAT_DEFINITION.categories.filter((c) => statActiveCats.has(c.id));
    const items: Record<string, string[]> = {};
    const categoryWeights: Record<string, number> = {};
    let weightSum = 0;
    for (const c of categories) {
      const count = statItemCounts[c.id] ?? 3;
      const raw = statItemLabels[c.id] ?? [];
      items[c.id] = Array.from({ length: count }, (_, i) => (raw[i] ?? "").trim() || `항목 ${i + 1}`);
      const w = Math.max(0, Number(statCategoryWeights[c.id]) ?? 0);
      categoryWeights[c.id] = w;
      weightSum += w;
    }
    if (weightSum > 0) {
      for (const c of categories) {
        categoryWeights[c.id] = Math.round((categoryWeights[c.id] / weightSum) * 1000) / 10;
      }
    } else if (categories.length > 0) {
      const eq = Math.round((100 / categories.length) * 10) / 10;
      categories.forEach((c, i) => { categoryWeights[c.id] = i === categories.length - 1 ? Math.round((100 - eq * (categories.length - 1)) * 10) / 10 : eq; });
    }
    const categoryEvaluationType: Record<string, CategoryEvaluationType> = {};
    const categoryUnit: Record<string, string> = {};
    categories.forEach((c) => {
      categoryEvaluationType[c.id] = statEvalType[c.id] === "measurement" ? "measurement" : "rating";
      categoryUnit[c.id] = (statEvalUnit[c.id] ?? "").trim();
    });
    return { categories, items, categoryWeights, categoryEvaluationType, categoryUnit };
  }

  const staffTeamId = editingId ?? expandedId;

  const orgRoles = useMemo(
    () => [...organization.front, ...organization.coaching],
    [organization.front, organization.coaching],
  );

  useEffect(() => {
    if (!staffTeamId) {
      setStaffList([]);
      return;
    }
    let cancelled = false;
    setStaffLoading(true);
    fetch(`/api/teams/${staffTeamId}/staff`)
      .then((r) => r.json())
      .then((list: TeamStaff[]) => {
        if (!cancelled) setStaffList(list);
      })
      .catch(() => {
        if (!cancelled) setStaffList([]);
      })
      .finally(() => {
        if (!cancelled) setStaffLoading(false);
      });
    return () => { cancelled = true; };
  }, [staffTeamId]);

  useEffect(() => {
    if (!expandedId) {
      setExpandedEvaluations([]);
      setExpandedTeamPlayers([]);
      setEvalCornerStaffId("");
      setEvalCornerPlayerId("");
      return;
    }
    let cancelled = false;
    setExpandedEvaluationsLoading(true);
    const safeJson = async (r: Response, fallback: unknown) => {
      const text = await r.text();
      if (!text.trim()) return fallback;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return fallback;
      }
    };
    setExpandedTeamPlayersLoading(true);
    Promise.all([
      fetch(`/api/teams/${expandedId}/evaluations`).then((r) => safeJson(r, []) as Promise<{ evaluatorStaffId: string; subjectStaffId: string; scores: Record<string, number[]> }[]>),
      fetch(`/api/players?teamId=${encodeURIComponent(expandedId)}`).then((r) =>
        r.text().then((text) => {
          if (!text.trim()) return [] as Player[];
          try {
            return JSON.parse(text) as Player[];
          } catch {
            return [] as Player[];
          }
        }),
      ),
    ])
      .then(([list, players]) => {
        if (!cancelled) {
          setExpandedEvaluations(list);
          setExpandedTeamPlayers(Array.isArray(players) ? players : []);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setExpandedEvaluationsLoading(false);
          setExpandedTeamPlayersLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [expandedId]);

  const expandedCoaches = useMemo(
    () => (expandedId && staffTeamId === expandedId ? staffList.filter((s) => s.guidance) : []),
    [expandedId, staffTeamId, staffList],
  );

  useEffect(() => {
    if (!expandedId) return;
    if (expandedCoaches.length && !evalCornerStaffId) setEvalCornerStaffId(expandedCoaches[0].id);
  }, [expandedId, expandedCoaches, evalCornerStaffId]);

  useEffect(() => {
    if (!expandedId) return;
    if (expandedTeamPlayers.length && !evalCornerPlayerId) setEvalCornerPlayerId(expandedTeamPlayers[0].id);
  }, [expandedId, expandedTeamPlayers, evalCornerPlayerId]);

  const setNewStaffField = useCallback(
    (role: string, field: "name" | "phone" | "email", value: string) => {
      setNewStaffByRole((prev) => ({
        ...prev,
        [role]: { ...(prev[role] ?? { name: "", phone: "", email: "" }), [field]: value },
      }));
    },
    [],
  );

  async function handleAddStaff(role: string, roleIndex: number) {
    if (!editingId) return;
    const slotKey = `${role}-${roleIndex}`;
    const row = newStaffByRole[slotKey] ?? { name: "", phone: "", email: "" };
    if (!row.name.trim()) return;
    try {
      setError(null);
      const res = await fetch(`/api/teams/${editingId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          name: row.name.trim(),
          phone: row.phone.trim() || undefined,
          email: row.email.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "등록에 실패했습니다.");
      const created = data as TeamStaff;
      setStaffList((prev) => [...prev, created]);
      setNewStaffByRole((prev) => ({ ...prev, [slotKey]: { name: "", phone: "", email: "" } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "등록에 실패했습니다.");
    }
  }

  async function handleRemoveStaff(staffId: string, teamId?: string) {
    const tid = teamId ?? editingId ?? expandedId;
    if (!tid) return;
    try {
      setError(null);
      const res = await fetch(`/api/teams/${tid}/staff/${staffId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제에 실패했습니다.");
      setStaffList((prev) => prev.filter((s) => s.id !== staffId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  }

  async function handleToggleGuidance(staffId: string, current: boolean, teamId?: string) {
    const tid = teamId ?? editingId ?? expandedId;
    if (!tid) return;
    const next = !current;
    try {
      setError(null);
      const res = await fetch(`/api/teams/${tid}/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guidance: next }),
      });
      if (!res.ok) throw new Error("지도 설정에 실패했습니다.");
      setStaffList((prev) => prev.map((s) => (s.id === staffId ? { ...s, guidance: next } : s)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "지도 설정에 실패했습니다.");
    }
  }

  async function handleSetAllEvaluators(value: boolean) {
    if (!editingId) return;
    const toUpdate = staffList.filter((s) => !!s.guidance !== value);
    if (toUpdate.length === 0) return;
    setError(null);
    try {
      const results = await Promise.all(
        toUpdate.map((s) =>
          fetch(`/api/teams/${editingId}/staff/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guidance: value }),
          }).then((r) => r.ok),
        ),
      );
      if (results.every(Boolean)) setStaffList((prev) => prev.map((s) => ({ ...s, guidance: value })));
      else setError("일부 지도 설정에 실패했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "평가자 일괄 설정에 실패했습니다.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSubmitting(true);
      setError(null);

      if (editingId) {
        const res = await fetch(`/api/teams/${editingId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            season: season.trim() || "시즌 미정",
            organization,
            statDefinition: buildStatDefinition(),
          }),
        });

        if (!res.ok) {
          throw new Error("팀을 수정하지 못했습니다.");
        }

        const updated: Team = await res.json();
        setTeams((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t)),
        );
      } else {
        const res = await fetch("/api/teams", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            season: season.trim() || "시즌 미정",
            organization,
          }),
        });

        if (!res.ok) {
          throw new Error("팀을 저장하지 못했습니다.");
        }

        const created: Team = await res.json();
        setTeams((prev) => [...prev, created]);
      }

      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(team: Team) {
    setEditingId(team.id);
    setName(team.name);
    setSeason(team.season);
    setOrganization(team.organization ?? { ...defaultOrganization });
    initStatDefinitionFrom(team.statDefinition);
  }

  async function handleDelete(id: string) {
    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch(`/api/teams/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("팀을 삭제하지 못했습니다.");
      }

      setTeams((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) {
        resetForm();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTeam = teams.find((t) => t.id === editingId);

  function toggleExpand(teamId: string) {
    setExpandedId((prev) => (prev === teamId ? null : teamId));
  }

  const staffByRole = useMemo(() => {
    const map: Record<string, TeamStaff[]> = {};
    for (const s of staffList) {
      if (!map[s.role]) map[s.role] = [];
      map[s.role].push(s);
    }
    return map;
  }, [staffList]);

  useEffect(() => {
    if (!teamStackTeam) {
      setStackStaff([]);
      setStackEvaluations([]);
      setStackSelectedEvaluators(new Set());
      return;
    }
    let cancelled = false;
    setStackLoading(true);
    const tid = teamStackTeam.id;
    const safeJson = async (r: Response, fallback: unknown) => {
      const text = await r.text();
      if (!text.trim()) return fallback;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return fallback;
      }
    };
    Promise.all([
      fetch(`/api/teams/${tid}/staff`).then((r) => safeJson(r, []) as Promise<TeamStaff[]>),
      fetch(`/api/teams/${tid}/evaluations`).then((r) => safeJson(r, []) as Promise<{ evaluatorStaffId: string; subjectStaffId: string; scores: Record<string, number[]> }[]>),
    ])
      .then(([staffListRes, evalsRes]) => {
        if (cancelled) return;
        setStackStaff(staffListRes);
        setStackEvaluations(evalsRes);
        const coaches = staffListRes.filter((s) => s.guidance).map((s) => s.id);
        setStackSelectedEvaluators(new Set(coaches));
      })
      .finally(() => {
        if (!cancelled) setStackLoading(false);
      });
    return () => { cancelled = true; };
  }, [teamStackTeam]);

  const stackCoaches = useMemo(() => stackStaff.filter((s) => s.guidance), [stackStaff]);
  const stackDef = teamStackTeam?.statDefinition ?? DEFAULT_STAT_DEFINITION;
  const stackAggregated = useMemo(() => {
    const selected = stackSelectedEvaluators;
    const evals = stackEvaluations.filter((e) => selected.has(e.evaluatorStaffId));
    const bySubject: Record<string, { count: number; sumByCat: Record<string, number>; countByCat: Record<string, number> }> = {};
    const def = teamStackTeam?.statDefinition ?? DEFAULT_STAT_DEFINITION;
    for (const e of evals) {
      if (!bySubject[e.subjectStaffId]) {
        bySubject[e.subjectStaffId] = { count: 0, sumByCat: {}, countByCat: {} };
      }
      const sub = bySubject[e.subjectStaffId];
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
    const result: { subjectStaffId: string; overall: number; byCat: Record<string, number> }[] = [];
    for (const [subjectStaffId, data] of Object.entries(bySubject)) {
      const byCat: Record<string, number> = {};
      def.categories.forEach((c) => {
        const avg = data.countByCat[c.id] ? data.sumByCat[c.id]! / data.countByCat[c.id]! : 0;
        byCat[c.id] = Math.round(avg * 10) / 10;
      });
      const overall = getWeightedOverall(byCat, def);
      result.push({ subjectStaffId, overall, byCat });
    }
    result.sort((a, b) => b.overall - a.overall);
    return result;
  }, [stackEvaluations, stackSelectedEvaluators, teamStackTeam?.statDefinition]);

  const toggleStackEvaluator = useCallback((staffId: string) => {
    setStackSelectedEvaluators((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">팀 관리</h2>
        <p className="text-sm text-slate-300">
          팀 이름을 누르면 아래로 코치·프론트 명단과 <strong>선수 명단(지도 평가 대상)</strong>이 펼쳐집니다. 선수 명단은 선수 관리에 등록된 해당 팀 소속 선수입니다. 수정을 누르면 코치·프론트를 등록·수정할 수 있습니다.
        </p>
        {contextTeamId && (
          <p className="rounded-lg border border-emerald-600/35 bg-emerald-950/25 px-3 py-2 text-xs text-emerald-100/90">
            선택한 팀과 같은 조직(관리자)에 속한 팀만 보입니다. 다른 팀·조직은{" "}
            <Link href="/coach" className="text-sky-400 underline hover:text-sky-300">
              코치 대시보드
            </Link>
            에서 다시 들어오세요.
          </p>
        )}
      </header>

      {editingId && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-1 text-base font-semibold text-slate-100">
            저장된 명단
            {selectedTeam && (
              <span className="ml-2 font-normal text-emerald-400/90">— {selectedTeam.name}</span>
            )}
          </h3>
          <p className="mb-2 text-xs text-slate-400">
            직책별 인원입니다. 지도 체크·삭제·아래에서 인원 추가할 수 있습니다.
          </p>
          <p className="mb-4 text-xs text-slate-500">
            <strong className="text-slate-400">평가자 설정:</strong> 지도로 지정된 인원만 스탯 평가 시 평가자로 선택됩니다.
          </p>
          {staffList.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleSetAllEvaluators(true)}
                className="rounded-lg border border-emerald-600/70 bg-emerald-900/30 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-800/40"
              >
                평가자 모두 선택
              </button>
              <button
                type="button"
                onClick={() => handleSetAllEvaluators(false)}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                평가자 전체 해제
              </button>
            </div>
          )}
          {staffLoading ? (
            <p className="text-sm text-slate-500">불러오는 중…</p>
          ) : staffList.length === 0 && orgRoles.length === 0 ? (
            <p className="text-sm text-slate-500">
              팀 조직을 저장한 뒤 수정하면 직책이 나옵니다. 아래 폼에서 직책을 추가하고 저장하세요.
            </p>
          ) : staffList.length === 0 ? (
            <p className="text-sm text-slate-500">등록된 인원이 없습니다. 아래에서 추가하세요.</p>
          ) : (
            <div className="space-y-4">
              {orgRoles.map((role, roleIndex) => {
                const staffForRole = staffList.filter((s) => s.role === role);
                if (staffForRole.length === 0) return null;
                return (
                  <div key={`${role}-${roleIndex}`} className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-3">
                    <p className="mb-2 text-xs font-medium text-emerald-400/90">{role}</p>
                    <ul className="space-y-1.5">
                      {staffForRole.map((s) => (
                        <li
                          key={s.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900/80 px-3 py-2 text-sm"
                        >
                          <span className="font-medium text-slate-200">{s.name}</span>
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <label className="flex cursor-pointer items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={!!s.guidance}
                                onChange={() => handleToggleGuidance(s.id, !!s.guidance)}
                                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
                              />
                              <span className="text-slate-300">지도</span>
                            </label>
                            {s.phone && <span>{s.phone}</span>}
                            {s.email && <span>{s.email}</span>}
                            <button
                              type="button"
                              onClick={() => handleRemoveStaff(s.id)}
                              className="rounded px-1.5 py-0.5 text-rose-400 hover:bg-rose-950/50"
                            >
                              삭제
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-slate-300">팀 이름</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              placeholder="예: U-15 주니어팀"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-slate-300">시즌</label>
            <input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              placeholder="예: 2025 시즌"
            />
          </div>
        </div>

        {editingId && (
          <div className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              팀 조직 (직책·역할·포지션)
            </p>
            <p className="mb-3 text-xs text-slate-400">
              버튼을 누르면 해당 항목 아래에 직책 입력 칸이 추가됩니다. 모두 작성 후 저장하세요.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addRole("front")}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
              >
                + 프론트
              </button>
              <button
                type="button"
                onClick={() => addRole("coaching")}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
              >
                + 코치
              </button>
              <button
                type="button"
                onClick={() => addRole("coaching")}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
              >
                + 코칭스텝
              </button>
            </div>
            <div className="mt-3 space-y-4">
              {organization.front.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">프론트</p>
                  <div className="flex flex-wrap gap-2">
                    {organization.front.map((v, i) => (
                      <div key={`f-${i}`} className="flex items-center gap-1">
                        <input
                          value={v}
                          onChange={(e) => setRoleAt("front", i, e.target.value)}
                          className="w-36 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm outline-none focus:border-emerald-500"
                          placeholder="직책명"
                        />
                        <button
                          type="button"
                          onClick={() => removeRole("front", i)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-slate-200"
                          aria-label="삭제"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {organization.coaching.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">코치·코칭스텝</p>
                  <div className="flex flex-wrap gap-2">
                    {organization.coaching.map((v, i) => (
                      <div key={`c-${i}`} className="flex items-center gap-1">
                        <input
                          value={v}
                          onChange={(e) => setRoleAt("coaching", i, e.target.value)}
                          className="w-36 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm outline-none focus:border-emerald-500"
                          placeholder="직책명"
                        />
                        <button
                          type="button"
                          onClick={() => removeRole("coaching", i)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-slate-200"
                          aria-label="삭제"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {editingId && (
          <div className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              스탯 정의 (관리자 설정)
            </p>
            <p className="mb-3 text-xs text-slate-400">
              평가에 사용할 카테고리를 선택하고, 카테고리당 3·5·7개 항목 수·항목명·중요도(%)를 입력하세요. 중요도 합 100% 권장(가중 평균 반영). 저장 시 이 팀의 스탯 정의로 반영됩니다.
            </p>
            <div className="space-y-2">
              {DEFAULT_STAT_DEFINITION.categories.map((cat) => {
                const active = statActiveCats.has(cat.id);
                const count = statItemCounts[cat.id] ?? 3;
                const labels = statItemLabels[cat.id] ?? Array.from({ length: count }, () => "");
                const open = statSectionsOpen.has(cat.id);
                return (
                  <div key={cat.id} className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => {
                          const next = new Set(statActiveCats);
                          if (e.target.checked) {
                            next.add(cat.id);
                            setStatItemCounts((prev) => ({ ...prev, [cat.id]: 3 }));
                            setStatItemLabels((prev) => ({ ...prev, [cat.id]: ["", "", ""] }));
                            setStatSectionsOpen((prev) => new Set([...prev, cat.id]));
                          } else {
                            next.delete(cat.id);
                            setStatItemCounts((prev => { const u = { ...prev }; delete u[cat.id]; return u; }));
                            setStatItemLabels((prev => { const u = { ...prev }; delete u[cat.id]; return u; }));
                            setStatSectionsOpen((prev) => { const s = new Set(prev); s.delete(cat.id); return s; });
                          }
                          setStatActiveCats(next);
                        }}
                        className="rounded border-slate-600"
                      />
                      <span className="text-sm font-medium text-slate-200" style={{ color: cat.color }}>{cat.label}</span>
                    </label>
                    {active && (
                      <>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <span className="text-xs text-slate-500">항목 개수:</span>
                          {([3, 5, 7] as const).map((n) => (
                            <label key={n} className="flex cursor-pointer items-center gap-1">
                              <input
                                type="radio"
                                name={`stat-count-${cat.id}`}
                                checked={count === n}
                                onChange={() => {
                                  setStatItemCounts((prev) => ({ ...prev, [cat.id]: n }));
                                  setStatItemLabels((prev) => {
                                    const cur = prev[cat.id] ?? [];
                                    const next = [...cur];
                                    while (next.length < n) next.push("");
                                    return { ...prev, [cat.id]: next.slice(0, n) };
                                  });
                                }}
                                className="border-slate-600"
                              />
                              <span className="text-xs text-slate-300">{n}개</span>
                            </label>
                          ))}
                          <span className="ml-2 text-xs text-slate-500">· 중요도(%):</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={statCategoryWeights[cat.id] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value === "" ? 0 : Math.max(0, Math.min(100, Number(e.target.value) || 0));
                              setStatCategoryWeights((prev) => ({ ...prev, [cat.id]: v }));
                            }}
                            placeholder="0"
                            className="w-14 rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-xs outline-none focus:border-emerald-500"
                          />
                          <span className="ml-2 text-xs text-slate-500">· 평가 방식:</span>
                          <label className="flex cursor-pointer items-center gap-1">
                            <input
                              type="radio"
                              name={`stat-eval-${cat.id}`}
                              checked={(statEvalType[cat.id] ?? "rating") === "rating"}
                              onChange={() => setStatEvalType((prev) => ({ ...prev, [cat.id]: "rating" }))}
                              className="border-slate-600"
                            />
                            <span className="text-xs text-slate-300">기입(1~5)</span>
                          </label>
                          <label className="flex cursor-pointer items-center gap-1">
                            <input
                              type="radio"
                              name={`stat-eval-${cat.id}`}
                              checked={(statEvalType[cat.id] ?? "rating") === "measurement"}
                              onChange={() => setStatEvalType((prev) => ({ ...prev, [cat.id]: "measurement" }))}
                              className="border-slate-600"
                            />
                            <span className="text-xs text-slate-300">측정</span>
                          </label>
                          {(statEvalType[cat.id] ?? "rating") === "measurement" && (
                            <>
                              <span className="text-xs text-slate-500">단위:</span>
                              <input
                                type="text"
                                value={statEvalUnit[cat.id] ?? ""}
                                onChange={(e) => setStatEvalUnit((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                                placeholder="예: 초, m, kg"
                                className="w-20 rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-xs outline-none focus:border-emerald-500"
                              />
                            </>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setStatSectionsOpen((prev) => (prev.has(cat.id) ? (() => { const s = new Set(prev); s.delete(cat.id); return s; })() : new Set([...prev, cat.id])))}
                            className="text-xs text-slate-400 hover:text-slate-200"
                          >
                            {open ? "항목명 접기" : "항목명 펼치기"}
                          </button>
                        </div>
                        {open && (
                          <div className="mt-2 space-y-1.5">
                            {Array.from({ length: count }, (_, i) => (
                              <input
                                key={i}
                                value={labels[i] ?? ""}
                                onChange={(e) => {
                                  const next = [...(statItemLabels[cat.id] ?? [])];
                                  while (next.length <= i) next.push("");
                                  next[i] = e.target.value;
                                  setStatItemLabels((prev) => ({ ...prev, [cat.id]: next }));
                                }}
                                placeholder={`항목 ${i + 1}`}
                                className="w-full max-w-xs rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm outline-none focus:border-emerald-500"
                              />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {submitting
              ? "저장 중..."
              : editingId
                ? "팀 수정"
                : "팀 추가"}
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

      {editingId && orgRoles.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-200">인원 추가</h3>
          <p className="mb-4 text-xs text-slate-400">
            직책별로 이름·연락처·이메일 입력 후 추가하면 위 저장된 명단에 반영됩니다.
          </p>
          <div className="space-y-4">
            {orgRoles.map((role, roleIndex) => {
              const slotKey = `${role}-${roleIndex}`;
              const newRow = newStaffByRole[slotKey] ?? { name: "", phone: "", email: "" };
              return (
                <div key={slotKey} className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-3">
                  <p className="mb-2 text-xs font-medium text-emerald-400/90">{role}</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      type="text"
                      value={newRow.name}
                      onChange={(e) => setNewStaffField(slotKey, "name", e.target.value)}
                      placeholder="이름"
                      className="w-28 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                    />
                    <input
                      type="text"
                      value={newRow.phone}
                      onChange={(e) => setNewStaffField(slotKey, "phone", e.target.value)}
                      placeholder="연락처"
                      className="w-32 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                    />
                    <input
                      type="text"
                      value={newRow.email}
                      onChange={(e) => setNewStaffField(slotKey, "email", e.target.value)}
                      placeholder="이메일"
                      className="w-40 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddStaff(role, roleIndex)}
                      className="rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                    >
                      추가
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-4 py-2 text-left">팀 이름</th>
              <th className="px-4 py-2 text-left">시즌</th>
              <th className="px-4 py-2 text-left">팀 스탯</th>
              <th className="px-4 py-2 text-right">동작</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-sm text-slate-400"
                >
                  팀 목록을 불러오는 중입니다...
                </td>
              </tr>
            ) : teams.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-sm text-slate-400"
                >
                  등록된 팀이 없습니다. 위 폼에서 팀을 추가해 보세요.
                </td>
              </tr>
            ) : (
              teams.map((team) => (
                <Fragment key={team.id}>
                  <tr className="border-t border-slate-800 hover:bg-slate-800/30">
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="cursor-pointer font-medium text-slate-100 hover:text-emerald-300"
                          onClick={() => toggleExpand(team.id)}
                        >
                          {team.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-slate-300">{team.season}</td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/coach/teams/${team.id}/stats`)}
                        className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        스탯 보기
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right space-x-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedId(team.id);
                          handleEdit(team);
                        }}
                        className="rounded-md border border-slate-600 px-2 py-1 hover:bg-slate-800"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(team.id)}
                        className="rounded-md border border-rose-600 px-2 py-1 text-rose-200 hover:bg-rose-950"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                  {expandedId === team.id && (
                    <tr key={`${team.id}-expanded`}>
                      <td colSpan={4} className="border-t-0 bg-slate-900/50 px-4 py-3">
                        {staffTeamId !== team.id || staffLoading ? (
                          <p className="text-sm text-slate-500">불러오는 중…</p>
                        ) : staffList.length === 0 ? (
                          <p className="text-sm text-slate-500">등록된 코치·프론트가 없습니다. 수정에서 추가하세요.</p>
                        ) : (
                          <div className="space-y-3">
                            {expandedId === team.id && (
                              <div className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-3">
                                <p className="mb-2 text-xs font-semibold text-slate-400">평가 진행률</p>
                                {expandedEvaluationsLoading ? (
                                  <p className="text-xs text-slate-500">불러오는 중…</p>
                                ) : (() => {
                                  const def = team.statDefinition ?? DEFAULT_STAT_DEFINITION;
                                  const totalItems = getStatDefinitionTotalItems(def);
                                  const coaches = staffList.filter((s) => s.guidance).length;
                                  const maxEvaluations = coaches * staffList.length || 0;
                                  const completed = expandedEvaluations.length;
                                  const avgPct = expandedEvaluations.length
                                    ? Math.round(
                                        expandedEvaluations.reduce((sum, e) => sum + getEvaluationProgressPercent(e.scores, def), 0) /
                                          expandedEvaluations.length,
                                      )
                                    : 0;
                                  return (
                                    <p className="text-sm text-slate-300">
                                      스태프 평가: <span className="font-medium text-emerald-400/90">{completed}건</span>
                                      {maxEvaluations > 0 && (
                                        <> / 최대 {maxEvaluations}건</>
                                      )}
                                      {totalItems > 0 && (
                                        <> · 평균 항목 채움 <span className="font-medium text-emerald-400/90">{avgPct}%</span></>
                                      )}
                                    </p>
                                  );
                                })()}
                              </div>
                            )}
                            {Object.entries(staffByRole).map(([role, list]) => (
                            <div key={role} className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-3">
                                <p className="mb-1 text-xs font-medium text-emerald-400/90">{role}</p>
                                {role === "코치·코칭스텝" && (
                                  <p className="mb-2 text-[11px] text-slate-400">
                                    지도 체크된 코치는 평가 화면과 과제 평가자 지정에서 기본 평가자로 사용됩니다.
                                    (지정된 코치가 없으면 팀 전체 스태프가 후보로 사용됩니다.)
                                  </p>
                                )}
                                <ul className="space-y-1.5">
                                  {list.map((s) => (
                                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">{s.name}</span>
                                        {s.phone && <span className="text-slate-400">{s.phone}</span>}
                                        {s.email && <span className="text-slate-400">{s.email}</span>}
                                      </div>
                                      <div className="flex shrink-0 items-center gap-3">
                                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
                                          <input
                                            type="checkbox"
                                            checked={!!s.guidance}
                                            onChange={() => handleToggleGuidance(s.id, !!s.guidance, s.teamId)}
                                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
                                          />
                                          <span className="text-slate-300">지도</span>
                                        </label>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const params = new URLSearchParams({
                                              teamId: s.teamId,
                                              evaluatorStaffId: s.id,
                                            });
                                            router.push(`/coach/players/evaluate?${params.toString()}`);
                                          }}
                                          className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
                                        >
                                          평가
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const params = new URLSearchParams({
                                              staffId: s.id,
                                            });
                                            router.push(`/coach/personal-tasks?${params.toString()}`);
                                          }}
                                          className="rounded border border-emerald-600/70 bg-emerald-900/40 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-800/60"
                                        >
                                          개인 요청함
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveStaff(s.id, s.teamId)}
                                          className="rounded border border-rose-600/70 bg-rose-950/50 px-2 py-1 text-xs text-rose-300 hover:bg-rose-900/50"
                                        >
                                          삭제
                                        </button>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                            <div className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 p-3">
                              <p className="mb-2 text-xs font-semibold text-emerald-300/90">선수 스탯 평가 코너</p>
                              <p className="mb-3 text-xs text-slate-400">해당 팀 지도진이 해당 팀 선수 중 한 명을 골라 스탯 평가를 진행합니다. 평가자와 대상 선수를 선택한 뒤 평가하기를 누르세요.</p>
                              {expandedTeamPlayersLoading || (expandedId && staffTeamId === expandedId && staffLoading) ? (
                                <p className="text-xs text-slate-500">불러오는 중…</p>
                              ) : expandedCoaches.length === 0 ? (
                                <p className="text-sm text-slate-500">지도로 지정된 코치가 없습니다. 수정에서 코치·프론트를 등록하고 지도를 체크하세요.</p>
                              ) : expandedTeamPlayers.length === 0 ? (
                                <p className="text-sm text-slate-500">등록된 선수가 없습니다. 선수 관리에서 이 팀 소속 선수를 추가하세요.</p>
                              ) : (
                                <div className="flex flex-wrap items-end gap-3">
                                  <div className="space-y-1">
                                    <label className="block text-xs text-slate-400">평가자 (지도진)</label>
                                    <select
                                      value={evalCornerStaffId}
                                      onChange={(e) => setEvalCornerStaffId(e.target.value)}
                                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500"
                                    >
                                      {expandedCoaches.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-xs text-slate-400">평가 대상 선수</label>
                                    <select
                                      value={evalCornerPlayerId}
                                      onChange={(e) => setEvalCornerPlayerId(e.target.value)}
                                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500"
                                    >
                                      {expandedTeamPlayers.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}{p.position ? ` (${p.position})` : ""}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const p = expandedTeamPlayers.find((x) => x.id === evalCornerPlayerId);
                                      if (!p || !evalCornerStaffId) return;
                                      const params = new URLSearchParams({
                                        teamId: p.teamId,
                                        playerId: p.id,
                                        name: p.name,
                                        position: p.position ?? "",
                                        evaluatorStaffId: evalCornerStaffId,
                                      });
                                      router.push(`/coach/players/evaluate?${params.toString()}`);
                                    }}
                                    disabled={!evalCornerStaffId || !evalCornerPlayerId}
                                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                                  >
                                    평가하기
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-3">
                              <p className="mb-2 text-xs font-semibold text-slate-400">선수 명단 (지도 평가 대상)</p>
                              <p className="mb-2 text-xs text-slate-500">선수 관리에 등록된 해당 팀 선수입니다. 위 평가 코너에서 평가자와 대상을 선택해 평가하세요.</p>
                              {expandedTeamPlayersLoading ? (
                                <p className="text-xs text-slate-500">불러오는 중…</p>
                              ) : expandedTeamPlayers.length === 0 ? (
                                <p className="text-sm text-slate-500">등록된 선수가 없습니다. 선수 관리에서 이 팀 소속 선수를 추가하세요.</p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {expandedTeamPlayers.map((p) => (
                                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">{p.name}</span>
                                        {p.position && <span className="text-slate-400">{p.position}</span>}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {teamStackTeam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setTeamStackTeam(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-base font-semibold text-slate-100">팀 스탯 — {teamStackTeam.name}</h3>
            <p className="mb-4 text-xs text-slate-400">합쳐질 코치를 선택하면 해당 코치들의 평가만 모아 자동 계산됩니다.</p>

            {stackLoading ? (
              <p className="text-sm text-slate-500">불러오는 중…</p>
            ) : (
              <>
                <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800/50 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-400">합쳐질 코치 선택</p>
                  <div className="flex flex-wrap gap-2">
                    {stackCoaches.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={stackSelectedEvaluators.has(c.id)}
                          onChange={() => toggleStackEvaluator(c.id)}
                          className="h-4 w-4 rounded border-slate-600 text-emerald-500"
                        />
                        <span className="text-slate-200">{c.name}</span>
                        <span className="text-xs text-slate-500">({c.role})</span>
                      </label>
                    ))}
                    {stackCoaches.length === 0 && (
                      <p className="text-xs text-slate-500">지도로 지정된 코치가 없습니다.</p>
                    )}
                  </div>
                </div>

                <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800/30 overflow-hidden">
                  <p className="border-b border-slate-700 px-3 py-2 text-xs font-semibold text-slate-400">집계 결과 (선택한 코치 평가만)</p>
                  {stackAggregated.length === 0 ? (
                    <p className="p-3 text-sm text-slate-500">평가 데이터가 없거나 선택된 코치가 없습니다.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">대상</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-300">전체</th>
                            {stackDef.categories.map((c) => (
                              <th key={c.id} className="px-2 py-2 text-right font-medium" style={{ color: c.color }}>{c.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {stackAggregated.map((row) => {
                            const staff = stackStaff.find((s) => s.id === row.subjectStaffId);
                            return (
                              <tr key={row.subjectStaffId} className="border-b border-slate-700/80">
                                <td className="px-3 py-2 font-medium text-slate-200">{staff?.name ?? row.subjectStaffId}</td>
                                <td className="px-3 py-2 text-right font-semibold text-emerald-400">{row.overall.toFixed(1)}</td>
                                {stackDef.categories.map((cat) => (
                                  <td key={cat.id} className="px-2 py-2 text-right text-slate-400">{row.byCat[cat.id]?.toFixed(1) ?? "-"}</td>
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
                    onClick={() => setTeamStackTeam(null)}
                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                  >
                    닫기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

const FIELD_W = 400;
const FIELD_H = 575;
const PAD = { l: 28, r: 28, t: 28, b: 28 };
const FW = FIELD_W - PAD.l - PAD.r;
const FH = FIELD_H - PAD.t - PAD.b;

/* 경기장 포인트 색상: 서로 구분되도록 색조 분리 (빨강·분홍·주황·청록·파랑·보라·초록·호박·인디고 등) */
const ATK_TYPES = [
  { id: "shot_on", label: "유효슈팅", color: "#DC2626" },
  { id: "shot_off", label: "슈팅(빗나감)", color: "#DB2777" },
  { id: "keypass", label: "키패스", color: "#EA580C" },
  { id: "cross", label: "크로스", color: "#0D9488" },
  { id: "dribble", label: "드리블", color: "#2563EB" },
];
const DEF_TYPES = [
  { id: "tackle", label: "태클", color: "#7C3AED" },
  { id: "intercept", label: "인터셉트", color: "#059669" },
  { id: "clearance", label: "클리어런스", color: "#B45309" },
  { id: "block", label: "블록", color: "#4F46E5" },
  { id: "press", label: "압박", color: "#BE123C" },
];
const GK_TYPES = [
  { id: "save", label: "세이브", color: "#06B6D4" },
  { id: "goal_in", label: "실점", color: "#B91C1C" },
  { id: "punch", label: "펀칭", color: "#CA8A04" },
  { id: "catch", label: "캐치", color: "#0284C7" },
  { id: "dist_long", label: "롱킥 배급", color: "#6D28D9" },
  { id: "dist_short", label: "숏 배급", color: "#14B8A6" },
];

const GK_ZONES = [
  { id: "tl", label: "좌상단", color: "#E24B4A", gx: 0, gy: 0, gw: 1 / 3, gh: 0.45 },
  { id: "tc", label: "중상단", color: "#EF9F27", gx: 1 / 3, gy: 0, gw: 1 / 3, gh: 0.45 },
  { id: "tr", label: "우상단", color: "#E24B4A", gx: 2 / 3, gy: 0, gw: 1 / 3, gh: 0.45 },
  { id: "ml", label: "좌중단", color: "#BA7517", gx: 0, gy: 0.45, gw: 1 / 3, gh: 0.35 },
  { id: "mc", label: "정중앙", color: "#85B7EB", gx: 1 / 3, gy: 0.45, gw: 1 / 3, gh: 0.35 },
  { id: "mr", label: "우중단", color: "#BA7517", gx: 2 / 3, gy: 0.45, gw: 1 / 3, gh: 0.35 },
  { id: "bl", label: "좌하단", color: "#1D9E75", gx: 0, gy: 0.8, gw: 1 / 3, gh: 0.2 },
  { id: "bc", label: "중하단", color: "#5DCAA5", gx: 1 / 3, gy: 0.8, gw: 1 / 3, gh: 0.2 },
  { id: "br", label: "우하단", color: "#1D9E75", gx: 2 / 3, gy: 0.8, gw: 1 / 3, gh: 0.2 },
];

const ZONES = [
  { id: "box", label: "페널티 박스", color: "#E24B4A", test: (x: number, y: number) => x >= 0.3 && x <= 0.7 && y <= 0.2 },
  { id: "leftWing", label: "좌측 상단", color: "#EF9F27", test: (x: number, y: number) => x < 0.3 && y <= 0.35 },
  { id: "rightWing", label: "우측 상단", color: "#EF9F27", test: (x: number, y: number) => x > 0.7 && y <= 0.35 },
  { id: "centerAtk", label: "중앙 공격", color: "#BA7517", test: (x: number, y: number) => x >= 0.3 && x <= 0.7 && y > 0.2 && y <= 0.45 },
  { id: "leftMid", label: "좌 미드", color: "#378ADD", test: (x: number, y: number) => x < 0.4 && y > 0.35 && y <= 0.65 },
  { id: "rightMid", label: "우 미드", color: "#378ADD", test: (x: number, y: number) => x > 0.6 && y > 0.35 && y <= 0.65 },
  { id: "centerMid", label: "중앙 미드", color: "#85B7EB", test: (x: number, y: number) => x >= 0.4 && x <= 0.6 && y > 0.45 && y <= 0.65 },
  { id: "ownLeft", label: "자진영 좌", color: "#1D9E75", test: (x: number, y: number) => x < 0.4 && y > 0.65 },
  { id: "ownRight", label: "자진영 우", color: "#1D9E75", test: (x: number, y: number) => x >= 0.4 && x <= 0.6 && y > 0.65 },
  { id: "ownCenter", label: "자진영 중", color: "#5DCAA5", test: () => true },
];

function getZone(nx: number, ny: number) {
  for (const z of ZONES) if (z.test(nx, ny)) return z.id;
  return "ownCenter";
}
function getGkZone(nx: number, ny: number) {
  for (const z of GK_ZONES) {
    if (nx >= z.gx && nx < z.gx + z.gw && ny >= z.gy && ny < z.gy + z.gh)
      return z.id;
  }
  return "bc";
}

function pct(n: number, t: number) {
  if (!t) return "—";
  return Math.round((n / t) * 100) + "%";
}
function pctN(n: number, t: number) {
  if (!t) return 0;
  return Math.round((n / t) * 100);
}

export type AnalysisHalf = "first" | "second";

type AtkEv = { cx: number; cy: number; nx: number; ny: number; zone: string; type: string; half: AnalysisHalf };
type DefEv = AtkEv;
type PassEv = {
  sx: number; sy: number; snx: number; sny: number; szone: string;
  ex: number; ey: number; enx: number; eny: number; ezone: string;
  success: boolean;
  half: AnalysisHalf;
};
type GkEv = { cx: number; cy: number; nx: number; ny: number; zone: string; type: string; half: AnalysisHalf };
type PassState = { sx: number; sy: number; snx: number; sny: number; zone: string } | null;

export interface AnalysisEventsData {
  atk: AtkEv[];
  def: DefEv[];
  pass: PassEv[];
  gk: GkEv[];
}

function ensureHalf<T extends { half?: AnalysisHalf }>(ev: T): T & { half: AnalysisHalf } {
  return { ...ev, half: ev.half === "second" ? "second" : "first" };
}

const TABS = [
  { id: "attack", label: "공격" },
  { id: "defense", label: "수비" },
  { id: "pass", label: "패스" },
  { id: "goalkeeper", label: "골키퍼" },
];

type ViewFilter = "first" | "second" | "all";

export type OverlayLayer = { id: string; name: string; data: AnalysisEventsData };

interface FootballTacticsAnalyzerProps {
  initialData?: AnalysisEventsData | null;
  onChange?: (data: AnalysisEventsData) => void;
  defaultHalf?: AnalysisHalf;
  showHalfToggle?: boolean;
  readOnly?: boolean;
  /** 기록관: 코치 위에 겹쳐 그릴 선수/합산 레이어 (선택된 것만 그림) */
  overlayLayers?: OverlayLayer[];
  visibleOverlayIds?: string[];
}

export default function FootballTacticsAnalyzer({
  initialData,
  onChange,
  defaultHalf = "first",
  showHalfToggle = true,
  readOnly = false,
  overlayLayers = [],
  visibleOverlayIds = [],
}: FootballTacticsAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"attack" | "defense" | "pass_start" | "pass_end" | "goalkeeper">("attack");
  const [selectedAtkType, setSelectedAtkType] = useState("shot_on");
  const [selectedDefType, setSelectedDefType] = useState("tackle");
  const [selectedGkType, setSelectedGkType] = useState("save");
  const [half, setHalf] = useState<AnalysisHalf>(defaultHalf);
  const [viewFilter, setViewFilter] = useState<ViewFilter>(defaultHalf);
  const [atkEvents, setAtkEvents] = useState<AtkEv[]>([]);
  const [defEvents, setDefEvents] = useState<DefEv[]>([]);
  const [passEvents, setPassEvents] = useState<PassEv[]>([]);
  const [gkEvents, setGkEvents] = useState<GkEv[]>([]);
  const [passState, setPassState] = useState<PassState>(null);
  const [currentTab, setCurrentTab] = useState("attack");

  const byView = useCallback(
    <T extends { half: AnalysisHalf }>(list: T[]): T[] => {
      if (viewFilter === "all") return list;
      return list.filter((e) => e.half === viewFilter);
    },
    [viewFilter],
  );
  const atkView = byView(atkEvents);
  const defView = byView(defEvents);
  const passView = byView(passEvents);
  const gkView = byView(gkEvents);

  const fieldCoords = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { cx: 0, cy: 0, nx: 0, ny: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = FIELD_W / rect.width;
    const sy = FIELD_H / rect.height;
    const cx = (e.clientX - rect.left) * sx;
    const cy = (e.clientY - rect.top) * sy;
    const nx = Math.max(0, Math.min(1, (cx - PAD.l) / FW));
    const ny = Math.max(0, Math.min(1, (cy - PAD.t) / FH));
    return { cx, cy, nx, ny };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const l = PAD.l;
    const t = PAD.t;
    const w = FW;
    const h = FH;

    // 골키퍼 모드: 롱킥/숏 배급은 경기장에 표시
    const isGkDist = mode === "goalkeeper" && (selectedGkType === "dist_long" || selectedGkType === "dist_short");
    if (mode === "goalkeeper" && !isGkDist) {
      ctx.clearRect(0, 0, FIELD_W, FIELD_H);
      const th = t + 60;
      const gh = FH - 120;
      ctx.fillStyle = "#1a3a5c";
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect?.(PAD.l - 10, PAD.t, FW + 20, FH, 8);
      ctx.fill();
      ctx.fillStyle = "#2d5a27";
      ctx.fillRect(PAD.l - 10, th + gh, FW + 20, FH - (th - PAD.t) - gh);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(l, th + gh);
      ctx.lineTo(l, th);
      ctx.lineTo(l + w, th);
      ctx.lineTo(l + w, th + gh);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 0.6;
      for (let xi = 1; xi < 9; xi++) {
        ctx.beginPath();
        ctx.moveTo(l + (xi * w) / 9, th);
        ctx.lineTo(l + (xi * w) / 9, th + gh);
        ctx.stroke();
      }
      for (let yi = 1; yi < 5; yi++) {
        ctx.beginPath();
        ctx.moveTo(l, th + (yi * gh) / 5);
        ctx.lineTo(l + w, th + (yi * gh) / 5);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      GK_ZONES.forEach((z) => {
        const zx = l + z.gx * w;
        const zy = th + z.gy * gh;
        const zw = z.gw * w;
        const zh = z.gh * gh;
        ctx.strokeRect(zx, zy, zw, zh);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(zx + 1, zy + 1, zw - 2, zh - 2);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(z.label, zx + zw / 2, zy + zh / 2 + 4);
      });
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PAD.l - 10, th + gh);
      ctx.lineTo(PAD.l + FW + 10, th + gh);
      ctx.stroke();
      gkView.filter((ev) => ev.type !== "dist_long" && ev.type !== "dist_short").forEach((ev) => {
        const tp = GK_TYPES.find((t) => t.id === ev.type);
        const color = tp ? tp.color : "#fff";
        const ex = l + ev.nx * w;
        const ey = th + ev.ny * gh;
        if (ev.type === "goal_in") {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(ex - 6, ey - 6);
          ctx.lineTo(ex + 6, ey + 6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ex + 6, ey - 6);
          ctx.lineTo(ex - 6, ey + 6);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(ex, ey, 7, 0, Math.PI * 2);
          ctx.fillStyle = color + "bb";
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
          if (ev.type === "save") {
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(ex - 3, ey);
            ctx.lineTo(ex, ey + 3);
            ctx.lineTo(ex + 5, ey - 4);
            ctx.stroke();
          }
        }
      });
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("골문 구역을 클릭하여 기록하세요", FIELD_W / 2, PAD.t + 30);
      ctx.fillText("골키퍼 시점 (정면)", FIELD_W / 2, FIELD_H - 10);
      return;
    }

    ctx.clearRect(0, 0, FIELD_W, FIELD_H);
    ctx.fillStyle = "#2d5a27";
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect?.(l, t, w, h, 8);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.03)";
      ctx.fillRect(l, t + (i * h) / 8, w, h / 8);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(l, t, w, h);
    const midY = t + h / 2;
    ctx.beginPath();
    ctx.moveTo(l, midY);
    ctx.lineTo(l + w, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(l + w / 2, midY, w * 0.13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(l + w / 2, midY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fill();
    const pbW = w * 0.4;
    const pbH = h * 0.2;
    const pbX = l + (w - pbW) / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.strokeRect(pbX, t, pbW, pbH);
    ctx.strokeRect(l + (w - w * 0.22) / 2, t, w * 0.22, h * 0.09);
    ctx.strokeRect(pbX, t + h - pbH, pbW, pbH);
    ctx.strokeRect(l + (w - w * 0.22) / 2, t + h - h * 0.09, w * 0.22, h * 0.09);
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 0.8;
    [0.35, 0.65].forEach((ry) => {
      ctx.beginPath();
      ctx.moveTo(l, t + h * ry);
      ctx.lineTo(l + w, t + h * ry);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    const gW = w * 0.18;
    const gH = 8;
    const gX = l + (w - gW) / 2;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(gX, t - gH, gW, gH);
    ctx.fillRect(gX, t + h, gW, gH);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("공격 방향 ↑", l + w / 2, t + h * 0.475);

    if (!isGkDist) {
      atkView.forEach((ev) => {
        const tp = ATK_TYPES.find((t) => t.id === ev.type);
        const color = tp ? tp.color : "#fff";
        ctx.beginPath();
        ctx.arc(ev.cx, ev.cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = color + "bb";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      });
      defView.forEach((ev) => {
        const tp = DEF_TYPES.find((t) => t.id === ev.type);
        const color = tp ? tp.color : "#fff";
        ctx.save();
        ctx.translate(ev.cx, ev.cy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = color + "99";
        ctx.fillRect(-5, -5, 10, 10);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.strokeRect(-5, -5, 10, 10);
        ctx.restore();
      });
      passView.forEach((ev) => {
        const c = ev.success ? "#047857" : "#B91C1C";
        ctx.beginPath();
        ctx.moveTo(ev.sx, ev.sy);
        ctx.lineTo(ev.ex, ev.ey);
        ctx.strokeStyle = c + "cc";
        ctx.lineWidth = 2;
        if (!ev.success) ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        const angle = Math.atan2(ev.ey - ev.sy, ev.ex - ev.sx);
        ctx.save();
        ctx.translate(ev.ex, ev.ey);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-8, -4);
        ctx.lineTo(0, 0);
        ctx.lineTo(-8, 4);
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(ev.sx, ev.sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
      });
      if (passState) {
        ctx.beginPath();
        ctx.arc(passState.sx, passState.sy, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#EA580Ccc";
        ctx.fill();
        ctx.strokeStyle = "#EA580C";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // 롱킥/숏 배급: 경기장 위에 표시
    if (isGkDist) {
      gkView.filter((ev) => ev.type === "dist_long" || ev.type === "dist_short").forEach((ev) => {
        const tp = GK_TYPES.find((t) => t.id === ev.type);
        const color = tp ? tp.color : "#fff";
        ctx.fillStyle = color + "cc";
        ctx.beginPath();
        ctx.arc(ev.cx, ev.cy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ev.cx, ev.cy);
        ctx.lineTo(ev.cx, ev.cy + 20);
        ctx.stroke();
      });
    }

    // 오버레이: 선수/합산 레이어 (반투명, 작은 마커)
    const visibleSet = new Set(visibleOverlayIds);
    overlayLayers.forEach((layer) => {
      if (!visibleSet.has(layer.id)) return;
      const atkO = viewFilter === "all" ? (layer.data.atk ?? []) : (layer.data.atk ?? []).filter((e) => e.half === viewFilter);
      const defO = viewFilter === "all" ? (layer.data.def ?? []) : (layer.data.def ?? []).filter((e) => e.half === viewFilter);
      const passO = viewFilter === "all" ? (layer.data.pass ?? []) : (layer.data.pass ?? []).filter((e) => e.half === viewFilter);
      const gkO = viewFilter === "all" ? (layer.data.gk ?? []) : (layer.data.gk ?? []).filter((e) => e.half === viewFilter);
      ctx.save();
      ctx.globalAlpha = 0.55;
      if (!isGkDist) {
        atkO.forEach((ev) => {
          const tp = ATK_TYPES.find((t) => t.id === ev.type);
          ctx.fillStyle = (tp ? tp.color : "#fff") + "cc";
          ctx.beginPath();
          ctx.arc(ev.cx, ev.cy, 4, 0, Math.PI * 2);
          ctx.fill();
        });
        defO.forEach((ev) => {
          const tp = DEF_TYPES.find((t) => t.id === ev.type);
          ctx.fillStyle = (tp ? tp.color : "#fff") + "99";
          ctx.save();
          ctx.translate(ev.cx, ev.cy);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-3, -3, 6, 6);
          ctx.restore();
        });
        passO.forEach((ev) => {
          ctx.strokeStyle = (ev.success ? "#047857" : "#B91C1C") + "99";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(ev.sx, ev.sy);
          ctx.lineTo(ev.ex, ev.ey);
          ctx.stroke();
        });
      }
      ctx.restore();
    });
  }, [mode, selectedGkType, atkView, defView, passView, gkView, passState, overlayLayers, visibleOverlayIds, viewFilter]);

  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (!initialData || hasInitializedRef.current) return;
    setAtkEvents((initialData.atk ?? []).map(ensureHalf));
    setDefEvents((initialData.def ?? []).map(ensureHalf));
    setPassEvents((initialData.pass ?? []).map(ensureHalf));
    setGkEvents((initialData.gk ?? []).map(ensureHalf));
    hasInitializedRef.current = true;
  }, [initialData]);

  useEffect(() => {
    if (!readOnly) {
      onChange?.({
        atk: atkEvents,
        def: defEvents,
        pass: passEvents,
        gk: gkEvents,
      });
    }
  }, [atkEvents, defEvents, passEvents, gkEvents, onChange, readOnly]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLCanvasElement>) => {
      const { cx, cy, nx, ny } = fieldCoords(e);
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;

      if (mode === "goalkeeper") {
        const zone = selectedGkType === "dist_long" || selectedGkType === "dist_short" ? getZone(nx, ny) : getGkZone(nx, ny);
        setGkEvents((prev) => [...prev, { cx, cy, nx, ny, zone, type: selectedGkType, half }]);
      } else if (mode === "attack") {
        const zone = getZone(nx, ny);
        setAtkEvents((prev) => [...prev, { cx, cy, nx, ny, zone, type: selectedAtkType, half }]);
      } else if (mode === "defense") {
        const zone = getZone(nx, ny);
        setDefEvents((prev) => [...prev, { cx, cy, nx, ny, zone, type: selectedDefType, half }]);
      } else if (mode === "pass_start") {
        const zone = getZone(nx, ny);
        setPassState({ sx: cx, sy: cy, snx: nx, sny: ny, zone });
        setMode("pass_end");
      } else if (mode === "pass_end" && passState) {
        const zone = getZone(nx, ny);
        setPassEvents((prev) => [
          ...prev,
          {
            sx: passState.sx,
            sy: passState.sy,
            snx: passState.snx,
            sny: passState.sny,
            szone: passState.zone,
            ex: cx,
            ey: cy,
            enx: nx,
            eny: ny,
            ezone: zone,
            success: !e.shiftKey,
            half,
          },
        ]);
        setPassState(null);
        setMode("pass_start");
      }
    },
    [mode, passState, selectedAtkType, selectedDefType, selectedGkType, half, fieldCoords]
  );

  const handleContextMenu = useCallback(
    (e: MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (mode === "pass_end") {
        setPassState(null);
        setMode("pass_start");
        return;
      }
      if (mode === "attack" && atkEvents.length)
        setAtkEvents((prev) => prev.slice(0, -1));
      else if (mode === "defense" && defEvents.length)
        setDefEvents((prev) => prev.slice(0, -1));
      else if (mode === "pass_start" && passEvents.length)
        setPassEvents((prev) => prev.slice(0, -1));
      else if (mode === "goalkeeper" && gkEvents.length)
        setGkEvents((prev) => prev.slice(0, -1));
    },
    [mode, atkEvents.length, defEvents.length, passEvents.length, gkEvents.length]
  );

  const undo = useCallback(() => {
    if (mode === "pass_end") {
      setPassState(null);
      setMode("pass_start");
    } else if (mode === "attack" && atkEvents.length)
      setAtkEvents((prev) => prev.slice(0, -1));
    else if (mode === "defense" && defEvents.length)
      setDefEvents((prev) => prev.slice(0, -1));
    else if (mode === "pass_start" && passEvents.length)
      setPassEvents((prev) => prev.slice(0, -1));
    else if (mode === "goalkeeper" && gkEvents.length)
      setGkEvents((prev) => prev.slice(0, -1));
  }, [mode, atkEvents.length, defEvents.length, passEvents.length, gkEvents.length]);

  const clearAll = useCallback(() => {
    setAtkEvents([]);
    setDefEvents([]);
    setPassEvents([]);
    setGkEvents([]);
    setPassState(null);
    if (mode === "pass_end") setMode("pass_start");
  }, [mode]);

  const atkZIds = ["box", "leftWing", "rightWing", "centerAtk"];
  const midZIds = ["leftMid", "rightMid", "centerMid"];
  const ownZIds = ["ownLeft", "ownRight", "ownCenter"];
  const atkTotal = atkView.length;
  const shots = atkView.filter((e) => e.type === "shot_on" || e.type === "shot_off").length;
  const shotOn = atkView.filter((e) => e.type === "shot_on").length;
  const atkThirdCount = atkZIds.reduce((s, z) => s + atkView.filter((e) => e.zone === z).length, 0);
  const midThirdCount = midZIds.reduce((s, z) => s + atkView.filter((e) => e.zone === z).length, 0);
  const defTotal = defView.length;
  const interceptCount = defView.filter((e) => e.type === "intercept").length;
  const clearCount = defView.filter((e) => e.type === "clearance").length;
  const defOwnCount = ownZIds.reduce((s, z) => s + defView.filter((e) => e.zone === z).length, 0);
  const defMidCount = midZIds.reduce((s, z) => s + defView.filter((e) => e.zone === z).length, 0);
  const passTotal = passView.length;
  const passSuccess = passView.filter((e) => e.success).length;
  const gkSaves = gkView.filter((e) => e.type === "save" || e.type === "punch" || e.type === "catch").length;
  const gkGoals = gkView.filter((e) => e.type === "goal_in").length;
  const shotsFaced = gkSaves + gkGoals;

  const atkZoneCounts: Record<string, number> = {};
  ZONES.forEach((z) => (atkZoneCounts[z.id] = atkView.filter((e) => e.zone === z.id).length));
  const maxAtkZ = Math.max(1, ...Object.values(atkZoneCounts));
  const defZoneCounts: Record<string, number> = {};
  ZONES.forEach((z) => (defZoneCounts[z.id] = defView.filter((e) => e.zone === z.id).length));
  const maxDefZ = Math.max(1, ...Object.values(defZoneCounts));
  const passZoneData: Record<string, { total: number; success: number }> = {};
  ZONES.forEach((z) => {
    const zp = passView.filter((e) => e.szone === z.id);
    passZoneData[z.id] = { total: zp.length, success: zp.filter((e) => e.success).length };
  });
  const gkZoneData: Record<string, { total: number; saves: number; goals: number; shots: number }> = {};
  GK_ZONES.forEach((z) => {
    const zEvts = gkView.filter((e) => e.zone === z.id);
    const zSaves = zEvts.filter((e) => e.type === "save" || e.type === "punch" || e.type === "catch").length;
    const zGoals = zEvts.filter((e) => e.type === "goal_in").length;
    gkZoneData[z.id] = { total: zEvts.length, saves: zSaves, goals: zGoals, shots: zSaves + zGoals };
  });
  const distEvts = gkView.filter((e) => e.type === "dist_long" || e.type === "dist_short");
  const distDirs = [
    { label: "좌측 배급", test: (e: GkEv) => e.nx < 0.33, color: "#7F77DD" },
    { label: "중앙 배급", test: (e: GkEv) => e.nx >= 0.33 && e.nx <= 0.67, color: "#85B7EB" },
    { label: "우측 배급", test: (e: GkEv) => e.nx > 0.67, color: "#5DCAA5" },
  ];

  const isGkDistHint = mode === "goalkeeper" && (selectedGkType === "dist_long" || selectedGkType === "dist_short");
  const hints: Record<string, string> = {
    attack: "경기장 클릭 → 공격 기록  |  우클릭 → 마지막 삭제",
    defense: "경기장 클릭 → 수비 기록  |  우클릭 → 마지막 삭제",
    pass_start: "① 출발 위치 클릭  |  도착 클릭 후 자동 기록",
    pass_end: "② 도착 위치 클릭 (성공) / Shift+클릭 (실패)  |  우클릭 = 취소",
    goalkeeper: isGkDistHint ? "경기장에서 배급 방향을 클릭하세요  |  우클릭 → 마지막 삭제" : "골문 구역 클릭 → 기록  |  우클릭 → 마지막 삭제",
  };

  const btnBase = "rounded-lg px-2.5 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-900";
  const btnInactive = "border border-slate-600 bg-slate-800/50 text-slate-300 hover:bg-slate-700 hover:border-slate-500";

  const modeActiveClasses: Record<string, string> = {
    attack: "bg-amber-500/20 text-amber-300 border-amber-500/50 focus:ring-amber-500/40",
    defense: "bg-violet-500/20 text-violet-300 border-violet-500/50 focus:ring-violet-500/40",
    pass_start: "bg-sky-500/20 text-sky-300 border-sky-500/50 focus:ring-sky-500/40",
    goalkeeper: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 focus:ring-emerald-500/40",
  };
  const viewFilterActiveClasses: Record<string, string> = {
    first: "bg-amber-500/20 text-amber-300 border-amber-500/50 focus:ring-amber-500/40",
    second: "bg-sky-500/20 text-sky-300 border-sky-500/50 focus:ring-sky-500/40",
    all: "bg-slate-500/20 text-slate-200 border-slate-500/50 focus:ring-slate-500/40",
  };

  return (
    <div className="flex flex-nowrap gap-0 overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
      <div className="shrink-0 space-y-3 border-r border-slate-700/80 p-4">
        <div className="flex flex-wrap gap-1.5">
          {[
            ["attack", "공격"],
            ["defense", "수비"],
            ["pass_start", "패스"],
            ["goalkeeper", "골키퍼"],
          ].map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                if (m !== "pass_end") setPassState(null);
                setMode(m as typeof mode);
                if (m === "attack") setCurrentTab("attack");
                else if (m === "defense") setCurrentTab("defense");
                else if (m === "pass_start" || m === "pass_end") setCurrentTab("pass");
                else setCurrentTab("goalkeeper");
              }}
              className={`border ${btnBase} ${mode === m ? modeActiveClasses[m] ?? modeActiveClasses.attack : btnInactive}`}
            >
              {label}
            </button>
          ))}
        </div>
        {showHalfToggle && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500">기록·보기</span>
            {[
              ["first", "전반"],
              ["second", "후반"],
              ["all", "전체"],
            ].map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  if (v === "all") {
                    setViewFilter("all");
                  } else {
                    setHalf(v as AnalysisHalf);
                    setViewFilter(v as ViewFilter);
                  }
                }}
                className={`border ${btnBase} ${viewFilter === v ? viewFilterActiveClasses[v] : btnInactive}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {mode === "attack" && (
          <div className="flex flex-wrap gap-1.5">
            {ATK_TYPES.map((t) => {
              const isActive = selectedAtkType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedAtkType(t.id)}
                  className={`border ${btnBase} ${isActive ? "" : btnInactive}`}
                  style={
                    isActive
                      ? {
                          borderLeftWidth: 3,
                          borderTopColor: t.color,
                          borderRightColor: t.color,
                          borderBottomColor: t.color,
                          borderLeftColor: t.color,
                          backgroundColor: `${t.color}20`,
                          color: t.color,
                        }
                      : { borderLeftWidth: 3, borderLeftColor: t.color }
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
        {mode === "defense" && (
          <div className="flex flex-wrap gap-1.5">
            {DEF_TYPES.map((t) => {
              const isActive = selectedDefType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedDefType(t.id)}
                  className={`border ${btnBase} ${isActive ? "" : btnInactive}`}
                  style={
                    isActive
                      ? {
                          borderLeftWidth: 3,
                          borderTopColor: t.color,
                          borderRightColor: t.color,
                          borderBottomColor: t.color,
                          borderLeftColor: t.color,
                          backgroundColor: `${t.color}20`,
                          color: t.color,
                        }
                      : { borderLeftWidth: 3, borderLeftColor: t.color }
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
        {mode === "goalkeeper" && (
          <div className="flex flex-wrap gap-1.5">
            {GK_TYPES.map((t) => {
              const isActive = selectedGkType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedGkType(t.id)}
                  className={`border ${btnBase} ${isActive ? "" : btnInactive}`}
                  style={
                    isActive
                      ? {
                          borderLeftWidth: 3,
                          borderTopColor: t.color,
                          borderRightColor: t.color,
                          borderBottomColor: t.color,
                          borderLeftColor: t.color,
                          backgroundColor: `${t.color}20`,
                          color: t.color,
                        }
                      : { borderLeftWidth: 3, borderLeftColor: t.color }
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
        {(mode === "pass_start" || mode === "pass_end") && (
          <p className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            {mode === "pass_start"
              ? "패스 출발 위치를 클릭하세요"
              : "도착 위치 클릭 (Shift = 실패 패스)"}
          </p>
        )}
        <canvas
          ref={canvasRef}
          width={FIELD_W}
          height={FIELD_H}
          className={`w-full rounded-xl border border-slate-700 shadow-inner ${readOnly ? "cursor-default pointer-events-none" : "cursor-crosshair"}`}
          onClick={readOnly ? undefined : handleClick}
          onContextMenu={readOnly ? undefined : handleContextMenu}
        />
        {!readOnly && (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={undo}
                className="rounded-lg border border-slate-600 bg-slate-800/50 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1 focus:ring-offset-slate-900"
              >
                실행취소
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="rounded-lg border border-rose-700/60 bg-rose-950/30 px-2.5 py-1.5 text-xs text-rose-200 transition hover:bg-rose-950/50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1 focus:ring-offset-slate-900"
              >
                전체 초기화
              </button>
            </div>
            <p className="text-xs text-slate-500">{hints[mode] ?? ""}</p>
          </>
        )}
      </div>

      <div className="flex min-h-0 min-w-[280px] flex-1 flex-col overflow-y-auto p-4">
        <div className="flex gap-0.5 rounded-xl border border-slate-700 bg-slate-800/30 p-1 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setCurrentTab(t.id)}
              className={`flex-1 rounded-lg py-2 text-center text-xs font-medium transition ${
                currentTab === t.id
                  ? "bg-slate-700 text-emerald-300 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-3 pt-3">
        {currentTab === "attack" && (
          <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-800/30 p-3">
            <h3 className="text-sm font-semibold text-slate-200">공격</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">총 공격 행위</p>
                <p className="text-lg font-semibold">{atkTotal}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">슈팅 / 유효슈팅</p>
                <p className="text-sm font-semibold">{shots} / {shotOn}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">공격 1/3 비율</p>
                <p className="text-lg font-semibold text-rose-400">{pct(atkThirdCount, atkTotal)}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">중간 1/3 비율</p>
                <p className="text-lg font-semibold text-blue-400">{pct(midThirdCount, atkTotal)}</p>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-400">구역별 공격 분포</p>
            <ul className="space-y-1">
              {ZONES.map((z) => {
                const c = atkZoneCounts[z.id] ?? 0;
                const bw = Math.round((c / maxAtkZ) * 100);
                return (
                  <li key={z.id} className="flex items-center gap-2 rounded-lg bg-slate-950/50 px-2 py-1.5 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: z.color }} />
                    <span className="min-w-[76px] truncate text-slate-200">{z.label}</span>
                    <div className="h-1 flex-1 max-w-[60px] overflow-hidden rounded bg-slate-800">
                      <div className="h-full rounded transition-all" style={{ width: `${bw}%`, background: z.color }} />
                    </div>
                    <span className="w-8 text-right font-semibold text-slate-200">{pct(c, atkTotal)}</span>
                    <span className="w-5 text-right text-slate-500">{c}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs font-semibold text-slate-400">행위 유형별</p>
            <ul className="space-y-1">
              {ATK_TYPES.map((t) => {
                const c = atkView.filter((e) => e.type === t.id).length;
                const maxAT = Math.max(1, ...ATK_TYPES.map((x) => atkView.filter((e) => e.type === x.id).length));
                const bw = Math.round((c / maxAT) * 100);
                return (
                  <li key={t.id} className="flex items-center gap-2 rounded-lg bg-slate-950/50 px-2 py-1.5 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />
                    <span className="min-w-[76px] truncate text-slate-200">{t.label}</span>
                    <div className="h-1 flex-1 max-w-[60px] overflow-hidden rounded bg-slate-800">
                      <div className="h-full rounded transition-all" style={{ width: `${bw}%`, background: t.color }} />
                    </div>
                    <span className="w-8 text-right font-semibold text-slate-200">{pct(c, atkTotal)}</span>
                    <span className="w-5 text-right text-slate-500">{c}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {currentTab === "defense" && (
          <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-800/30 p-3">
            <h3 className="text-sm font-semibold text-slate-200">수비</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">총 수비 행위</p>
                <p className="text-lg font-semibold">{defTotal}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">인터셉트 / 클리어</p>
                <p className="text-sm font-semibold">{interceptCount} / {clearCount}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">자기 진영 수비율</p>
                <p className="text-lg font-semibold text-emerald-400">{pct(defOwnCount, defTotal)}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">중간 압박율</p>
                <p className="text-lg font-semibold text-amber-400">{pct(defMidCount, defTotal)}</p>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-400">구역별 수비 분포</p>
            <ul className="space-y-1">
              {ZONES.map((z) => {
                const c = defZoneCounts[z.id] ?? 0;
                const bw = Math.round((c / maxDefZ) * 100);
                return (
                  <li key={z.id} className="flex items-center gap-2 rounded-lg bg-slate-950/50 px-2 py-1.5 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: z.color }} />
                    <span className="min-w-[76px] truncate text-slate-200">{z.label}</span>
                    <div className="h-1 flex-1 max-w-[60px] overflow-hidden rounded bg-slate-800">
                      <div className="h-full rounded transition-all" style={{ width: `${bw}%`, background: z.color }} />
                    </div>
                    <span className="w-8 text-right font-semibold text-slate-200">{pct(c, defTotal)}</span>
                    <span className="w-5 text-right text-slate-500">{c}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs font-semibold text-slate-400">수비 유형별</p>
            <ul className="space-y-1">
              {DEF_TYPES.map((t) => {
                const c = defView.filter((e) => e.type === t.id).length;
                const maxDT = Math.max(1, ...DEF_TYPES.map((x) => defView.filter((e) => e.type === x.id).length));
                const bw = Math.round((c / maxDT) * 100);
                return (
                  <li key={t.id} className="flex items-center gap-2 rounded-lg bg-slate-950/50 px-2 py-1.5 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />
                    <span className="min-w-[76px] truncate text-slate-200">{t.label}</span>
                    <div className="h-1 flex-1 max-w-[60px] overflow-hidden rounded bg-slate-800">
                      <div className="h-full rounded transition-all" style={{ width: `${bw}%`, background: t.color }} />
                    </div>
                    <span className="w-8 text-right font-semibold text-slate-200">{pct(c, defTotal)}</span>
                    <span className="w-5 text-right text-slate-500">{c}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {currentTab === "pass" && (
          <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-800/30 p-3">
            <h3 className="text-sm font-semibold text-slate-200">패스</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">총 패스</p>
                <p className="text-lg font-semibold">{passTotal}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">전체 성공률</p>
                <p className="text-lg font-semibold text-emerald-400">{pct(passSuccess, passTotal)}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">성공</p>
                <p className="text-lg font-semibold text-emerald-400">{passSuccess}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">실패</p>
                <p className="text-lg font-semibold text-rose-400">{passTotal - passSuccess}</p>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-400">구역별 패스 성공률</p>
            <ul className="space-y-1">
              {ZONES.map((z) => {
                const d = passZoneData[z.id];
                if (!d?.total) return null;
                const sp = pctN(d.success, d.total);
                return (
                  <li key={z.id} className="flex items-center gap-2 rounded-lg bg-slate-950/50 px-2 py-1.5 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: z.color }} />
                    <span className="min-w-[76px] text-slate-200">{z.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
                      <div className="h-full rounded bg-emerald-500 transition-all" style={{ width: `${sp}%` }} />
                    </div>
                    <span className="w-8 text-right font-semibold text-emerald-400">{sp}%</span>
                    <span className="w-10 text-right text-slate-500">{d.success}/{d.total}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs font-semibold text-slate-400">방향별 패스 성공률</p>
            <ul className="space-y-1">
              {[
                { label: "전진 패스", test: (e: PassEv) => e.sny - e.eny > 0.1 },
                { label: "횡패스", test: (e: PassEv) => Math.abs(e.sny - e.eny) <= 0.1 },
                { label: "후방 패스", test: (e: PassEv) => e.eny - e.sny > 0.1 },
              ].map((d) => {
                const dp = passView.filter(d.test);
                const ds = dp.filter((e) => e.success).length;
                const sp = pctN(ds, dp.length);
                return (
                  <li key={d.label} className="flex items-center gap-2 rounded-lg bg-slate-950/50 px-2 py-1.5 text-xs">
                    <span className="min-w-[76px] text-slate-200">{d.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
                      <div className="h-full rounded bg-emerald-500 transition-all" style={{ width: `${sp}%` }} />
                    </div>
                    <span className="w-8 text-right font-semibold text-emerald-400">{sp}%</span>
                    <span className="w-10 text-right text-slate-500">{ds}/{dp.length}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {currentTab === "goalkeeper" && (
          <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-800/30 p-3">
            <h3 className="text-sm font-semibold text-slate-200">골키퍼</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">총 슈팅 대응</p>
                <p className="text-lg font-semibold">{gkView.length}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">세이브율</p>
                <p className="text-lg font-semibold text-emerald-400">{pct(gkSaves, shotsFaced)}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">세이브</p>
                <p className="text-lg font-semibold text-emerald-400">{gkSaves}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">실점</p>
                <p className="text-lg font-semibold text-rose-400">{gkGoals}</p>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-400">세이브 분포</p>
            <div className="flex h-6 overflow-hidden rounded-lg">
              {GK_TYPES.map((t) => {
                const c = gkView.filter((e) => e.type === t.id).length;
                if (!c) return null;
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-center text-[10px] font-semibold text-white transition-[flex]"
                    style={{ flex: c, background: t.color }}
                  >
                    {c}
                  </div>
                );
              })}
              {gkView.length === 0 && (
                <div className="flex flex-1 items-center justify-center bg-slate-800 text-slate-500 text-[10px]">
                  기록 없음
                </div>
              )}
            </div>
            <p className="text-xs font-semibold text-slate-400">골문 구역별 세이브율</p>
            <ul className="space-y-1">
              {GK_ZONES.map((z) => {
                const d = gkZoneData[z.id];
                if (!d?.total) return null;
                const sp = pctN(d.saves, d.shots);
                return (
                  <li key={z.id} className="flex items-center gap-2 rounded-lg bg-slate-950/50 px-2 py-1.5 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: z.color }} />
                    <span className="min-w-[76px] text-slate-200">{z.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
                      <div className="h-full rounded bg-emerald-500 transition-all" style={{ width: `${sp}%` }} />
                    </div>
                    <span className="w-8 text-right font-semibold text-emerald-400">{sp}%</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs font-semibold text-slate-400">행위 유형별</p>
            <ul className="space-y-1">
              {GK_TYPES.map((t) => {
                const c = gkView.filter((e) => e.type === t.id).length;
                const maxGkT = Math.max(1, ...GK_TYPES.map((x) => gkView.filter((e) => e.type === x.id).length));
                const bw = Math.round((c / maxGkT) * 100);
                return (
                  <li key={t.id} className="flex items-center gap-2 rounded-lg bg-slate-950/50 px-2 py-1.5 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />
                    <span className="min-w-[76px] truncate text-slate-200">{t.label}</span>
                    <div className="h-1 flex-1 max-w-[60px] overflow-hidden rounded bg-slate-800">
                      <div className="h-full rounded transition-all" style={{ width: `${bw}%`, background: t.color }} />
                    </div>
                    <span className="w-8 text-right font-semibold text-slate-200">{pct(c, gkView.length)}</span>
                    <span className="w-5 text-right text-slate-500">{c}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs font-semibold text-slate-400">배급 방향별</p>
            <ul className="space-y-1">
              {distDirs.map((d) => {
                const count = distEvts.filter(d.test).length;
                const maxD = Math.max(1, ...distDirs.map((dd) => distEvts.filter(dd.test).length));
                const bw = Math.round((count / maxD) * 100);
                return (
                  <li key={d.label} className="flex items-center gap-2 rounded-lg bg-slate-950/50 px-2 py-1.5 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
                    <span className="min-w-[76px] text-slate-200">{d.label}</span>
                    <div className="h-1 flex-1 max-w-[60px] overflow-hidden rounded bg-slate-800">
                      <div className="h-full rounded transition-all" style={{ width: `${bw}%`, background: d.color }} />
                    </div>
                    <span className="w-8 text-right font-semibold text-slate-200">{pct(count, distEvts.length)}</span>
                    <span className="w-5 text-right text-slate-500">{count}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

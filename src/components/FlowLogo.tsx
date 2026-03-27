/**
 * FLOW 워드마크 — 색은 부모에서 `text-sky-500` 등으로 지정 (currentColor)
 */
export function FlowLogo({
  className = "",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 208 52"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="FLOW"
    >
      <text
        x="4"
        y="40"
        className="fill-current"
        style={{
          fontSize: 42,
          fontWeight: 800,
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: "0.08em",
        }}
      >
        FLOW
      </text>
    </svg>
  );
}

/** 미니 필드(105×68) 중앙 연한 워터마크 — 포메이션 SVG 안에서만 사용 */
export function FlowPitchWatermark() {
  return (
    <g pointerEvents="none" aria-hidden>
      <text
        x={52.5}
        y={37}
        textAnchor="middle"
        transform="rotate(-9 52.5 34)"
        fill="rgba(255,255,255,0.12)"
        fontSize={7.2}
        fontWeight={800}
        fontFamily="system-ui, sans-serif"
        letterSpacing="0.22em"
      >
        FLOW
      </text>
    </g>
  );
}

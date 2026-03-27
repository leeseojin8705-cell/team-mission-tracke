/**
 * FLOW 팀 워드마크 — 색은 부모에서 `text-sky-500` 등으로 지정 (currentColor)
 */
export function FlowLogo({
  className = "",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 220 56"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="FLOW"
    >
      <text
        x="0"
        y="44"
        className="fill-current"
        style={{
          fontSize: 48,
          fontWeight: 800,
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: "0.06em",
        }}
      >
        FLOW
      </text>
    </svg>
  );
}

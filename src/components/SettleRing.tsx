export function SettleRing({
  value,
  size = 64,
  stroke = 7,
  color = "#0FA3A3",
  track = "rgba(0,0,0,0.1)",
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
}) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * C;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
        <circle r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.2,0.7,0.2,1)" }}
        />
      </g>
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.3}
        fontWeight="800"
        fill="currentColor"
        className="font-mono"
      >
        {Math.round(pct)}
      </text>
    </svg>
  );
}

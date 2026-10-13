// 纯 SVG 图表组件（无第三方依赖，Vercel 部署安全）。

export interface Point {
  label: string;
  value: number;
}

/** 折线 / 面积图。 */
export function LineChart({
  data,
  color = "#2563eb",
  height = 150,
}: {
  data: Point[];
  color?: string;
  height?: number;
}) {
  const W = 320;
  const H = height;
  const padL = 26;
  const padR = 8;
  const padT = 12;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = 0;
  const n = Math.max(data.length - 1, 1);

  const x = (i: number) => padL + (i / n) * innerW;
  const y = (v: number) => padT + innerH - ((v - min) / (max - min)) * innerH;

  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`);
  const linePath = pts.join(" ");
  const areaPath = `M ${x(0)},${padT + innerH} L ${pts.join(" L ")} L ${x(data.length - 1)},${padT + innerH} Z`;

  // 每 2 个点显示一个 x 轴标签（避免拥挤）
  const labelStep = Math.ceil(data.length / 6);

  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="趋势折线图">
        <defs>
          <linearGradient id={`area-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 网格 */}
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <line
            key={r}
            x1={padL}
            x2={W - padR}
            y1={padT + innerH * r}
            y2={padT + innerH * r}
            stroke="#eef1f6"
            strokeWidth="1"
          />
        ))}
        <path d={areaPath} fill={`url(#area-${color.replace("#", "")})`} />
        <polyline
          points={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.value)} r="3" fill="#fff" stroke={color} strokeWidth="2" />
        ))}
        {/* x 轴标签 */}
        {data.map((d, i) =>
          i % labelStep === 0 ? (
            <text key={`x${i}`} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {d.label.slice(5)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

/** 柱状图。 */
export function BarChart({
  data,
  color = "#2563eb",
  height = 150,
}: {
  data: Point[];
  color?: string;
  height?: number;
}) {
  const W = 320;
  const H = height;
  const padT = 16;
  const padB = 22;
  const innerH = H - padT - padB;
  const max = Math.max(...data.map((d) => d.value), 1);
  const gap = 4;
  const bw = (W - gap * (data.length - 1) - 8) / data.length;
  const labelStep = Math.ceil(data.length / 7);

  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="柱状图">
        {data.map((d, i) => {
          const h = (d.value / max) * innerH;
          const bx = 4 + i * (bw + gap);
          const by = H - padB - h;
          return (
            <g key={i}>
              <rect
                x={bx}
                y={by}
                width={bw}
                height={h}
                rx="3"
                fill={color}
                opacity={d.value === 0 ? 0.15 : 0.9}
              />
              {d.value > 0 && (
                <text x={bx + bw / 2} y={by - 4} textAnchor="middle" fontSize="8.5" fill={color} fontWeight="600">
                  {d.value}
                </text>
              )}
              {i % labelStep === 0 && (
                <text x={bx + bw / 2} y={H - 7} textAnchor="middle" fontSize="8.5" fill="#94a3b8">
                  {d.label.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/** 环形图（含中心文案 + 图例）。 */
export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  size = 130,
}: {
  segments: Segment[];
  centerValue?: string;
  centerLabel?: string;
  size?: number;
}) {
  const total = Math.max(segments.reduce((s, x) => s + x.value, 0), 1);
  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="ring-wrap">
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="环形图">
        <circle cx="50" cy="50" r={R} fill="none" stroke="#eef1f6" strokeWidth="12" />
        {segments.map((s) => {
          const frac = s.value / total;
          const dash = frac * C;
          const el = (
            <circle
              key={s.label}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="12"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return el;
        })}
        <text x="50" y="47" textAnchor="middle" fontSize="16" fontWeight="800" fill="#0f172a">
          {centerValue ?? total}
        </text>
        <text x="50" y="61" textAnchor="middle" fontSize="7" fill="#94a3b8">
          {centerLabel ?? "总计"}
        </text>
      </svg>
      <div className="ring-legend">
        {segments.map((s) => (
          <div key={s.label}>
            <span className="dot" style={{ background: s.color }} />
            {s.label}
            <span className="muted" style={{ marginLeft: 6 }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

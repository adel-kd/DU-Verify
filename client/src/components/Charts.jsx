// components/Charts.jsx
//
// Dependency-free SVG charts for the dashboards.
// Monochrome design: black/white bars and lines with the single
// #12A783 seal accent. Sharp corners only.

/**
 * Vertical bar chart.
 *
 * @param {Array<{label: string, value: number, color?: string}>} data
 */
export function BarChart({ data, height = 160, unit = "" }) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="w-full">
      <div
        className="flex items-end gap-2 w-full border-b border-black/15 dark:border-line"
        style={{ height }}
      >
        {data.map((d) => (
          <div
            key={d.label}
            className="flex-1 flex flex-col items-center justify-end h-full group relative"
          >
            <span className="text-[10px] font-semibold text-ink dark:text-white mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {d.value}
              {unit}
            </span>
            <div
              className="w-full max-w-[48px]"
              style={{
                height: `${Math.max(2, (d.value / max) * (height - 24))}px`,
                backgroundColor: d.color || "#12A783",
              }}
              title={`${d.label}: ${d.value}${unit}`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1.5">
        {data.map((d) => (
          <div
            key={d.label}
            className="flex-1 text-center text-[10px] text-mist truncate"
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Simple line/area chart.
 *
 * @param {Array<{label: string, value: number}>} data
 */
export function LineChart({ data, height = 160, unit = "" }) {
  const width = 600;
  const pad = 8;

  const max = Math.max(1, ...data.map((d) => d.value));
  const step =
    data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;

  const points = data.map((d, i) => [
    pad + i * step,
    height - pad - (d.value / max) * (height - pad * 2),
  ]);

  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const area = `${path} L${points.length ? points[points.length - 1][0] : pad},${height - pad} L${pad},${height - pad} Z`;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad}
            x2={width - pad}
            y1={height * f}
            y2={height * f}
            stroke="currentColor"
            className="text-black/10 dark:text-line"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill="#12A783" opacity="0.12" />
        <path
          d={path}
          fill="none"
          stroke="#12A783"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.5" fill="#12A783" />
        ))}
      </svg>
      <div className="flex justify-between mt-1.5 text-[10px] text-mist">
        <span>{data[0]?.label}</span>
        <span>
          max {max}
          {unit}
        </span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/**
 * Horizontal proportion bar (e.g. valid vs failed split).
 */
export function SplitBar({ segments }) {
  const total = Math.max(
    1,
    segments.reduce((sum, s) => sum + s.value, 0)
  );

  return (
    <div>
      <div className="flex w-full h-4 border border-black/15 dark:border-line">
        {segments.map((s) => (
          <div
            key={s.label}
            style={{
              width: `${(s.value / total) * 100}%`,
              backgroundColor: s.color,
            }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {segments.map((s) => (
          <span
            key={s.label}
            className="inline-flex items-center gap-1.5 text-xs text-mist"
          >
            <span
              className="inline-block w-2.5 h-2.5"
              style={{ backgroundColor: s.color }}
            />
            {s.label} — {s.value}
          </span>
        ))}
      </div>
    </div>
  );
}

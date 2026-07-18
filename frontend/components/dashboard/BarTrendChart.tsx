"use client";

export interface TrendPoint {
  label: string;
  value: number;
}

const BAR_HUE = "#0d9488"; // teal-600 — validated for dark surfaces (see dataviz skill)

export default function BarTrendChart({
  points,
  unit = "",
  maxValue,
}: {
  points: TrendPoint[];
  unit?: string;
  maxValue?: number;
}) {
  if (points.length === 0) {
    return (
      <p className="text-slate-500 text-sm py-10 text-center">
        Not enough session data yet.
      </p>
    );
  }

  const max = maxValue ?? Math.max(...points.map((p) => p.value), 1);
  const chartHeight = 140;
  const barGap = 8;
  const barWidth = 28;
  const width = points.length * (barWidth + barGap) + barGap;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${chartHeight + 28}`}
        width={Math.max(width, 320)}
        height={chartHeight + 28}
        role="img"
        aria-label="Session trend chart"
      >
        {/* baseline */}
        <line
          x1={0}
          y1={chartHeight}
          x2={width}
          y2={chartHeight}
          stroke="#334155"
          strokeWidth={1}
        />

        {points.map((point, i) => {
          const barHeight = Math.max((point.value / max) * (chartHeight - 8), 2);
          const x = barGap + i * (barWidth + barGap);
          const y = chartHeight - barHeight;

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={4}
                fill={BAR_HUE}
              >
                <title>
                  {point.label}: {point.value}
                  {unit}
                </title>
              </rect>

              <text
                x={x + barWidth / 2}
                y={chartHeight + 16}
                textAnchor="middle"
                fontSize={10}
                fill="#94a3b8"
              >
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

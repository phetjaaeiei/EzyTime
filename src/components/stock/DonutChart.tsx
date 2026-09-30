import { buildDonutArcs, type DonutSlice } from "../../lib/stock.calc";

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}

export default function DonutChart({
  slices,
  size = 104,
  thickness = 13,
  centerLabel,
  centerSub,
}: DonutChartProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcs = buildDonutArcs(slices, circumference);
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const ariaLabel = slices.map((slice) => `${slice.label} ${slice.value}`).join(", ");

  return (
    <div className="donut">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={total > 0 ? ariaLabel : "ยังไม่มีข้อมูล"}
      >
        <circle
          className="donut-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
        />
        {total > 0
          ? arcs.map((arc, index) => (
              <circle
                key={index}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={thickness}
                strokeDasharray={arc.dashArray}
                strokeDashoffset={arc.dashOffset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            ))
          : null}
      </svg>
      {centerLabel ? (
        <div className="donut-center" aria-hidden="true">
          <strong>{centerLabel}</strong>
          {centerSub ? <span>{centerSub}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

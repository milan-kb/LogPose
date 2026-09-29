import { useState } from "react";
import { compareAtDepth, compareProfile } from "../data/ocean";
import type { OceanData, Profile } from "../data/ocean";

export default function ProfileChart({
  data,
  profile,
  depth,
  onDepth,
}: {
  data: OceanData;
  profile: Profile;
  depth: number;
  onDepth: (depth: number) => void;
}) {
  const { samples } = compareProfile(data, profile);
  const [hover, setHover] = useState<number | null>(null);
  const x = (t: number) => 53 + ((t - 4) / 26) * 283;
  const y = (d: number) => 29 + (d / 1200) * 215;
  const nearest = (target: number) =>
    samples.reduce(
      (best, s) =>
        Math.abs(s.depth - target) < Math.abs(best.depth - target) ? s : best,
      samples[0],
    );
  const active = compareAtDepth(data, profile, depth);
  const path = (key: "model" | "observed") => {
    let connected = false;
    return samples
      .map((s) => {
        const t = s[key];
        if (t === null || !Number.isFinite(t)) {
          connected = false;
          return "";
        }
        const segment = `${connected ? "L" : "M"}${x(t)},${y(s.depth)}`;
        connected = true;
        return segment;
      })
      .join(" ");
  };
  const pointerDepth = (
    event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>,
  ) => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return depth;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return Math.max(0, Math.min(1200, ((point.y - 29) / 215) * 1200));
  };

  return (
    <div className="profile-chart">
      <svg
        viewBox="0 0 360 300"
        role="img"
        aria-label={`Model and synthetic observed temperature profiles for ${profile.platform}; depth increases downward`}
        onPointerMove={(event) => setHover(pointerDepth(event))}
        onPointerLeave={() => setHover(null)}
        onClick={(event) => onDepth(nearest(pointerDepth(event)).depth)}
      >
        <text x="0" y="14" className="chart-caption">
          Depth (m)
        </text>
        {[0, 300, 600, 900, 1200].map((d) => (
          <g key={d}>
            <line x1="53" x2="336" y1={y(d)} y2={y(d)} className="chart-grid" />
            {Math.abs(d - active.depth) > 90 && (
              <text x="43" y={y(d) + 4.5} textAnchor="end">
                {d.toLocaleString()}
              </text>
            )}
          </g>
        ))}
        {[5, 10, 15, 20, 25, 30].map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1="29"
              y2="244"
              className="chart-grid vertical"
            />
            <text x={x(t)} y="265" textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        <text x="195" y="291" textAnchor="middle" className="chart-caption">
          Temperature (°C)
        </text>
        <path
          d={path("model")}
          fill="none"
          stroke="#78dcca"
          strokeWidth="2.8"
        />
        <path
          d={path("observed")}
          fill="none"
          stroke="#edb67e"
          strokeWidth="2.3"
          strokeDasharray="5 4"
        />
        {samples.map(
          (s) =>
            Number.isFinite(s.observed) && (
              <circle
                key={s.depth}
                cx={x(s.observed)}
                cy={y(s.depth)}
                r="2.6"
                fill="#edb67e"
              />
            ),
        )}
        {hover !== null &&
          Math.abs(nearest(hover).depth - active.depth) > 50 && (
            <line
              x1="53"
              x2="336"
              y1={y(nearest(hover).depth)}
              y2={y(nearest(hover).depth)}
              stroke="#8c9eac"
              strokeDasharray="3 5"
              opacity=".5"
            />
          )}
        <line
          x1="53"
          x2="336"
          y1={y(active.depth)}
          y2={y(active.depth)}
          stroke="#78dcca"
          strokeDasharray="4 4"
          opacity=".7"
        />
        <rect
          x="0"
          y={y(active.depth) - 10}
          width="46"
          height="21"
          rx="3"
          fill="#23423f"
        />
        <text
          x="40"
          y={y(active.depth) + 4}
          textAnchor="end"
          className="selected-depth-label"
        >
          {active.depth.toLocaleString()}
        </text>
        {active.model !== null && (
          <circle
            cx={x(active.model)}
            cy={y(active.depth)}
            r="5"
            stroke="#101b24"
            strokeWidth="2"
            fill="#78dcca"
          />
        )}
        {active.observed !== null && (
          <circle
            cx={x(active.observed)}
            cy={y(active.depth)}
            r="5"
            stroke="#101b24"
            strokeWidth="2"
            fill="#edb67e"
          />
        )}
      </svg>
      <p className="chart-hint">
        Click a depth to explore that part of the profile.
      </p>
    </div>
  );
}

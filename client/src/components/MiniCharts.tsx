import { Empty } from "antd";
import { formatMoney } from "../utils/formatMoney";
import { formatPercent } from "../utils/formatPercent";

const palette = ["#3b72e0", "#22a675", "#f59e0b", "#e14d5a", "#7c6fd6", "#2bb3a3", "#94a3b8"];

export function TrendChart({
  data,
  valueKey,
  label
}: {
  data: Array<Record<string, number | string | null>>;
  valueKey: string;
  label: string;
}) {
  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无趋势数据" />;
  const values = data.map((item) => Number(item[valueKey] ?? 0));
  const max = Math.max(...values, 1);
  const width = 560;
  const height = 220;
  const points = values.map((value, index) => {
    const x = data.length === 1 ? width / 2 : 28 + (index * (width - 56)) / (data.length - 1);
    const y = height - 32 - (value / max) * (height - 72);
    return { x, y, value, month: String(data[index].month) };
  });
  const d = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className="chart-box">
      <div className="chart-title">{label}</div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        {[0, 1, 2, 3].map((tick) => (
          <line key={tick} x1="28" x2={width - 28} y1={34 + tick * 42} y2={34 + tick * 42} className="grid-line" />
        ))}
        <path d={d} fill="none" stroke="#3b72e0" strokeWidth="4" strokeLinecap="round" />
        {points.map((point) => (
          <g key={point.month}>
            <circle cx={point.x} cy={point.y} r="5" fill="#3b72e0" />
            <text x={point.x} y={height - 10} textAnchor="middle" className="axis-label">{point.month}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function DonutChart({
  data,
  labelKey,
  valueKey,
  title
}: {
  data: Array<Record<string, number | string | null>>;
  labelKey: string;
  valueKey: string;
  title: string;
}) {
  const total = data.reduce((sum, item) => sum + Number(item[valueKey] ?? 0), 0);
  if (!data.length || total <= 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无占比数据" />;
  let offset = 25;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="chart-box donut-layout">
      <div>
        <div className="chart-title">{title}</div>
        <svg viewBox="0 0 160 160" className="donut-svg" role="img">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#e8edf5" strokeWidth="24" />
          {data.map((item, index) => {
            const value = Number(item[valueKey] ?? 0);
            const dash = (value / total) * circumference;
            const circle = (
              <circle
                key={String(item[labelKey])}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={palette[index % palette.length]}
                strokeWidth="24"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                transform="rotate(-90 80 80)"
              />
            );
            offset -= dash;
            return circle;
          })}
          <text x="80" y="76" textAnchor="middle" className="donut-center">合计</text>
          <text x="80" y="96" textAnchor="middle" className="donut-value">{formatMoney(total)}</text>
        </svg>
      </div>
      <div className="legend-list">
        {data.map((item, index) => (
          <div key={String(item[labelKey])} className="legend-row">
            <span className="legend-dot" style={{ background: palette[index % palette.length] }} />
            <span>{String(item[labelKey])}</span>
            <strong>{formatPercent(Number(item[valueKey] ?? 0) / total)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarList({
  data,
  labelKey,
  valueKey,
  title
}: {
  data: Array<Record<string, number | string | null>>;
  labelKey: string;
  valueKey: string;
  title: string;
}) {
  const max = Math.max(...data.map((item) => Number(item[valueKey] ?? 0)), 1);
  return (
    <div className="chart-box">
      <div className="chart-title">{title}</div>
      <div className="bar-list">
        {data.slice(0, 8).map((item, index) => {
          const value = Number(item[valueKey] ?? 0);
          return (
            <div className="bar-row" key={String(item[labelKey])}>
              <div className="bar-label">{String(item[labelKey])}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.max(4, (value / max) * 100)}%`, background: palette[index % palette.length] }} />
              </div>
              <div className="bar-value">{formatMoney(value)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

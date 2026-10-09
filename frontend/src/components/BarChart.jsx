export default function BarChart({ data, className = "", selected = "", onSelect }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const clickable = typeof onSelect === "function";
  return (
    <div className={`bar-chart ${className}`.trim()}>
      {data.map((d) => {
        const label = d.label || d.name || d.bucket;
        const key = d.name || d.bucket;
        const isOn = selected && selected === d.name;
        const Row = clickable ? "button" : "div";
        return (
          <Row
            key={key}
            type={clickable ? "button" : undefined}
            className={`bar-row${isOn ? " is-on" : ""}${clickable ? " is-click" : ""}`}
            onClick={clickable ? () => onSelect(isOn ? "" : d.name) : undefined}
          >
            <span className="bar-label" title={d.name || label}>
              {label}
            </span>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </div>
            <span className="bar-val">
              {d.count}
              {d.percent != null ? (
                <span className="bar-pct">{d.percent}%</span>
              ) : null}
            </span>
          </Row>
        );
      })}
    </div>
  );
}

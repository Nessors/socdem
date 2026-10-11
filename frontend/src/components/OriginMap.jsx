import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import russiaSubjects from "../geo/russia-subjects.json";
import { matchGeoToOurs } from "../geo/matchRegion.js";
import { formatDuty, formatRank } from "../serviceTitle.js";
import { fullName } from "../utils";

const VIEW_W = 1100;
const VIEW_H = 520;
const PAD = 18;

function albersRaw(lon, lat) {
  const rad = Math.PI / 180;
  const φ1 = 50 * rad;
  const φ2 = 70 * rad;
  const φ0 = 54 * rad;
  const λ0 = 100 * rad;
  const n = 0.5 * (Math.sin(φ1) + Math.sin(φ2));
  const C = Math.cos(φ1) ** 2 + 2 * n * Math.sin(φ1);
  const ρ0 = Math.sqrt(C - 2 * n * Math.sin(φ0)) / n;
  const east = lon < 0 ? lon + 360 : lon;
  const λ = east * rad;
  const φ = lat * rad;
  const ρ = Math.sqrt(C - 2 * n * Math.sin(φ)) / n;
  const θ = n * (λ - λ0);
  return [ρ * Math.sin(θ), ρ0 - ρ * Math.cos(θ)];
}

function forEachPoint(geometry, fn) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const pt of ring) fn(pt[0], pt[1]);
    }
  }
}

function makeProjector(features) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of features) {
    forEachPoint(f.geometry, (lon, lat) => {
      const [x, y] = albersRaw(lon, lat);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    });
  }
  const sx = (VIEW_W - PAD * 2) / (maxX - minX);
  const sy = (VIEW_H - PAD * 2) / (maxY - minY);
  const s = Math.min(sx, sy);
  const ox = PAD + ((VIEW_W - PAD * 2) - (maxX - minX) * s) / 2;
  const oy = PAD + ((VIEW_H - PAD * 2) - (maxY - minY) * s) / 2;
  return (lon, lat) => {
    const [x, y] = albersRaw(lon, lat);
    return [ox + (x - minX) * s, oy + (maxY - y) * s];
  };
}

function geomToPath(geometry, project) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const parts = [];
  for (const poly of polys) {
    for (const ring of poly) {
      if (!ring?.length) continue;
      const pts = ring.map(([lon, lat]) => project(lon, lat));
      let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let i = 1; i < pts.length; i += 1) {
        const dx = pts[i][0] - pts[i - 1][0];
        if (Math.abs(dx) > VIEW_W * 0.45) {
          d += `M${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
        } else {
          d += `L${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
        }
      }
      d += "Z";
      parts.push(d);
    }
  }
  return parts.join("");
}

function fillFor(count, max) {
  if (!count) return "#d2d7df";
  const t = Math.max(0.22, count / Math.max(max, 1));
  const r = Math.round(42 + (230 - 42) * t);
  const g = Math.round(63 + (189 - 63) * t);
  const b = Math.round(95 + (117 - 95) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export default function OriginMap({
  data = [],
  people = [],
  selected = "",
  onSelect,
}) {
  const [hover, setHover] = useState(null);

  const byName = useMemo(() => {
    const map = new Map();
    for (const d of data) map.set(d.name, d);
    return map;
  }, [data]);

  const { regions, max, abroad } = useMemo(() => {
    const project = makeProjector(russiaSubjects.features);
    const mapped = [];
    const used = new Set();
    for (const f of russiaSubjects.features) {
      const ours = matchGeoToOurs(f.properties.name);
      const stat = ours ? byName.get(ours) : null;
      if (ours) used.add(ours);
      mapped.push({
        geoName: f.properties.name,
        name: ours || f.properties.name,
        label: stat?.label || ours || f.properties.name,
        count: stat?.count ?? 0,
        percent: stat?.percent,
        d: geomToPath(f.geometry, project),
      });
    }
    const leftover = data.filter(
      (d) => d.name && d.name !== "Не указано" && d.count > 0 && !used.has(d.name)
    );
    return {
      regions: mapped,
      max: Math.max(...data.map((d) => d.count), 1),
      abroad: leftover,
    };
  }, [byName, data]);

  const pick = (name) => {
    if (!onSelect) return;
    onSelect(selected === name ? "" : name);
  };

  const selectedPeople = useMemo(() => {
    if (!selected) return [];
    return people.filter((s) => (s.origin_region || "") === selected);
  }, [people, selected]);

  const selectedMeta = byName.get(selected);
  const hoverMeta = hover;

  return (
    <div className="origin-map">
      <svg
        className="origin-map-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="Карта субъектов Российской Федерации"
      >
        <defs>
          <radialGradient id="originSea" cx="48%" cy="42%" r="78%">
            <stop offset="0%" stopColor="#f3f5f8" />
            <stop offset="100%" stopColor="#e4e9f0" />
          </radialGradient>
        </defs>
        <rect width={VIEW_W} height={VIEW_H} fill="url(#originSea)" rx="18" />
        {regions.map((r) => {
          const active = selected === r.name || hover?.name === r.name;
          return (
            <path
              key={r.geoName}
              className={`origin-region${r.count ? "" : " is-empty"}${active ? " is-on" : ""}`}
              d={r.d}
              fill={fillFor(r.count, max)}
              opacity={selected && selected !== r.name ? 0.42 : 1}
              role="button"
              tabIndex={0}
              aria-label={`${r.label}: ${r.count} чел.`}
              aria-pressed={selected === r.name}
              onClick={() => pick(r.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pick(r.name);
                }
              }}
              onMouseEnter={() => setHover(r)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(r)}
              onBlur={() => setHover(null)}
            />
          );
        })}
        <g className="origin-compass" transform={`translate(${VIEW_W - 48} 48)`}>
          <circle r="20" />
          <polygon points="0,-14 4.5,4 0,1.5 -4.5,4" />
          <text y="32">С</text>
        </g>
      </svg>
      <div className="origin-map-legend">
        <span>Цвет субъекта — сколько человек оттуда</span>
        <span className="origin-map-scale">
          <i style={{ width: 12, height: 12, background: "#d2d7df" }} /> нет
          <i style={{ width: 12, height: 12, background: "#54657f" }} /> мало
          <i style={{ width: 12, height: 12, background: "#e6bd75" }} /> много
        </span>
        {abroad.length ? (
          <span className="origin-abroad">
            Вне карты:{" "}
            {abroad.map((d) => (
              <button
                key={d.name}
                type="button"
                className={selected === d.name ? "is-on" : undefined}
                onClick={() => pick(d.name)}
              >
                {d.label || d.name} ({d.count})
              </button>
            ))}
          </span>
        ) : null}
      </div>
      {hoverMeta && !selected && (
        <div className="origin-tooltip" role="status">
          <strong>{hoverMeta.label}</strong>
          <span>
            {hoverMeta.count} чел.
            {hoverMeta.percent != null ? ` · ${hoverMeta.percent}%` : ""}
          </span>
          <em>Нажмите, чтобы увидеть список</em>
        </div>
      )}
      <div className="origin-people" aria-live="polite">
        {selected ? (
          <>
            <div className="origin-people-head">
              <div>
                <h4>{selectedMeta?.label || selected}</h4>
                <p className="muted">
                  {selectedPeople.length}{" "}
                  {selectedPeople.length === 1 ? "человек" : "чел."} из этого региона
                </p>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => pick(selected)}>
                Сбросить
              </button>
            </div>
            {selectedPeople.length === 0 ? (
              <p className="muted">В базе пока никого с этим регионом.</p>
            ) : (
              <ul className="origin-people-list">
                {selectedPeople.map((s) => (
                  <li key={s.id}>
                    <Link to={`/students/${s.id}`} className="name-link">
                      {fullName(s)}
                    </Link>
                    <span className="origin-people-meta">
                      {formatDuty(s)}
                      {formatRank(s) ? ` · ${formatRank(s)}` : ""}
                      {s.group_name ? ` · ${s.group_name}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="muted origin-people-hint">
            Нажмите субъект на карте — здесь появятся люди, которые оттуда приехали
          </p>
        )}
      </div>
    </div>
  );
}

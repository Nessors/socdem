import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import BarChart from "../components/BarChart.jsx";
import OriginMap from "../components/OriginMap.jsx";

export default function GeographyPage() {
  const [rows, setRows] = useState([]);
  const [region, setRegion] = useState("");

  useEffect(() => {
    api.geography().then(setRows);
  }, []);

  const totals = useMemo(() => {
    const counts = new Map();
    for (const s of rows) {
      const name = s.origin_region || "Не указано";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const total = rows.length || 1;
    return [...counts.entries()]
      .map(([name, count]) => ({
        name,
        label: name.replace(/^Республика\s+/u, ""),
        count,
        percent: Math.round((count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
  }, [rows]);

  return (
    <div className="geo-page">
      <section className="panel chart-panel origin-map-panel">
        <h3>География набора</h3>
        <p className="muted chart-sub">
          Откуда приехали · субъекты РФ
          {rows.length ? ` · ${totals.length} регионов · ${rows.length} чел.` : ""}
          {region ? ` · выбран: ${region.replace(/^Республика\s+/u, "")}` : ""}
        </p>
        {totals.length ? (
          <OriginMap
            data={totals}
            people={rows}
            selected={region}
            onSelect={setRegion}
          />
        ) : (
          <p className="muted">Нет данных.</p>
        )}
      </section>
      <section className="panel chart-panel">
        <h3>По субъектам</h3>
        <p className="muted chart-sub">
          Нажмите субъект на карте или строку диаграммы — подсветка на карте
        </p>
        {totals.length ? (
          <BarChart
            data={totals}
            className="geo-chart geo-chart-page"
            selected={region}
            onSelect={setRegion}
          />
        ) : (
          <p className="muted">Нет данных.</p>
        )}
      </section>
    </div>
  );
}

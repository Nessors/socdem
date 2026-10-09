import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import BarChart from "../components/BarChart.jsx";
import OriginMap from "../components/OriginMap.jsx";
import HousingPicker from "../components/HousingPicker.jsx";
import { IdentityCells, IdentityHeaderCells } from "../components/PersonIdentity.jsx";
import { fullName, personSearchHay } from "../utils";

export default function GeographyPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
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

  const filtered = rows.filter((s) => {
    const hay =
      `${personSearchHay(s)} ${s.origin_region ?? ""} ${s.birth_place ?? ""} ${s.registration_address ?? ""} ${s.residence_address ?? ""}`.toLowerCase();
    if (q.trim() && !hay.includes(q.trim().toLowerCase())) return false;
    if (region && s.origin_region !== region) return false;
    return true;
  });

  return (
    <div className="geo-page">
      <section className="panel chart-panel origin-map-panel">
        <h3>География набора</h3>
        <p className="muted chart-sub">
          Откуда приехали · субъекты РФ, не населённые пункты
          {rows.length ? ` · ${totals.length} регионов · ${rows.length} чел.` : ""}
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
        <p className="muted chart-sub">Нажмите субъект на карте или строку — появится список людей</p>
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

      <section className="panel table-panel">
        <div className="card-head">
          <p className="section-caption">
            {filtered.length}{" "}
            {filtered.length === 1 ? "человек" : "чел."}
            {region ? ` · ${region}` : ""}
          </p>
          <div className="filter-bar">
            <input
              type="search"
              className="search"
              placeholder="Поиск по ФИО, региону, адресу…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              aria-label="Регион"
            >
              <option value="">Все регионы</option>
              {totals.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.label} ({t.count})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-wrap dark-table">
          <table>
            <thead>
              <tr>
                <IdentityHeaderCells />
                <th>ФИО</th>
                <th>Группа</th>
                <th>Регион</th>
                <th>Место рождения</th>
                <th>Регистрация</th>
                <th>Проживание</th>
                <th>Место жительства</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <IdentityCells person={s} />
                  <td>
                    <Link to={`/students/${s.id}`} className="name-link">
                      {fullName(s)}
                    </Link>
                  </td>
                  <td>
                    <Link to={`/groups/${s.group_id}`}>{s.group_name}</Link>
                  </td>
                  <td>{s.origin_region || "—"}</td>
                  <td>{s.birth_place || "—"}</td>
                  <td>{s.registration_address || "—"}</td>
                  <td>
                    <HousingPicker
                      compact
                      name={`housing-geo-${s.id}`}
                      value={s.housing || ""}
                      onChange={async (housing) => {
                        await api.updateStudent(s.id, { housing });
                        setRows((list) =>
                          list.map((x) =>
                            x.id === s.id ? { ...x, housing } : x
                          )
                        );
                      }}
                    />
                  </td>
                  <td>{s.residence_address || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="empty">Никого не найдено по запросу.</p>
        )}
      </section>
    </div>
  );
}

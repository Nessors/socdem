import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import BarChart from "../components/BarChart.jsx";
import OriginMap from "../components/OriginMap.jsx";
import { IconHome, IconStatBuilding, IconStatUser } from "../components/NavIcons.jsx";
import { housingLabel } from "../components/HousingPicker.jsx";
import { IdentityCells, IdentityHeaderCells } from "../components/PersonIdentity.jsx";
import { fullName, personSearchHay } from "../utils";

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [q, setQ] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [housingFilter, setHousingFilter] = useState("");

  useEffect(() => {
    Promise.all([api.dashboard(), api.students(), api.groups()]).then(
      ([d, st, gr]) => {
        setStats(d);
        setStudents(st);
        setGroups(gr);
      }
    );
  }, []);

  const regions = useMemo(() => {
    const set = new Set();
    students.forEach((s) => {
      if (s.origin_region) set.add(s.origin_region);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [students]);

  const deferredQ = useDeferredValue(q);

  const filtered = students.filter((s) => {
    const hay = `${personSearchHay(s)} ${s.group_name} ${s.birth_place ?? ""} ${s.residence_address ?? ""} ${housingLabel(s.housing)}`.toLowerCase();
    if (deferredQ && !hay.includes(deferredQ.toLowerCase())) return false;
    if (groupFilter && s.group_name !== groupFilter) return false;
    if (regionFilter && s.origin_region !== regionFilter) return false;
    if (housingFilter && (s.housing || "") !== housingFilter) return false;
    return true;
  });

  if (!stats) return <p className="muted center">Загрузка…</p>;

  return (
    <div className="dashboard">
      <div className="stat-grid">
        <article className="stat-card">
          <div className="stat-card-head">
            <p className="stat-label">Всего л/с</p>
            <IconStatUser className="stat-icon-svg" />
          </div>
          <p className="stat-value">{stats.total}</p>
          <p className="stat-hint">человек в базе</p>
        </article>
        <article className="stat-card">
          <div className="stat-card-head">
            <p className="stat-label">В казарме</p>
            <IconStatBuilding className="stat-icon-svg" />
          </div>
          <p className="stat-value">{stats.barracks}</p>
          <p className="stat-hint">отмечено в карточках</p>
        </article>
        <article className="stat-card">
          <div className="stat-card-head">
            <p className="stat-label">Вне казармы</p>
            <IconHome className="stat-icon-svg" />
          </div>
          <p className="stat-value">{stats.off_barracks}</p>
          <p className="stat-hint">отмечено в карточках</p>
        </article>
      </div>

      <div className="chart-grid chart-grid-geo">
        <section className="panel chart-panel origin-map-panel">
          <h3>География набора</h3>
          <p className="muted chart-sub">
            Откуда приехали · субъекты РФ
            {stats.geography?.length
              ? ` · ${stats.geography.length} регионов · ${stats.total} чел.`
              : ""}
          </p>
          {stats.geography?.length ? (
            <OriginMap
              data={stats.geography}
              people={students}
              selected={regionFilter}
              onSelect={setRegionFilter}
            />
          ) : (
            <p className="muted">Нет данных — заполните место рождения в карточках.</p>
          )}
        </section>
        <section className="panel chart-panel">
          <h3>По субъектам</h3>
          <p className="muted chart-sub">Нажмите субъект на карте или строку — появится список людей</p>
          {stats.geography?.length ? (
            <BarChart
              data={stats.geography}
              className="geo-chart"
              selected={regionFilter}
              onSelect={setRegionFilter}
            />
          ) : (
            <p className="muted">Нет данных.</p>
          )}
        </section>
      </div>

      <section className="panel table-panel">
        <h3>Быстрый поиск и фильтрация</h3>
        <div className="filter-bar">
          <input
            type="search"
            placeholder="Поиск по ФИО, должности, званию, группе…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="">Группа</option>
            {groups.map((g) => (
              <option key={g.id} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
            <option value="">Регион</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select value={housingFilter} onChange={(e) => setHousingFilter(e.target.value)}>
            <option value="">Проживание</option>
            <option value="barracks">В казарме</option>
            <option value="off_barracks">Вне казармы</option>
          </select>
        </div>
        <div className="table-wrap dark-table">
          <table>
            <thead>
              <tr>
                <IdentityHeaderCells />
                <th>ФИО</th>
                <th>Группа</th>
                <th>Регион (откуда)</th>
                <th>Проживание</th>
                <th>Телефон</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 12).map((s) => (
                <tr key={s.id}>
                  <IdentityCells person={s} />
                  <td>
                    <Link to={`/students/${s.id}`}>{fullName(s)}</Link>
                  </td>
                  <td>
                    <Link to={`/groups/${s.group_id}`}>{s.group_name}</Link>
                  </td>
                  <td>{s.origin_region || "—"}</td>
                  <td>{housingLabel(s.housing)}</td>
                  <td>{s.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link to="/students" className="link-more">
          Весь личный состав →
        </Link>
      </section>
    </div>
  );
}

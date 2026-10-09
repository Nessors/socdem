import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { formatDate, fullName } from "../utils";

export default function MourningPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.mourning().then(setRows);
  }, []);

  const filtered = rows.filter((m) => {
    const hay = `${fullName(m)} ${m.group_name} ${m.full_name} ${m.relation ?? ""} ${m.cause_of_death ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <section className="panel table-panel mourning-page">
      <p className="section-caption">
        {filtered.length} {filtered.length === 1 ? "событие" : "событий"}
      </p>
      <p className="muted panel-lead">
        События привязаны к конкретному человеку в личном составе. Добавление и правка — в его карточке.
      </p>
      <input
        type="search"
        className="search-wide"
        placeholder="Поиск по курсанту, ФИО умершего, причине…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="table-wrap dark-table">
        <table>
          <thead>
            <tr>
              <th>Курсант</th>
              <th>Группа</th>
              <th>Кто</th>
              <th>ФИО умершего</th>
              <th>Дата смерти</th>
              <th>Причина смерти</th>
              <th>Дополнительно</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link to={`/students/${m.student_id}`}>{fullName(m)}</Link>
                </td>
                <td>{m.group_name}</td>
                <td>{m.relation || "—"}</td>
                <td>{m.full_name}</td>
                <td>{formatDate(m.death_date)}</td>
                <td>{m.cause_of_death}</td>
                <td>{m.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="empty">Записей нет.</p>}
      </div>
    </section>
  );
}

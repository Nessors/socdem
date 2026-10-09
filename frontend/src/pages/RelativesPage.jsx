import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { formatDate, fullName } from "../utils";

export default function RelativesPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.relatives().then(setRows);
  }, []);

  const filtered = rows.filter((r) => {
    const hay = `${r.full_name} ${r.relation} ${fullName(r)} ${r.phone ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <section className="panel table-panel">
      <p className="section-caption">
        {filtered.length} {filtered.length === 1 ? "запись" : "записей"}
      </p>
      <input
        type="search"
        className="search-wide"
        placeholder="Поиск по ФИО родственника или курсанта…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="table-wrap dark-table">
        <table>
          <thead>
            <tr>
              <th>Курсант</th>
              <th>Группа</th>
              <th>Степень</th>
              <th>ФИО родственника</th>
              <th>Дата рожд.</th>
              <th>Телефон</th>
              <th>Дополнительно</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/students/${r.student_id}`}>
                    {fullName(r)}
                  </Link>
                </td>
                <td>{r.group_name}</td>
                <td>{r.relation}</td>
                <td>{r.full_name}</td>
                <td>{formatDate(r.birth_date)}</td>
                <td>{r.phone || "—"}</td>
                <td>{r.details || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="empty">Записей нет.</p>}
      </div>
    </section>
  );
}

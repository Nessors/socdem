import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import FioSearchField from "../components/FioSearchField.jsx";
import { buildCadetEventTree } from "../lib/cadetEventTree.js";
import { formatDate, fullName } from "../utils";

function Chevron() {
  return (
    <svg className="roster-chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function toggleInSet(setter, key) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
}

export default function MourningPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [openCourses, setOpenCourses] = useState(() => new Set());

  useEffect(() => {
    api.mourning().then(setRows);
  }, []);

  const needle = q.trim().toLowerCase();
  const searching = Boolean(needle);

  const filtered = useMemo(
    () =>
      rows.filter((m) => {
        const hay =
          `${fullName(m)} ${m.group_name ?? ""} ${m.full_name ?? ""} ${m.relation ?? ""} ${m.cause_of_death ?? ""} ${m.notes ?? ""}`.toLowerCase();
        return !needle || hay.includes(needle);
      }),
    [rows, needle]
  );

  const tree = useMemo(() => buildCadetEventTree(filtered), [filtered]);
  const totalRecords = filtered.length;

  return (
    <section className="panel table-panel mourning-page">
      <div className="card-head list-head">
        <p className="section-caption">
          {totalRecords} {totalRecords === 1 ? "запись" : "записей"}
        </p>
        <FioSearchField
          grow
          placeholder="Поиск по ФИО курсанта, умершего, причине…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <p className="muted panel-lead">
        Свернуть можно только курс; группы и курсанты видны сразу. Если мать или отец не
        внесены в родственники — напоминание здесь. Правка в карточке курсанта.
      </p>

      {totalRecords === 0 ? (
        <p className="empty">Записей нет.</p>
      ) : (
        <div className="roster-tree relatives-tree mourning-tree">
          {tree.map((course) => {
            const courseOpened = searching || openCourses.has(course.code);
            return (
              <section key={course.code} className="roster-node">
                <button
                  type="button"
                  className={`roster-toggle${courseOpened ? " is-open" : ""}`}
                  aria-expanded={courseOpened}
                  onClick={() => toggleInSet(setOpenCourses, course.code)}
                >
                  <Chevron />
                  <span className="roster-toggle-name">
                    {course.code === "—" ? "Без курса" : `${course.code} курс`}
                  </span>
                  <span className="roster-count">{course.count}</span>
                </button>
                {courseOpened && (
                  <ul className="roster-groups">
                    {course.groups.map((group) => {
                      const gKey = `${course.code}::${group.name}`;
                      const groupCount = group.cadets.reduce(
                        (s, c) => s + c.items.length,
                        0
                      );
                      return (
                        <li key={gKey} className="roster-group">
                          <div className="roster-group-heading">
                            <span className="roster-toggle-name">{group.name}</span>
                            <span className="roster-count">{groupCount}</span>
                          </div>
                          <ul className="relatives-cadets">
                            {group.cadets.map((cadet) => (
                              <li key={cadet.student_id} className="relatives-cadet">
                                <div className="relatives-cadet-head">
                                  <Link
                                    to={`/students/${cadet.student_id}`}
                                    className="relatives-cadet-link"
                                  >
                                    {fullName(cadet)}
                                  </Link>
                                  <span className="roster-count">{cadet.items.length}</span>
                                </div>
                                <div className="table-wrap dark-table relatives-cadet-table">
                                  <table>
                                    <thead>
                                      <tr>
                                        <th>Кто</th>
                                        <th>ФИО умершего</th>
                                        <th>Дата смерти</th>
                                        <th>Причина смерти</th>
                                        <th>Дополнительно</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {cadet.items.map((m) => (
                                        <tr
                                          key={m.id}
                                          className={
                                            m.is_missing_parent ? "mourning-gap-row" : undefined
                                          }
                                        >
                                          <td>{m.relation || "—"}</td>
                                          <td>{m.full_name}</td>
                                          <td>{formatDate(m.death_date)}</td>
                                          <td>{m.cause_of_death || "—"}</td>
                                          <td>{m.notes || "—"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

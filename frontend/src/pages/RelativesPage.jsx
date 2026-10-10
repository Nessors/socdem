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

export default function RelativesPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [openCourses, setOpenCourses] = useState(() => new Set());
  const [openGroups, setOpenGroups] = useState(() => new Set());

  useEffect(() => {
    api.relatives().then(setRows);
  }, []);

  const needle = q.trim().toLowerCase();
  const searching = Boolean(needle);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const hay =
          `${r.full_name} ${r.relation} ${fullName(r)} ${r.phone ?? ""} ${r.group_name ?? ""}`.toLowerCase();
        return !needle || hay.includes(needle);
      }),
    [rows, needle]
  );

  const tree = useMemo(() => {
    const courses = buildCadetEventTree(filtered);
    for (const course of courses) {
      for (const group of course.groups) {
        for (const cadet of group.cadets) {
          cadet.relatives = [...cadet.items].sort((a, b) =>
            String(a.relation).localeCompare(String(b.relation), "ru")
          );
        }
      }
    }
    return courses;
  }, [filtered]);
  const totalRecords = filtered.length;

  const groupKey = (courseCode, groupName) => `${courseCode}::${groupName}`;

  return (
    <section className="panel table-panel relatives-page">
      <div className="card-head list-head">
        <p className="section-caption">
          {totalRecords} {totalRecords === 1 ? "запись" : "записей"}
        </p>
        <FioSearchField
          grow
          placeholder="Поиск по ФИО родственника или курсанта…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {totalRecords === 0 ? (
        <p className="empty">Записей нет.</p>
      ) : (
        <div className="roster-tree relatives-tree">
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
                      const gKey = groupKey(course.code, group.name);
                      const groupOpened = searching || openGroups.has(gKey);
                      const groupCount = group.cadets.reduce(
                        (s, c) => s + c.relatives.length,
                        0
                      );
                      return (
                        <li key={gKey} className="roster-group">
                          <button
                            type="button"
                            className={`roster-toggle roster-toggle-group${groupOpened ? " is-open" : ""}`}
                            aria-expanded={groupOpened}
                            onClick={() => toggleInSet(setOpenGroups, gKey)}
                          >
                            <Chevron />
                            <span className="roster-toggle-name">{group.name}</span>
                            <span className="roster-count">{groupCount}</span>
                          </button>
                          {groupOpened && (
                            <ul className="relatives-cadets">
                              {group.cadets.map((cadet) => (
                                <li
                                  key={cadet.student_id}
                                  className="relatives-cadet"
                                >
                                  <div className="relatives-cadet-head">
                                    <Link
                                      to={`/students/${cadet.student_id}`}
                                      className="relatives-cadet-link"
                                    >
                                      {fullName(cadet)}
                                    </Link>
                                    <span className="roster-count">
                                      {cadet.relatives.length}
                                    </span>
                                  </div>
                                  <div className="table-wrap dark-table relatives-cadet-table">
                                    <table>
                                      <thead>
                                        <tr>
                                          <th>Степень</th>
                                          <th>ФИО</th>
                                          <th>Дата рожд.</th>
                                          <th>Телефон</th>
                                          <th>Дополнительно</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {cadet.relatives.map((r) => (
                                          <tr key={r.id}>
                                            <td>{r.relation}</td>
                                            <td>{r.full_name}</td>
                                            <td>{formatDate(r.birth_date)}</td>
                                            <td>{r.phone || "—"}</td>
                                            <td>{r.details || "—"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
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

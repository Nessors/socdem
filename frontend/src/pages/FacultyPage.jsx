import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import gerb from "../assets/gerb.png";
import { api, photoUrl } from "../api";
import FioSearchField from "../components/FioSearchField.jsx";
import PageLoader from "../components/PageLoader.jsx";
import { IdentityCells, IdentityHeaderCells } from "../components/PersonIdentity.jsx";
import { courseCodeFromGroup } from "../serviceTitle.js";
import { formatDate, fullName, personCategory, personSearchHay } from "../utils";

const COURSES = ["61", "62", "63", "64", "65"];

function asBool(v) {
  return v === true || v === "t" || v === "true";
}

function peopleLabel(n) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return `${n} человек`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${n} человека`;
  return `${n} человек`;
}

export default function FacultyPage() {
  const { course } = useParams();
  const [faculty, setFaculty] = useState([]);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.faculty(), api.groups(), api.students()])
      .then(([fac, gr, st]) => {
        setFaculty(fac);
        setGroups(gr);
        setStudents(st.filter((s) => personCategory(s) === "cadet"));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setQuery("");
  }, [course]);

  const byCourse = useMemo(() => {
    const map = new Map(COURSES.map((code) => [code, { groups: [], people: [] }]));
    for (const group of groups) {
      const code = courseCodeFromGroup(group.name);
      if (!map.has(code)) continue;
      map.get(code).groups.push(group);
    }
    for (const person of students) {
      const code = courseCodeFromGroup(person.group_name);
      if (!map.has(code)) continue;
      map.get(code).people.push(person);
    }
    for (const bucket of map.values()) {
      bucket.groups.sort((a, b) =>
        String(a.name).localeCompare(String(b.name), "ru", { numeric: true })
      );
      bucket.people.sort((a, b) => {
        const byGroup = String(a.group_name ?? "").localeCompare(
          String(b.group_name ?? ""),
          "ru",
          { numeric: true }
        );
        if (byGroup !== 0) return byGroup;
        return fullName(a).localeCompare(fullName(b), "ru");
      });
    }
    return map;
  }, [groups, students]);

  const selected = COURSES.includes(course) ? course : "";
  const bucket = selected ? byCourse.get(selected) : null;
  const rosterAll = bucket?.people ?? [];
  const roster = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rosterAll;
    return rosterAll.filter((s) => {
      const hay = `${personSearchHay(s)} ${s.group_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rosterAll, query]);

  if (loading) return <PageLoader label="Загрузка курсов…" />;

  const unknownCourse = Boolean(course) && !selected;

  return (
    <div className="faculty-page">
      {faculty.map((f) => (
        <section key={f.id} className="card">
          <article className="faculty-hero">
            <img
              className="faculty-gerb"
              src={gerb}
              alt=""
              width={148}
              height={177}
            />
            <div>
              <h3>{f.name}</h3>
              <p>{f.description}</p>
            </div>
          </article>
        </section>
      ))}

      <div className="groups-layout">
        <nav className="card group-picker" aria-label="Курсы факультета">
          <p className="section-caption">Выберите курс</p>
          {COURSES.map((code) => {
            const item = byCourse.get(code);
            const count = item.people.length;
            const names = item.groups.map((g) => g.name).join(", ");
            return (
              <NavLink
                key={code}
                to={`/faculty/${code}`}
                className={({ isActive }) =>
                  [
                    "group-pick",
                    isActive ? "is-active" : "",
                    count === 0 ? "is-empty" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
              >
                <span>
                  <span className="group-pick-name">{code} курс</span>
                  {names ? <span className="group-pick-meta">{names}</span> : null}
                </span>
                <span className="group-pick-count" title={peopleLabel(count)}>
                  {count}
                </span>
              </NavLink>
            );
          })}
        </nav>

        <section className="card panel table-panel" aria-live="polite">
          {!course ? (
            <div className="roster-empty">
              <p className="roster-empty-title">Личный состав курса</p>
              <p className="muted">
                Слева выберите курс — здесь появится весь личный состав его
                учебных групп.
              </p>
            </div>
          ) : unknownCourse ? (
            <div className="roster-empty">
              <p className="roster-empty-title">Курс не найден</p>
              <p className="muted">Выберите курс из списка слева.</p>
            </div>
          ) : (
            <>
              <div className="card-head list-head">
                <div>
                  <p className="section-caption">{selected} курс</p>
                  <p className="muted">
                    {peopleLabel(rosterAll.length)}
                    {bucket.groups.length
                      ? ` · ${bucket.groups.map((g) => g.name).join(", ")}`
                      : ""}
                  </p>
                </div>
                <FioSearchField
                  grow
                  placeholder="Поиск по ФИО, должности, званию, группе…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Поиск на курсе"
                />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>№</th>
                      <IdentityHeaderCells />
                      <th>ФИО</th>
                      <th>Фото</th>
                      <th>Группа</th>
                      <th>Телефон</th>
                      <th>Дата рождения</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((s, i) => (
                      <tr key={s.id}>
                        <td>{i + 1}</td>
                        <IdentityCells person={s} />
                        <td>
                          <Link to={`/students/${s.id}`} className="name-link">
                            {fullName(s)}
                          </Link>
                        </td>
                        <td className="thumb-cell">
                          {[1, 2].map((slot) =>
                            asBool(s[`has_photo_${slot}`]) ? (
                              <img
                                key={slot}
                                className="thumb"
                                src={photoUrl(s.id, slot)}
                                alt=""
                              />
                            ) : (
                              <span key={slot} className="thumb-empty" />
                            )
                          )}
                        </td>
                        <td>
                          {s.group_id ? (
                            <Link to={`/groups/${s.group_id}`}>{s.group_name}</Link>
                          ) : (
                            s.group_name || "—"
                          )}
                        </td>
                        <td>
                          <a href={`tel:${String(s.phone ?? "").replace(/\s/g, "")}`}>
                            {s.phone}
                          </a>
                        </td>
                        <td>{formatDate(s.birth_date)}</td>
                        <td className="row-actions">
                          <Link to={`/students/${s.id}`} className="btn btn-sm primary">
                            Карточка
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {roster.length === 0 && (
                <p className="empty">
                  {query.trim()
                    ? "Никого не найдено по запросу."
                    : "На этом курсе пока никого нет."}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

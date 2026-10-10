import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { api, photoUrl } from "../api";
import FioSearchField from "../components/FioSearchField.jsx";
import PageLoader from "../components/PageLoader.jsx";
import { IdentityCells, IdentityHeaderCells } from "../components/PersonIdentity.jsx";
import { formatDate, fullName, personCategory, personSearchHay } from "../utils";

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

export default function GroupsPage() {
  const { id } = useParams();
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.groups(), api.students()])
      .then(([gr, st]) => {
        setGroups(gr);
        setStudents(st.filter((s) => personCategory(s) === "cadet"));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setQuery("");
  }, [id]);

  const selected = useMemo(
    () => groups.find((g) => String(g.id) === String(id)) ?? null,
    [groups, id]
  );

  const countByGroup = useMemo(() => {
    const map = new Map();
    for (const s of students) {
      const key = Number(s.group_id);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [students]);

  const groupCount = (g) =>
    countByGroup.get(Number(g.id)) ?? Number(g.student_count ?? 0);

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const diff = groupCount(b) - groupCount(a);
      if (diff !== 0) return diff;
      return String(a.name).localeCompare(String(b.name), "ru", {
        numeric: true,
      });
    });
  }, [groups, countByGroup]);

  const sharedStream =
    groups.length > 0 && groups.every((g) => g.stream_title === groups[0].stream_title)
      ? groups[0].stream_title
      : null;

  const rosterAll = useMemo(() => {
    if (!selected) return [];
    return students.filter((s) => Number(s.group_id) === Number(selected.id));
  }, [students, selected]);

  const roster = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rosterAll;
    return rosterAll.filter((s) => personSearchHay(s).toLowerCase().includes(q));
  }, [rosterAll, query]);

  if (loading) return <PageLoader label="Загрузка групп…" />;

  const unknownId = Boolean(id) && !selected;

  return (
    <div className="groups-layout">
      <nav className="card group-picker" aria-label="Учебные группы">
        <p className="section-caption">Выберите группу</p>
        {sortedGroups.map((g) => {
          const count = groupCount(g);
          return (
            <NavLink
              key={g.id}
              to={`/groups/${g.id}`}
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
                <span className="group-pick-name">{g.name}</span>
                {!sharedStream && g.stream_title ? (
                  <span className="group-pick-meta">{g.stream_title}</span>
                ) : null}
              </span>
              <span className="group-pick-count" title={peopleLabel(count)}>
                {count}
              </span>
            </NavLink>
          );
        })}
        {groups.length === 0 && (
          <p className="muted">Группы ещё не заведены.</p>
        )}
      </nav>

      <section className="card panel table-panel" aria-live="polite">
        {!id ? (
          <div className="roster-empty">
            <p className="roster-empty-title">Состав группы</p>
            <p className="muted">
              Слева выберите учебную группу — здесь появится список тех, кто в
              ней обучается.
            </p>
          </div>
        ) : unknownId ? (
          <div className="roster-empty">
            <p className="roster-empty-title">Группа не найдена</p>
            <p className="muted">Выберите группу из списка слева.</p>
          </div>
        ) : (
          <>
            <div className="card-head list-head">
              <div>
                <p className="section-caption">Группа {selected.name}</p>
                <p className="muted">
                  {peopleLabel(rosterAll.length)}
                  {selected.stream_title ? ` · ${selected.stream_title}` : ""}
                </p>
              </div>
              <FioSearchField
                grow
                placeholder="Поиск по ФИО, должности, званию…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Поиск в группе"
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
                        <a href={`tel:${s.phone.replace(/\s/g, "")}`}>
                          {s.phone}
                        </a>
                      </td>
                      <td>{formatDate(s.birth_date)}</td>
                      <td className="row-actions">
                        <Link
                          to={`/students/${s.id}`}
                          className="btn btn-sm primary"
                        >
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
                  : "В этой группе пока никого нет."}
              </p>
            )}
            <Link to="/students" className="link-more">
              Весь личный состав →
            </Link>
          </>
        )}
      </section>
    </div>
  );
}

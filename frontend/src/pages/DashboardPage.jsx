import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import FioSearchField from "../components/FioSearchField.jsx";
import PageLoader from "../components/PageLoader.jsx";
import { IconCalendar, IconMourning, IconStatUser } from "../components/NavIcons.jsx";
import { SOCDEM_NAV_DEFAULT, SOCDEM_NAV_GROUPS } from "../profileConfig";
import {
  daysUntilBirthday,
  formatBirthdayDayMonth,
  fullName,
  personCategory,
  personSearchHay,
  toInputDate,
} from "../utils";

function birthdaysInMonth(people, monthIndex) {
  const month = monthIndex + 1;
  return people.filter((p) => {
    const iso = toInputDate(p.birth_date);
    if (!iso) return false;
    return Number(iso.slice(5, 7)) === month;
  }).length;
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [students, setStudents] = useState([]);
  const [mourningRows, setMourningRows] = useState([]);
  const [q, setQ] = useState("");
  const [jumpTarget, setJumpTarget] = useState(SOCDEM_NAV_DEFAULT);

  useEffect(() => {
    Promise.all([api.dashboard(), api.students(), api.mourning()]).then(([d, st, mourning]) => {
      setStats(d);
      setStudents(st);
      setMourningRows(mourning);
    });
  }, []);

  const deferredQ = useDeferredValue(q.trim());
  const roster = students.filter((s) => personCategory(s) === "cadet");
  const searching = Boolean(deferredQ);

  const filtered = useMemo(() => {
    if (!searching) return [];
    const needle = deferredQ.toLowerCase();
    return roster.filter((s) => {
      const hay = `${personSearchHay(s)} ${s.group_name ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [roster, searching, deferredQ]);

  const monthBirthdays = useMemo(
    () => birthdaysInMonth(roster, new Date().getMonth()),
    [roster]
  );

  const birthdaySpotlight = useMemo(() => {
    const today = new Date();
    const ranked = roster
      .map((p) => ({
        person: p,
        days: daysUntilBirthday(p.birth_date, today),
      }))
      .filter((row) => row.days !== null)
      .sort(
        (a, b) =>
          a.days - b.days || fullName(a.person).localeCompare(fullName(b.person), "ru")
      );
    const nearest = ranked[0];
    if (!nearest) return null;
    const todayList = ranked.filter((r) => r.days === 0);
    return { nearest, todayList };
  }, [roster]);
  const mourningTotal = mourningRows.length;

  const jumpLabel = useMemo(() => {
    for (const group of SOCDEM_NAV_GROUPS) {
      const hit = group.targets.find((t) => t.id === jumpTarget);
      if (hit) return hit.label;
    }
    return "раздел карточки";
  }, [jumpTarget]);

  if (!stats) return <PageLoader label="Сводка главной…" />;

  return (
    <div className="dashboard">
      <div className="stat-grid dash-stat-grid">
        <Link to="/birthdays" className="stat-card stat-card-link stat-card--birthdays">
          <IconCalendar className="stat-icon-svg" />
          {birthdaySpotlight ? (
            <>
              <p className="stat-spotlight-kicker">
                {birthdaySpotlight.todayList.length > 0
                  ? "Сегодня"
                  : birthdaySpotlight.nearest.days === 1
                    ? "Завтра"
                    : "Ближайший"}
              </p>
              <p className="stat-spotlight-name">
                {birthdaySpotlight.todayList.length > 0
                  ? fullName(birthdaySpotlight.todayList[0].person)
                  : fullName(birthdaySpotlight.nearest.person)}
              </p>
              <p className="stat-spotlight-meta">
                {birthdaySpotlight.todayList.length > 1
                  ? `и ещё ${birthdaySpotlight.todayList.length - 1} сегодня`
                  : birthdaySpotlight.todayList.length === 0
                    ? formatBirthdayDayMonth(birthdaySpotlight.nearest.person.birth_date)
                    : formatBirthdayDayMonth(birthdaySpotlight.todayList[0].person.birth_date)}
              </p>
            </>
          ) : (
            <p className="stat-spotlight-name stat-spotlight-name--empty">Нет дат</p>
          )}
          <p className="stat-label">Дни рождения</p>
          <p className="stat-hint">
            В этом месяце: <strong>{monthBirthdays}</strong>
          </p>
        </Link>
        <Link to="/students" className="stat-card stat-card-link">
          <IconStatUser className="stat-icon-svg" />
          <p className="stat-value">{stats.total}</p>
          <p className="stat-label">Личный состав</p>
          <p className="stat-hint">Курсанты по курсам и группам, карточки и добавление.</p>
        </Link>
        <Link to="/mourning" className="stat-card stat-card-link">
          <IconMourning className="stat-icon-svg" />
          <p className="stat-value">{mourningTotal}</p>
          <p className="stat-label">Печальные события</p>
          <p className="stat-hint">Утраты в семьях курсантов · даты и обстоятельства.</p>
        </Link>
      </div>

      <section className="panel dash-search-panel">
        <header className="dash-search-head">
          <div>
            <p className="section-caption">Главная</p>
            <h3>Умный поиск</h3>
            <p className="dash-search-lead muted">
              Введите фамилию, имя, телефон или группу — откроется карточка курсанта.
              Справа выберите раздел соцдема: умный поиск сразу перенесёт в нужный блок
              (семья, командиры, дисциплина и т.д.).
            </p>
          </div>
        </header>

        <div className="dash-search-toolbar">
          <FioSearchField
            className="dash-field-grow"
            grow
            wide
            label="Кого ищем"
            placeholder="Фамилия, имя, телефон, группа…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <label className="dash-field dash-field-target">
            <span className="dash-field-label">Куда перейти в карточке</span>
            <select
              className="dash-search-select"
              value={jumpTarget}
              onChange={(e) => setJumpTarget(e.target.value)}
              aria-label="Куда перейти в карточке"
            >
              {SOCDEM_NAV_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.targets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <div className="dash-search-results">
          {!searching ? (
            <p className="muted dash-search-idle">
              Начните ввод — ниже появятся совпадения. Переход откроет карточку в выбранном
              разделе («{jumpLabel}»).
            </p>
          ) : filtered.length === 0 ? (
            <p className="dash-hits-empty muted">Никого не найдено по этому запросу.</p>
          ) : (
            <>
              <p className="dash-results-meta">
                Найдено {filtered.length} {filtered.length === 1 ? "человек" : "чел."}
                <span className="muted"> · переход: «{jumpLabel}»</span>
              </p>
              <ul className="dash-hits" aria-label="Найденные люди">
                {filtered.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={`/students/${s.id}#${jumpTarget}`}
                      className="dash-hit"
                      title={`Открыть: ${jumpLabel}`}
                    >
                      <span className="dash-hit-name">
                        <strong className="dash-hit-surname">{s.last_name}</strong>
                        <span className="dash-hit-given">
                          {[s.first_name, s.patronymic].filter(Boolean).join(" ")}
                        </span>
                      </span>
                      <span className="dash-hit-meta muted">
                        {s.group_name || "—"}
                        {s.phone ? ` · ${s.phone}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

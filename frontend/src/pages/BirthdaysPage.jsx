import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import FioSearchField from "../components/FioSearchField.jsx";
import PageLoader from "../components/PageLoader.jsx";
import {
  daysUntilBirthday,
  formatBirthdayDayMonth,
  fullName,
  nextBirthdayOn,
  personCategory,
  personSearchHay,
  toInputDate,
} from "../utils";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function categoryLabel(category) {
  if (category === "officer") return "Офицер";
  if (category === "civilian") return "Сотрудник";
  return "Курсант";
}

function MonthChevron({ dir }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {dir === "prev" ? (
        <path
          d="M10 3 5 8l5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M6 3l5 5-5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export default function BirthdaysPage() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [q, setQ] = useState("");

  useEffect(() => {
    api
      .students()
      .then(setPeople)
      .finally(() => setLoading(false));
  }, []);

  const searchNeedle = q.trim().toLowerCase();

  const matchesSearch = (person) => {
    if (!searchNeedle) return true;
    const hay = `${personSearchHay(person)} ${person.group_name ?? ""}`.toLowerCase();
    return hay.includes(searchNeedle);
  };

  const withBirthday = useMemo(
    () => people.filter((p) => toInputDate(p.birth_date)),
    [people]
  );

  const byMonthDay = useMemo(() => {
    const map = new Map();
    for (const person of withBirthday) {
      const s = toInputDate(person.birth_date);
      const key = s.slice(5);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(person);
    }
    for (const list of map.values()) {
      list.sort((a, b) => fullName(a).localeCompare(fullName(b), "ru"));
    }
    return map;
  }, [withBirthday]);

  const upcoming = useMemo(() => {
    const today = new Date();
    return withBirthday
      .map((person) => ({
        person,
        next: nextBirthdayOn(person.birth_date, today),
        days: daysUntilBirthday(person.birth_date, today),
      }))
      .filter((row) => row.next && matchesSearch(row.person))
      .sort(
        (a, b) =>
          a.next - b.next || fullName(a.person).localeCompare(fullName(b.person), "ru")
      );
  }, [withBirthday, searchNeedle]);

  const monthGrid = useMemo(() => {
    const { year, month } = view;
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    const now = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const cellDate = new Date(year, month, day);
      const all = byMonthDay.get(key) ?? [];
      const people = (cellDate >= today ? all : []).filter(matchesSearch);
      const dow = cellDate.getDay();
      cells.push({
        day,
        key,
        people,
        isToday:
          year === now.getFullYear() && month === now.getMonth() && day === now.getDate(),
        isWeekend: dow === 0 || dow === 6,
      });
    }
    return cells;
  }, [view, byMonthDay, searchNeedle]);

  const shiftMonth = (delta) => {
    setView(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  if (loading) return <PageLoader label="Загрузка календаря…" />;

  return (
    <div className="birthdays-page">
      <section className="panel birthdays-panel">
        <header className="birthdays-head">
          <div className="birthdays-head-copy">
            <p className="section-caption">Календарь</p>
            <h3>Дни рождения</h3>
            <p className="muted birthdays-lead">
              Будущие дни рождения личного состава. Нажмите на фамилию — откроется карточка.
            </p>
          </div>
          <div className="birthdays-nav" aria-label="Выбор месяца">
            <button
              type="button"
              className="birthdays-nav-btn"
              onClick={() => shiftMonth(-1)}
              aria-label="Предыдущий месяц"
            >
              <MonthChevron dir="prev" />
            </button>
            <p className="birthdays-nav-title">
              {MONTH_NAMES[view.month]}
              <span>{view.year}</span>
            </p>
            <button
              type="button"
              className="birthdays-nav-btn"
              onClick={() => shiftMonth(1)}
              aria-label="Следующий месяц"
            >
              <MonthChevron dir="next" />
            </button>
          </div>
        </header>

        <div className="birthdays-search-row">
          <FioSearchField
            wide
            grow
            placeholder="Поиск по ФИО, группе…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="birthdays-calendar">
          <div className="birthdays-weekdays" aria-hidden="true">
            {WEEKDAYS.map((name, index) => (
              <span key={name} className={index >= 5 ? "is-weekend" : undefined}>
                {name}
              </span>
            ))}
          </div>
          <div
            className="birthdays-grid"
            role="grid"
            aria-label={`Календарь ${MONTH_NAMES[view.month]}`}
          >
            {monthGrid.map((cell, index) =>
              cell ? (
                <article
                  key={cell.key}
                  className={[
                    "birthdays-day",
                    cell.people.length ? "has-events" : "",
                    cell.isToday ? "is-today" : "",
                    cell.isWeekend ? "is-weekend" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="gridcell"
                >
                  <div className="birthdays-day-top">
                    <span className="birthdays-day-num">{cell.day}</span>
                    {cell.people.length > 0 ? (
                      <span className="birthdays-day-count">{cell.people.length}</span>
                    ) : null}
                  </div>
                  {cell.people.length > 0 && (
                    <ul className="birthdays-day-list">
                      {cell.people.slice(0, 3).map((person) => (
                        <li key={person.id}>
                          <Link to={`/students/${person.id}`} className="birthdays-person">
                            <span className="birthdays-person-name">{person.last_name}</span>
                            <span className="birthdays-person-role">
                              {categoryLabel(personCategory(person))}
                            </span>
                          </Link>
                        </li>
                      ))}
                      {cell.people.length > 3 ? (
                        <li className="birthdays-day-more muted">+{cell.people.length - 3} ещё</li>
                      ) : null}
                    </ul>
                  )}
                </article>
              ) : (
                <div key={`empty-${index}`} className="birthdays-day is-pad" aria-hidden="true" />
              )
            )}
          </div>
        </div>
      </section>

      <section className="panel birthdays-upcoming">
        <header className="birthdays-upcoming-head">
          <h3>Ближайшие дни рождения</h3>
          <p className="muted">От сегодня и дальше по календарю</p>
        </header>
        {upcoming.length === 0 ? (
          <p className="muted">В базе пока нет дат рождения.</p>
        ) : (
          <ul className="birthdays-upcoming-list">
            {upcoming.map(({ person, days }) => (
              <li key={person.id}>
                <Link to={`/students/${person.id}`} className="birthdays-upcoming-row">
                  <span className="birthdays-upcoming-date">
                    <strong>{formatBirthdayDayMonth(person.birth_date)}</strong>
                    <em>
                      {days === 0
                        ? "сегодня"
                        : days === 1
                          ? "завтра"
                          : `через ${days} дн.`}
                    </em>
                  </span>
                  <span className="birthdays-upcoming-main">
                    <span className="birthdays-upcoming-name">{fullName(person)}</span>
                    <span className="birthdays-upcoming-meta">
                      {person.group_name || categoryLabel(personCategory(person))}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

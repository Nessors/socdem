import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { IdentityLine } from "../components/PersonIdentity.jsx";
import { formatDate, fullName, personSearchHay } from "../utils";

const KINDS = [
  {
    id: "commendation",
    label: "Благодарность",
    hint: "Поощрение",
  },
  {
    id: "reprimand",
    label: "Выговор",
    hint: "Взыскание",
  },
  {
    id: "severe_reprimand",
    label: "Строгий выговор",
    hint: "Взыскание",
  },
];

const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.id, k.label]));

function isPenalty(kind) {
  return kind === "reprimand" || kind === "severe_reprimand";
}

function isOpenPenalty(row) {
  return isPenalty(row.kind) && !row.closed_at;
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function recordsWord(n) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "запись";
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return "записи";
  return "записей";
}

export default function DisciplinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("student") || "";

  const [students, setStudents] = useState([]);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [reason, setReason] = useState("");
  const [issuedAt, setIssuedAt] = useState(todayInput);
  const [closeOn, setCloseOn] = useState(true);
  const [closeId, setCloseId] = useState("latest");
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    return Promise.all([api.students(), api.discipline()]).then(([st, disc]) => {
      setStudents(st);
      setRows(disc);
    });
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const selected = useMemo(
    () => students.find((s) => String(s.id) === String(selectedId)) ?? null,
    [students, selectedId]
  );

  const openPenalties = useMemo(() => {
    if (!selected) return [];
    return rows
      .filter((r) => r.student_id === selected.id && isOpenPenalty(r))
      .sort((a, b) => String(b.issued_at).localeCompare(String(a.issued_at)));
  }, [rows, selected]);

  useEffect(() => {
    if (openPenalties[0]) setCloseId("latest");
  }, [selectedId, openPenalties.length]);

  useEffect(() => {
    if (selected) {
      setQuery((q) => q || fullName(selected));
    }
  }, [selected]);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter((s) => {
        const hay = `${personSearchHay(s)} ${s.group_name ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [students, query]);

  const journal = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "open") return isOpenPenalty(r);
      if (filter === "lifted") return isPenalty(r.kind) && r.closed_at;
      if (filter === "commendation") return r.kind === "commendation";
      if (filter === "penalty") return isPenalty(r.kind);
      return true;
    });
  }, [rows, filter]);

  const selectStudent = (s) => {
    setSearchParams({ student: String(s.id) });
    setQuery(fullName(s));
    setError("");
  };

  const handleKind = (id) => {
    setKind((cur) => (cur === id ? "" : id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selected) {
      setError("Найдите и выберите курсанта.");
      return;
    }
    if (!kind) {
      setError("Отметьте меру: благодарность, выговор или строгий выговор.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        student_id: selected.id,
        kind,
        issued_at: issuedAt || todayInput(),
        reason,
      };
      if (kind === "commendation" && closeOn && openPenalties.length) {
        body.close_penalty_id = closeId === "latest" ? "latest" : Number(closeId);
      }
      await api.createDiscipline(body);
      setReason("");
      setKind("");
      setIssuedAt(todayInput());
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    const label = KIND_LABEL[row.kind] ?? row.kind;
    if (!confirm(`Удалить запись «${label}» от ${formatDate(row.issued_at)}?`)) {
      return;
    }
    await api.deleteDiscipline(row.id);
    await reload();
  };

  if (loading) return <p className="muted">Загрузка учёта…</p>;

  return (
    <div className="disc-page">
      <section className="card disc-entry">
        <p className="section-caption">Внести меру</p>
        <p className="muted">
          Найдите курсанта, отметьте галочкой меру и сохраните. Благодарностью
          можно снять ранее наложенный выговор или строгий выговор.
        </p>

        <label className="disc-search-label">
          Поиск по ФИО или группе
          <input
            type="search"
            className="search-wide"
            placeholder="Начните вводить фамилию…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </label>

        <ul className="disc-hits" role="listbox" aria-label="Найденные курсанты">
          {found.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={
                  selected?.id === s.id ? "disc-hit is-active" : "disc-hit"
                }
                onClick={() => selectStudent(s)}
              >
                <span className="disc-hit-main">
                  <IdentityLine person={s} />
                  <span className="disc-hit-name">{fullName(s)}</span>
                </span>
                <span className="muted">{s.group_name}</span>
              </button>
            </li>
          ))}
        </ul>
        {query.trim() && found.length === 0 && (
          <p className="muted">Никого не найдено.</p>
        )}

        {selected && (
          <form className="disc-form" onSubmit={handleSubmit}>
            <p className="disc-selected">
              Выбран:{" "}
              <IdentityLine person={selected} />
              <Link to={`/students/${selected.id}`} className="name-link">
                {fullName(selected)}
              </Link>
              <span className="muted"> · группа {selected.group_name}</span>
            </p>

            {openPenalties.length > 0 && (
              <p className="disc-open-note">
                Действующие взыскания:{" "}
                {openPenalties
                  .map(
                    (p) =>
                      `${KIND_LABEL[p.kind]} от ${formatDate(p.issued_at)}`
                  )
                  .join("; ")}
              </p>
            )}

            <fieldset className="disc-kinds">
              <legend>Мера</legend>
              {KINDS.map((k) => (
                <label
                  key={k.id}
                  className={`disc-kind disc-kind-${k.id}${
                    kind === k.id ? " is-on" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={kind === k.id}
                    onChange={() => handleKind(k.id)}
                  />
                  <span>
                    <strong>{k.label}</strong>
                    <span className="muted"> {k.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {kind === "commendation" && openPenalties.length > 0 && (
              <div className="disc-close-box">
                <label className="disc-kind is-on">
                  <input
                    type="checkbox"
                    checked={closeOn}
                    onChange={(e) => setCloseOn(e.target.checked)}
                  />
                  <span>
                    <strong>Снять ранее наложенное взыскание</strong>
                  </span>
                </label>
                {closeOn && (
                  <label>
                    Какое взыскание снять
                    <select
                      value={closeId}
                      onChange={(e) => setCloseId(e.target.value)}
                    >
                      <option value="latest">Последнее действующее</option>
                      {openPenalties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {KIND_LABEL[p.kind]} от {formatDate(p.issued_at)}
                          {p.reason ? ` — ${p.reason}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            <div className="form-grid">
              <label>
                Дата
                <input
                  type="date"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                  required
                />
              </label>
              <label>
                Основание (необязательно)
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Приказ, проступок, достижение…"
                />
              </label>
            </div>

            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? "Сохранение…" : "Внести в учёт"}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="panel table-panel">
        <div className="card-head">
          <p className="section-caption">
            Журнал · {journal.length} {recordsWord(journal.length)}
          </p>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Фильтр журнала"
          >
            <option value="all">Все меры</option>
            <option value="open">Действующие взыскания</option>
            <option value="lifted">Снятые взыскания</option>
            <option value="penalty">Все взыскания</option>
            <option value="commendation">Благодарности</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Курсант</th>
                <th>Группа</th>
                <th>Мера</th>
                <th>Статус</th>
                <th>Основание</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {journal.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.issued_at)}</td>
                  <td>
                    <Link to={`/students/${r.student_id}`} className="name-link">
                      {fullName(r)}
                    </Link>
                  </td>
                  <td>
                    <Link to={`/groups/${r.group_id}`}>{r.group_name}</Link>
                  </td>
                  <td>
                    <span className={`disc-badge disc-badge-${r.kind}`}>
                      {KIND_LABEL[r.kind]}
                    </span>
                  </td>
                  <td>
                    {isPenalty(r.kind) ? (
                      r.closed_at ? (
                        <span className="muted">
                          Снят {formatDate(r.closed_at || r.lifted_at)}
                        </span>
                      ) : (
                        <span className="disc-status-open">Действует</span>
                      )
                    ) : r.closes_id ? (
                      <span className="muted">
                        Снял {KIND_LABEL[r.closed_kind] ?? "взыскание"}
                        {r.closed_issued_at
                          ? ` от ${formatDate(r.closed_issued_at)}`
                          : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{r.reason || "—"}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="btn btn-sm danger"
                      onClick={() => handleDelete(r)}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {journal.length === 0 && (
          <p className="empty">Пока нет записей в этом фильтре.</p>
        )}
      </section>
    </div>
  );
}

export { KIND_LABEL, isOpenPenalty, isPenalty };

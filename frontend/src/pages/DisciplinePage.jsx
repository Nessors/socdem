import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import FioSearchField from "../components/FioSearchField.jsx";
import PageLoader from "../components/PageLoader.jsx";
import { IdentityLine } from "../components/PersonIdentity.jsx";
import {
  DISCIPLINE_AUTHORITIES,
  authoritiesAllowedToLiftPenalty,
  canLiftPenaltyWithCommendation,
  disciplineAuthorityLabel,
  liftPenaltyRuleHint,
} from "../../../disciplineAuthorities.js";
import { formatDate, fullName, personCategory, personSearchHay } from "../utils";

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

function clampIssuedDate(value) {
  const today = todayInput();
  if (!value) return today;
  return value > today ? today : value;
}

function recordsWord(n) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "запись";
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return "записи";
  return "записей";
}

export default function DisciplinePage() {
  const ask = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("student") || "";

  const [students, setStudents] = useState([]);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [reason, setReason] = useState("");
  const [imposedBy, setImposedBy] = useState("");
  const [issuedAt, setIssuedAt] = useState(todayInput);
  const [closeOn, setCloseOn] = useState(false);
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

  const liftableOpenPenalties = useMemo(
    () => openPenalties.filter((p) => p.imposed_by),
    [openPenalties]
  );

  const penaltyToClose = useMemo(() => {
    if (kind !== "commendation" || !closeOn || liftableOpenPenalties.length === 0) {
      return null;
    }
    if (closeId === "latest") return liftableOpenPenalties[0];
    return (
      liftableOpenPenalties.find((p) => String(p.id) === String(closeId)) ??
      liftableOpenPenalties[0]
    );
  }, [kind, closeOn, closeId, liftableOpenPenalties]);

  const authorityOptions = useMemo(() => {
    if (!kind) return [];
    if (isPenalty(kind)) return DISCIPLINE_AUTHORITIES;
    if (kind === "commendation" && closeOn && penaltyToClose?.imposed_by) {
      const allowed = new Set(authoritiesAllowedToLiftPenalty(penaltyToClose.imposed_by));
      return DISCIPLINE_AUTHORITIES.filter((a) => allowed.has(a.id));
    }
    return DISCIPLINE_AUTHORITIES;
  }, [kind, closeOn, penaltyToClose]);

  useEffect(() => {
    if (liftableOpenPenalties[0]) setCloseId("latest");
    else if (closeOn && liftableOpenPenalties.length === 0) setCloseOn(false);
  }, [selectedId, liftableOpenPenalties.length, closeOn]);

  useEffect(() => {
    if (!imposedBy) return;
    if (!authorityOptions.some((a) => a.id === imposedBy)) {
      setImposedBy("");
    }
  }, [authorityOptions, imposedBy]);

  useEffect(() => {
    if (!selectedId) {
      setQuery("");
      return;
    }
    if (selected) {
      setQuery((q) => (q.trim() ? q : fullName(selected)));
    }
  }, [selectedId, selected]);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter((s) => {
        if (personCategory(s) !== "cadet") return false;
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

  const clearStudentSelection = () => {
    setSearchParams({});
    setQuery("");
    setKind("");
    setReason("");
    setIssuedAt(todayInput());
    setCloseOn(false);
    setImposedBy("");
    setError("");
  };

  const handleKind = (id) => {
    setKind((cur) => {
      const next = cur === id ? "" : id;
      if (next && isPenalty(next)) {
        setIssuedAt((d) => (d > todayInput() ? todayInput() : d));
      }
      return next;
    });
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
    if (!imposedBy) {
      setError(
        kind === "commendation"
          ? "Укажите, кем объявлена благодарность."
          : "Укажите, кем наложено взыскание."
      );
      return;
    }
    const today = todayInput();
    if (!issuedAt) {
      setError("Укажите дату.");
      return;
    }
    if (issuedAt > today) {
      setError(
        isPenalty(kind)
          ? "Выговор нельзя внести заранее — только сегодня или раньше."
          : "Дата не может быть в будущем."
      );
      return;
    }
    if (kind === "commendation" && closeOn && penaltyToClose) {
      if (!penaltyToClose.imposed_by) {
        setError(liftPenaltyRuleHint(null));
        return;
      }
      if (!canLiftPenaltyWithCommendation(imposedBy, penaltyToClose.imposed_by)) {
        setError(liftPenaltyRuleHint(penaltyToClose.imposed_by));
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        student_id: selected.id,
        kind,
        issued_at: issuedAt || todayInput(),
        reason,
        imposed_by: imposedBy,
      };
      if (kind === "commendation" && closeOn && penaltyToClose) {
        body.close_penalty_id = penaltyToClose.id;
      }
      await api.createDiscipline(body);
      clearStudentSelection();
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    const label = KIND_LABEL[row.kind] ?? row.kind;
    const ok = await ask({
      title: "Удалить запись?",
      message: `Запись «${label}» от ${formatDate(row.issued_at)} будет удалена из учёта.`,
    });
    if (!ok) return;
    await api.deleteDiscipline(row.id);
    await reload();
  };

  if (loading) return <PageLoader label="Загрузка учёта…" />;

  return (
    <div className="disc-page">
      <section className="card disc-entry">
        <p className="section-caption">Внести меру</p>
        <p className="muted">
          Найдите курсанта, отметьте галочкой меру и сохраните. Благодарностью
          можно снять ранее наложенный выговор или строгий выговор.
        </p>

        <FioSearchField
          wide
          label="Поиск по ФИО или группе"
          placeholder="Фамилия, имя, группа…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

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
          <form className="disc-form" onSubmit={handleSubmit} noValidate>
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
                  .map((p) => {
                    const by = disciplineAuthorityLabel(p.imposed_by);
                    return `${KIND_LABEL[p.kind]} от ${formatDate(p.issued_at)}${
                      by ? ` (${by})` : ""
                    }`;
                  })
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

            {kind ? (
              <label className="disc-imposed-by disc-imposed-by--primary">
                {kind === "commendation" ? "Кем объявлена *" : "Кем наложено *"}
                {imposedBy ? (
                  <p className="disc-imposed-preview">
                    Запишется: {disciplineAuthorityLabel(imposedBy)}
                  </p>
                ) : (
                  <p className="disc-imposed-by-hint muted">
                    {isPenalty(kind)
                      ? "Обязательно выберите должность — она попадёт в журнал."
                      : "Выберите, кем объявлена благодарность."}
                  </p>
                )}
                <select
                  value={imposedBy}
                  onChange={(e) => setImposedBy(e.target.value)}
                  required
                >
                  <option value="">— выберите должность —</option>
                  {authorityOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {kind === "commendation" &&
            openPenalties.length > 0 &&
            liftableOpenPenalties.length === 0 ? (
              <p className="form-error disc-close-warn">
                Действующие выговоры без должности «кем наложено» — снять их благодарностью
                нельзя. Удалите их в журнале и внесите заново с должностью. Обычную
                благодарность можно внести ниже.
              </p>
            ) : null}

            {kind === "commendation" && liftableOpenPenalties.length > 0 && (
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
                      value={
                        liftableOpenPenalties.some((p) => String(p.id) === String(closeId))
                          ? closeId
                          : "latest"
                      }
                      onChange={(e) => setCloseId(e.target.value)}
                    >
                      <option value="latest">Последнее (с указанной должностью)</option>
                      {liftableOpenPenalties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {KIND_LABEL[p.kind]} от {formatDate(p.issued_at)}
                          {` · ${disciplineAuthorityLabel(p.imposed_by)}`}
                          {p.reason ? ` — ${p.reason}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            {kind === "commendation" && closeOn && penaltyToClose?.imposed_by ? (
              <p className="disc-imposed-by-hint muted disc-lift-hint">
                {liftPenaltyRuleHint(penaltyToClose.imposed_by)}
              </p>
            ) : null}

            <div className="form-grid">
              <div className="disc-date-block">
                <label>
                  Дата
                  <input
                    type="date"
                    value={issuedAt}
                    onChange={(e) => setIssuedAt(clampIssuedDate(e.target.value))}
                    aria-describedby={
                      isPenalty(kind) ? "disc-date-penalty-note" : undefined
                    }
                  />
                </label>
                {isPenalty(kind) ? (
                  <p className="field-callout" id="disc-date-penalty-note" role="note">
                    <span className="field-callout-icon" aria-hidden="true">
                      i
                    </span>
                    <span>
                      Выговор вносится на дату факта или раньше. Запланировать на
                      будущее нельзя — при выборе более поздней даты подставится
                      сегодня ({formatDate(todayInput())}).
                    </span>
                  </p>
                ) : null}
              </div>
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
                <th>Кем наложено / объявлено</th>
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
                      disciplineAuthorityLabel(r.imposed_by) || (
                        <span className="disc-missing-authority">не указано</span>
                      )
                    ) : (
                      disciplineAuthorityLabel(r.imposed_by) || "—"
                    )}
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
                        Сняло {KIND_LABEL[r.closed_kind] ?? "взыскание"}
                        {r.closed_issued_at
                          ? ` от ${formatDate(r.closed_issued_at)}`
                          : ""}
                        {r.closed_penalty_imposed_by ? (
                          <>
                            {" "}
                            (наложено:{" "}
                            {disciplineAuthorityLabel(r.closed_penalty_imposed_by)})
                          </>
                        ) : null}
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

import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { validateStudentPayload } from "../../../socdemValidation.js";
import { api, exportDocxUrl } from "../api";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { IdentityLine } from "../components/PersonIdentity.jsx";
import PageLoader from "../components/PageLoader.jsx";
import PhotoSlots from "../components/PhotoSlots.jsx";
import RecordSection from "../components/RecordSection.jsx";
import {
  CAREER_FIELDS,
  COMMANDER_FIELDS,
  MOURNING_FIELDS,
  PROFILE_FIELDS,
  RELATIVE_FIELDS,
  careerSummary,
  commanderSummary,
  mourningSummary,
  relativeSummary,
} from "../profileConfig";
import { formatDuty, formatRank } from "../serviceTitle.js";
import { disciplineAuthorityLabel } from "../../../disciplineAuthorities.js";
import { formatDate, personCategory, personnelListPath, toInputDate } from "../utils";

function buildForm(s) {
  const form = {
    last_name: s.last_name ?? "",
    first_name: s.first_name ?? "",
    patronymic: s.patronymic ?? "",
    phone: s.phone ?? "",
    birth_date: toInputDate(s.birth_date),
    group_id: String(s.group_id ?? ""),
  };
  for (const f of PROFILE_FIELDS) {
    form[f.key] = s[f.key] ?? "";
  }
  return form;
}

function displayName(s) {
  return [s.last_name?.toUpperCase(), s.first_name, s.patronymic]
    .filter(Boolean)
    .join(" ");
}

export default function StudentCardPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const ask = useConfirm();
  const [data, setData] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    const d = await api.student(id);
    setData(d);
    return d;
  }, [id]);

  useEffect(() => {
    setData(null);
    setEditing(false);
    Promise.all([load(), api.groups().then(setGroups)]).catch((e) =>
      setLoadError(e.message)
    );
  }, [load]);

  useEffect(() => {
    if (!data || editing) return;
    const anchor = location.hash.replace(/^#/, "");
    if (!anchor) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(anchor);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("socdem-jump-highlight");
      window.setTimeout(() => el.classList.remove("socdem-jump-highlight"), 2400);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [data, editing, location.hash]);

  if (loadError) {
    return (
      <section className="card">
        <p className="form-error">{loadError}</p>
        <Link to="/students">← К списку</Link>
      </section>
    );
  }
  if (!data) return <PageLoader label="Загрузка карточки…" />;

  const startEdit = () => {
    setForm(buildForm(data));
    setFormError("");
    setEditing(true);
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const payload = { ...form };
      if (personCategory(data) === "cadet") payload.group_id = Number(form.group_id);
      else delete payload.group_id;
      delete payload.housing;
      const validationError = validateStudentPayload(payload);
      if (validationError) {
        setFormError(validationError);
        return;
      }
      await api.updateStudent(id, payload);
      await load();
      setEditing(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeStudent = async () => {
    const ok = await ask({
      title: "Удалить человека?",
      message: `Карточка «${displayName(data)}» будет удалена из базы вместе с фото и связанными записями.`,
    });
    if (!ok) return;
    await api.deleteStudent(id);
    navigate(personnelListPath(personCategory(data)));
  };

  const handleDocxImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (
      !confirm(
        "Загрузить данные из .docx в эту карточку?\n\nТекстовые поля обновятся из файла. Списки (семья, командиры, работа, печальные события) заменятся только если они есть в документе. Фото — если приложены в Word."
      )
    ) {
      return;
    }
    setImporting(true);
    setImportMsg("");
    try {
      const result = await api.importStudentDocx(id, file);
      await load();
      const s = result.stats ?? {};
      setImportMsg(
        `Импорт выполнен: полей — ${s.profileFields ?? 0}, родственников — ${s.relatives ?? 0}, ` +
          `командиров — ${s.commanders ?? 0}, работа — ${s.career ?? 0}, печальные — ${s.mourning ?? 0}, фото — ${s.photos ?? 0}.` +
          (result.warnings?.length ? ` ${result.warnings.join(" ")}` : "")
      );
    } catch (err) {
      setImportMsg(err.message);
    } finally {
      setImporting(false);
    }
  };

  const category = personCategory(data);
  return (
    <section className="card student-card">
      <div className="card-head">
        <div>
          <IdentityLine person={data} />
          <h2>{displayName(data)}</h2>
          {category === "cadet" ? (
            <p className="muted" id="socdem-field-group">
              Группа{" "}
              {data.group_id ? (
                <Link to={`/groups/${data.group_id}`}>{data.group_name}</Link>
              ) : (
                data.group_name || "—"
              )}
            </p>
          ) : null}
        </div>
        <div className="form-actions">
          {!editing && (
            <button type="button" className="btn primary" onClick={startEdit}>
              Редактировать
            </button>
          )}
          <a className="btn" href={exportDocxUrl(id)} download>
            Скачать соцдем (.docx)
          </a>
          <label className="btn btn-file">
            {importing ? "Импорт…" : "Загрузить из .docx"}
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              hidden
              disabled={importing}
              onChange={handleDocxImport}
            />
          </label>
          <button type="button" className="btn danger" onClick={removeStudent}>
            Удалить
          </button>
        </div>
      </div>

      {importMsg && <p className="import-msg">{importMsg}</p>}
      {formError && <p className="form-error">{formError}</p>}

      {editing ? (
        <form className="student-form" onSubmit={save}>
          <div className="form-grid">
            <label>
              Фамилия *
              <input required value={form.last_name} onChange={set("last_name")} />
            </label>
            <label>
              Имя *
              <input required value={form.first_name} onChange={set("first_name")} />
            </label>
            <label>
              Отчество
              <input value={form.patronymic} onChange={set("patronymic")} />
            </label>
            <label>
              Дата рождения *
              <input
                type="date"
                required
                value={form.birth_date}
                onChange={set("birth_date")}
              />
            </label>
            <label>
              Номер телефона *
              <input required value={form.phone} onChange={set("phone")} />
            </label>
            {category === "cadet" ? (
              <label>
                Группа *
                <select required value={form.group_id} onChange={set("group_id")}>
                  <option value="">— выберите —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {PROFILE_FIELDS.map((f) => (
              <label key={f.key} className={f.wide ? "wide" : undefined}>
                {f.label}
                <input value={form[f.key]} onChange={set(f.key)} />
              </label>
            ))}
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Сохранение…" : "Сохранить изменения"}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <dl className="profile-list">
          <div id="socdem-field-identity">
            <dt>Ф.И.О.</dt>
            <dd>{displayName(data)}</dd>
          </div>
          <div id="socdem-field-birth_date">
            <dt>Дата рождения</dt>
            <dd>{formatDate(data.birth_date)}</dd>
          </div>
          <div id="socdem-field-phone">
            <dt>Номер телефона</dt>
            <dd>{data.phone || "—"}</dd>
          </div>
          {PROFILE_FIELDS.map((f) => (
            <div key={f.key} id={`socdem-field-${f.key}`}>
              <dt>{f.label}</dt>
              <dd>
                {f.key === "position"
                  ? formatDuty(data) || "—"
                  : f.key === "military_rank"
                    ? formatRank(data) || "—"
                    : data[f.key] || "—"}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <RecordSection
        title="Семья (отец, мать, братья, сёстры)"
        kind="relatives"
        studentId={id}
        items={data.relatives}
        fields={RELATIVE_FIELDS}
        summary={relativeSummary}
        onChanged={load}
        addLabel="Добавить родственника"
        sectionId="socdem-section-relatives"
      />

      <RecordSection
        title="Данные на командиров"
        kind="commanders"
        studentId={id}
        items={data.commanders}
        fields={COMMANDER_FIELDS}
        summary={commanderSummary}
        onChanged={load}
        addLabel="Добавить командира"
        sectionId="socdem-section-commanders"
      />

      <RecordSection
        title="Работа в прошлом"
        kind="career"
        studentId={id}
        items={data.career}
        fields={CAREER_FIELDS}
        summary={careerSummary}
        onChanged={load}
        addLabel="Добавить период"
        sectionId="socdem-section-career"
      />

      <RecordSection
        title="Печальные события"
        kind="mourning"
        studentId={id}
        items={data.mourning ?? []}
        fields={MOURNING_FIELDS}
        summary={mourningSummary}
        onChanged={load}
        addLabel="Добавить событие"
        sectionClassName="mourning-section"
        sectionId="socdem-section-mourning"
      />

      <section className="card-section" id="socdem-section-discipline">
        <div className="card-section-head">
          <h3>Дисциплинарная практика</h3>
          <Link to={`/discipline?student=${data.id}`} className="btn btn-sm">
            Учёт мер
          </Link>
        </div>
        {(data.discipline ?? []).length === 0 ? (
          <p className="muted">Записей нет.</p>
        ) : (
          <ul className="record-list">
            {(data.discipline ?? []).map((d) => (
              <li key={d.id} className="record">
                <p>
                  {formatDate(d.issued_at)} ·{" "}
                  {d.kind === "commendation"
                    ? "Благодарность"
                    : d.kind === "severe_reprimand"
                      ? "Строгий выговор"
                      : "Выговор"}
                  {d.kind !== "commendation" && d.closed_at
                    ? ` · снят ${formatDate(d.closed_at)}`
                    : d.kind !== "commendation"
                      ? " · действует"
                      : ""}
                  {d.imposed_by ? ` · ${disciplineAuthorityLabel(d.imposed_by)}` : ""}
                  {d.reason ? ` · ${d.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-section" id="socdem-section-photos">
        <div className="card-section-head">
          <h3>Цветное фото</h3>
        </div>
        <PhotoSlots
          studentId={data.id}
          hasPhoto1={!!data.has_photo_1}
          hasPhoto2={!!data.has_photo_2}
          onUploaded={load}
        />
      </section>
    </section>
  );
}

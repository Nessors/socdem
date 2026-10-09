import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, exportDocxUrl } from "../api";
import HousingPicker from "../components/HousingPicker.jsx";
import { IdentityLine } from "../components/PersonIdentity.jsx";
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
import { formatDate, toInputDate } from "../utils";

function buildForm(s) {
  const form = {
    last_name: s.last_name ?? "",
    first_name: s.first_name ?? "",
    patronymic: s.patronymic ?? "",
    phone: s.phone ?? "",
    birth_date: toInputDate(s.birth_date),
    group_id: String(s.group_id ?? ""),
    housing: s.housing ?? "",
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
  const navigate = useNavigate();
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

  if (loadError) {
    return (
      <section className="card">
        <p className="form-error">{loadError}</p>
        <Link to="/students">← К списку</Link>
      </section>
    );
  }
  if (!data) return <p className="muted">Загрузка карточки…</p>;

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
      await api.updateStudent(id, { ...form, group_id: Number(form.group_id) });
      await load();
      setEditing(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeStudent = async () => {
    if (!confirm("Удалить человека и все его данные из базы?")) return;
    await api.deleteStudent(id);
    navigate("/students");
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

  return (
    <section className="card student-card">
      <div className="card-head">
        <div>
          <Link to="/students" className="back-link">
            ← К списку студентов
          </Link>
          <IdentityLine person={data} />
          <h2>{displayName(data)}</h2>
          <p className="muted">
            Группа{" "}
            {data.group_id ? (
              <Link to={`/groups/${data.group_id}`}>{data.group_name}</Link>
            ) : (
              data.group_name
            )}
          </p>
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
            <div className="wide housing-field">
              <p className="housing-field-label">Проживание</p>
              <HousingPicker
                name="housing-card-edit"
                value={form.housing}
                onChange={(housing) => setForm((f) => ({ ...f, housing }))}
              />
            </div>
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
          <div>
            <dt>Ф.И.О.</dt>
            <dd>{displayName(data)}</dd>
          </div>
          <div>
            <dt>Дата рождения</dt>
            <dd>{formatDate(data.birth_date)}</dd>
          </div>
          <div>
            <dt>Номер телефона</dt>
            <dd>{data.phone || "—"}</dd>
          </div>
          <div className="housing-profile">
            <dt>Проживание</dt>
            <dd>
              <HousingPicker
                name={`housing-card-${data.id}`}
                value={data.housing || ""}
                onChange={async (housing) => {
                  setFormError("");
                  try {
                    await api.updateStudent(id, { housing });
                    await load();
                  } catch (err) {
                    setFormError(err.message);
                  }
                }}
              />
            </dd>
          </div>
          {PROFILE_FIELDS.map((f) => (
            <div key={f.key}>
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
      />

      <section className="card-section">
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
                  {d.reason ? ` · ${d.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-section">
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

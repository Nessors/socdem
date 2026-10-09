import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, photoUrl } from "../api";
import DocxBatchImport from "../components/DocxBatchImport.jsx";
import PhotoSlots from "../components/PhotoSlots.jsx";
import HousingPicker from "../components/HousingPicker.jsx";
import { IdentityCells, IdentityHeaderCells } from "../components/PersonIdentity.jsx";
import { formatDate, fullName, parseStudentsCsv, personSearchHay, toInputDate } from "../utils";

function asBool(v) {
  return v === true || v === "t" || v === "true";
}

const emptyForm = {
  last_name: "",
  first_name: "",
  patronymic: "",
  phone: "",
  birth_date: "",
  group_id: "",
  housing: "",
};

function StudentForm({ groups, initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial ?? emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(initial ?? emptyForm);
    setError("");
  }, [initial]);

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        ...form,
        group_id: Number(form.group_id),
      });
      if (!initial) setForm(emptyForm);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="student-form" onSubmit={handleSubmit}>
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
          Телефон *
          <input required value={form.phone} onChange={set("phone")} />
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
            name={initial ? "housing-edit" : "housing-new"}
            value={form.housing}
            onChange={(housing) => setForm((f) => ({ ...f, housing }))}
          />
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Сохранение…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [importMsg, setImportMsg] = useState("");
  const [listError, setListError] = useState("");
  const [draftPhotos, setDraftPhotos] = useState({ 1: null, 2: null });
  const [thumbVer, setThumbVer] = useState(0);

  const reload = useCallback(() => {
    return api.students().then(setStudents);
  }, []);

  useEffect(() => {
    Promise.all([api.students(), api.groups()])
      .then(([st, gr]) => {
        setStudents(st);
        setGroups(gr);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = students.filter((s) => {
    const hay = personSearchHay(s).toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  const syncPhotosMeta = useCallback(async () => {
    const list = await api.students();
    setStudents(list);
    setThumbVer((v) => v + 1);
    setEditing((cur) =>
      cur ? list.find((s) => s.id === cur.id) ?? cur : null
    );
  }, []);

  const handleCreate = async (body) => {
    const created = await api.createStudent(body);
    for (const slot of [1, 2]) {
      if (draftPhotos[slot]) {
        await api.uploadPhoto(created.id, slot, draftPhotos[slot]);
      }
    }
    setDraftPhotos({ 1: null, 2: null });
    await syncPhotosMeta();
  };

  const handleUpdate = async (body) => {
    const updated = await api.updateStudent(editing.id, body);
    setStudents((list) =>
      list.map((s) => (s.id === updated.id ? updated : s))
    );
    setEditing(null);
  };

  const handleDelete = async (id) => {
    if (!confirm("Удалить запись из базы?")) return;
    await api.deleteStudent(id);
    setStudents((list) => list.filter((s) => s.id !== id));
    if (editing?.id === id) setEditing(null);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg("");
    try {
      const text = await file.text();
      const rows = parseStudentsCsv(text);
      if (rows.length === 0) {
        setImportMsg("Файл пуст или неверный формат.");
        return;
      }
      const result = await api.bulkStudents(rows);
      await reload();
      setImportMsg(
        `Добавлено: ${result.created}.` +
          (result.errors?.length
            ? ` Ошибок: ${result.errors.length} (строки ${result.errors.map((x) => x.line).join(", ")})`
            : "")
      );
    } catch (err) {
      setImportMsg(err.message);
    }
    e.target.value = "";
  };

  if (loading) return <p className="muted">Загрузка списка…</p>;

  return (
    <section className="card panel table-panel">
      <div className="card-head">
        <p className="section-caption">
          В списке {filtered.length}{" "}
          {filtered.length === 1 ? "человек" : "чел."}
        </p>
        <input
          type="search"
          placeholder="Поиск по ФИО, должности, званию…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search"
        />
      </div>

      {editing && (
        <div className="panel panel-edit">
          <h3>Редактирование: {fullName(editing)}</h3>
          <PhotoSlots
            studentId={editing.id}
            hasPhoto1={asBool(editing.has_photo_1)}
            hasPhoto2={asBool(editing.has_photo_2)}
            onUploaded={syncPhotosMeta}
          />
          <StudentForm
            groups={groups}
            initial={{
              last_name: editing.last_name,
              first_name: editing.first_name,
              patronymic: editing.patronymic ?? "",
              phone: editing.phone,
              birth_date: toInputDate(editing.birth_date),
              group_id: String(editing.group_id),
              housing: editing.housing ?? "",
            }}
            submitLabel="Сохранить изменения"
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {listError && <p className="form-error">{listError}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>№</th>
              <IdentityHeaderCells />
              <th>ФИО</th>
              <th>Фото</th>
              <th>Группа</th>
              <th>Проживание</th>
              <th>Телефон</th>
              <th>Дата рождения</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
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
                        src={`${photoUrl(s.id, slot)}&v=${thumbVer}`}
                        alt=""
                      />
                    ) : (
                      <span key={slot} className="thumb-empty" />
                    )
                  )}
                </td>
                <td>
                  <Link to={`/groups/${s.group_id}`}>{s.group_name}</Link>
                </td>
                <td>
                  <HousingPicker
                    compact
                    name={`housing-${s.id}`}
                    value={s.housing || ""}
                    onChange={async (housing) => {
                      setListError("");
                      try {
                        await api.updateStudent(s.id, { housing });
                        setStudents((list) =>
                          list.map((x) => (x.id === s.id ? { ...x, housing } : x))
                        );
                      } catch (err) {
                        setListError(err.message);
                      }
                    }}
                  />
                </td>
                <td>
                  <a href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a>
                </td>
                <td>{formatDate(s.birth_date)}</td>
                <td className="row-actions">
                  <Link to={`/students/${s.id}`} className="btn btn-sm primary">
                    Карточка
                  </Link>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setEditing(s)}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm danger"
                    onClick={() => handleDelete(s.id)}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="empty">Никого не найдено по запросу.</p>
        )}
      </div>

      <div className="panel">
        <h3>Добавить человека</h3>
        <p className="muted csv-hint">
          Два кадра: полный рост и по грудь / нашивки (JPEG, PNG и др., до 5 МБ каждый).
        </p>
        <PhotoSlots
          draftFiles={draftPhotos}
          onDraftChange={(slot, file) =>
            setDraftPhotos((d) => ({ ...d, [slot]: file }))
          }
        />
        <StudentForm
          groups={groups}
          submitLabel="Добавить в базу"
          onSubmit={handleCreate}
        />
      </div>

      <DocxBatchImport groups={groups} onImported={syncPhotosMeta} />

      <div className="panel">
        <h3>Загрузка из файла (CSV)</h3>
        <p className="muted csv-hint">
          Колонки через «;» или «,»: фамилия, имя, отчество, телефон, дата
          (ДД.ММ.ГГГГ или ГГГГ-ММ-ДД), группа (например 651/11). Первая строка
          может быть заголовком.
        </p>
        <input type="file" accept=".csv,.txt" onChange={handleFile} />
        {importMsg && <p className="import-msg">{importMsg}</p>}
      </div>
    </section>
  );
}

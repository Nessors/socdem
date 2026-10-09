import { useState } from "react";
import { api } from "../api";
import { toInputDate } from "../utils";

function emptyForm(fields) {
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}

function toForm(fields, item) {
  return Object.fromEntries(
    fields.map((f) => [
      f.key,
      f.type === "date" ? toInputDate(item[f.key]) : (item[f.key] ?? ""),
    ])
  );
}

/**
 * Список записей внутри карточки (родственники, командиры, работа в прошлом)
 * с добавлением, изменением и удалением прямо на странице.
 */
export default function RecordSection({
  title,
  kind,
  studentId,
  items,
  fields,
  summary,
  onChanged,
  addLabel = "Добавить",
  sectionClassName = "",
}) {
  const [editingId, setEditingId] = useState(null); // null | "new" | id
  const [form, setForm] = useState(emptyForm(fields));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const startNew = () => {
    setForm(emptyForm(fields));
    setError("");
    setEditingId("new");
  };

  const startEdit = (item) => {
    setForm(toForm(fields, item));
    setError("");
    setEditingId(item.id);
  };

  const cancel = () => {
    setEditingId(null);
    setError("");
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editingId === "new") {
        await api.createRecord(studentId, kind, form);
      } else {
        await api.updateRecord(studentId, kind, editingId, form);
      }
      setEditingId(null);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!confirm("Удалить запись?")) return;
    await api.deleteRecord(studentId, kind, item.id);
    if (editingId === item.id) setEditingId(null);
    await onChanged();
  };

  const formEl = (
    <form className="student-form record-form" onSubmit={submit}>
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.key} className={f.wide ? "wide" : undefined}>
            {f.label}
            {f.required ? " *" : ""}
            <input
              type={f.type === "date" ? "date" : "text"}
              required={f.required}
              value={form[f.key]}
              onChange={set(f.key)}
            />
          </label>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
        <button type="button" className="btn" onClick={cancel}>
          Отмена
        </button>
      </div>
    </form>
  );

  return (
    <section className={`card-section${sectionClassName ? ` ${sectionClassName}` : ""}`}>
      <div className="card-section-head">
        <h3>{title}</h3>
        {editingId == null && (
          <button type="button" className="btn btn-sm" onClick={startNew}>
            + {addLabel}
          </button>
        )}
      </div>

      {items.length === 0 && editingId !== "new" && (
        <p className="muted">Пока нет записей.</p>
      )}

      <ul className="record-list">
        {items.map((item) => {
          const { title: t, text } = summary(item);
          if (editingId === item.id) {
            return (
              <li key={item.id} className="record editing">
                {formEl}
              </li>
            );
          }
          return (
            <li key={item.id} className="record">
              <div className="record-body">
                <strong>{t}</strong>
                <span>{text}</span>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => startEdit(item)}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  className="btn btn-sm danger"
                  onClick={() => remove(item)}
                >
                  Удалить
                </button>
              </div>
            </li>
          );
        })}
        {editingId === "new" && <li className="record editing">{formEl}</li>}
      </ul>
    </section>
  );
}

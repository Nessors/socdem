import { useState } from "react";
import { validateRecordPayload } from "../../../socdemValidation.js";
import { api } from "../api";
import { useConfirm } from "./ConfirmDialog.jsx";
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
  sectionId = "",
}) {
  const ask = useConfirm();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null | "new" | id
  const [form, setForm] = useState(emptyForm(fields));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const startNew = () => {
    setForm(emptyForm(fields));
    setError("");
    setEditingId("new");
    setOpen(true);
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

  const closeBlock = () => {
    setEditingId(null);
    setError("");
    setOpen(false);
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const validationError = validateRecordPayload(kind, form);
      if (validationError) {
        setError(validationError);
        return;
      }
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
    const { title: recordTitle } = summary(item);
    const ok = await ask({
      title: "Удалить запись?",
      message: recordTitle
        ? `Запись «${recordTitle}» будет удалена.`
        : "Запись будет удалена.",
    });
    if (!ok) return;
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
      {editingId !== "new" && (
        <div className="record-delete">
          <button
            type="button"
            className="btn danger"
            disabled={saving}
            onClick={() => {
              const item = items.find((row) => row.id === editingId);
              if (item) remove(item);
            }}
          >
            Удалить запись
          </button>
        </div>
      )}
    </form>
  );

  return (
    <section
      id={sectionId || undefined}
      className={`card-section${sectionClassName ? ` ${sectionClassName}` : ""}`}
    >
      <div className="card-section-head">
        <h3>{title}</h3>
        <div className="card-section-tools">
          {open ? (
            <>
              {editingId == null && (
                <button type="button" className="btn btn-sm" onClick={startNew}>
                  + {addLabel}
                </button>
              )}
              <button type="button" className="btn btn-sm" onClick={closeBlock}>
                Готово
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => (items.length === 0 ? startNew() : setOpen(true))}
            >
              {items.length === 0 ? `+ ${addLabel}` : "Изменить"}
            </button>
          )}
        </div>
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
              {open && (
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => startEdit(item)}
                  >
                    Изменить
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {editingId === "new" && <li className="record editing">{formEl}</li>}
      </ul>
    </section>
  );
}

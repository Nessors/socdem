import { useState } from "react";
import { validateRecordPayload } from "../../../socdemValidation.js";
import { useConfirm } from "./ConfirmDialog.jsx";

function emptyForm(fields) {
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}

/** Список, который ещё не записан в базу: копится на экране добавления человека. */
export default function DraftSection({
  title,
  fields,
  summary,
  items,
  onChange,
  addLabel = "Добавить",
  recordKind = "",
}) {
  const ask = useConfirm();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(fields));
  const [error, setError] = useState("");

  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const start = () => {
    setForm(emptyForm(fields));
    setError("");
    setOpen(true);
  };

  const commit = () => {
    const missing = fields.find((field) => field.required && !form[field.key]?.trim());
    if (missing) {
      setError(`Заполните поле «${missing.label.replace(" *", "")}».`);
      return;
    }
    if (recordKind) {
      const validationError = validateRecordPayload(recordKind, form);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    onChange([
      ...items,
      { ...form, _key: `${Date.now()}-${items.length}` },
    ]);
    setForm(emptyForm(fields));
    setError("");
    setOpen(false);
  };

  const remove = async (item) => {
    const { title: recordTitle } = summary(item);
    const ok = await ask({
      title: "Убрать запись?",
      message: recordTitle
        ? `«${recordTitle}» не попадёт в карточку.`
        : "Эта строка не попадёт в карточку.",
    });
    if (!ok) return;
    onChange(items.filter((row) => row._key !== item._key));
  };

  return (
    <div className="add-block draft-section">
      <div className="card-section-head">
        <p className="section-caption">{title}</p>
        {!open && (
          <button type="button" className="btn btn-sm" onClick={start}>
            + {addLabel}
          </button>
        )}
      </div>

      {items.length === 0 && !open && (
        <p className="muted">Пока пусто. Можно заполнить сейчас или позже в карточке.</p>
      )}

      {items.length > 0 && (
        <ul className="record-list">
          {items.map((item) => {
            const { title: recordTitle, text } = summary(item);
            return (
              <li key={item._key} className="record">
                <div className="record-body">
                  <strong>{recordTitle}</strong>
                  <span>{text}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm danger"
                  onClick={() => remove(item)}
                >
                  Убрать
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <div className="draft-editor">
          <div className="form-grid">
            {fields.map((field) => (
              <label key={field.key} className={field.wide ? "wide" : undefined}>
                {field.label}
                {field.required ? " *" : ""}
                <input
                  type={field.type === "date" ? "date" : "text"}
                  value={form[field.key]}
                  onChange={set(field.key)}
                />
              </label>
            ))}
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn primary btn-sm" onClick={commit}>
              Добавить в список
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

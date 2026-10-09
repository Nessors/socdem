import { useState } from "react";
import LoginHero from "../components/LoginHero.jsx";
import { api } from "../api.js";

export default function ChangePasswordPage({ forced, onDone, onCancel }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (next !== again) {
      setError("Новый пароль и подтверждение не совпадают");
      return;
    }
    setSaving(true);
    try {
      const data = await api.changePassword(current, next, again);
      onDone(data.user);
    } catch (err) {
      setError(err.message || "Не удалось сменить пароль");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="login-screen">
      <LoginHero />
      <form className="login-card" onSubmit={submit}>
        <p className="login-form-kicker">Безопасность</p>
        <h2>{forced ? "Задайте свой пароль" : "Смена пароля"}</h2>
        <p className="muted">
          {forced
            ? "Это первый вход с заводским паролем. Придумайте свой — не короче 8 символов."
            : "Новый пароль — не короче 8 символов."}
        </p>
        <label>
          Текущий пароль
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          Новый пароль
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        <label>
          Ещё раз новый пароль
          <input
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Сохранение…" : "Сохранить пароль"}
        </button>
        {onCancel ? (
          <button type="button" className="btn" onClick={onCancel} disabled={saving}>
            Отмена
          </button>
        ) : null}
      </form>
    </div>
  );
}

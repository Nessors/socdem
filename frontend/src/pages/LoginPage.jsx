import { useState } from "react";
import LoginHero from "../components/LoginHero.jsx";
import { api } from "../api.js";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const data = await api.login(username, password);
      onLogin(data.user);
    } catch (err) {
      setError(err.message || "Не удалось войти");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="login-screen">
      <LoginHero />
      <form className="login-card" onSubmit={submit}>
        <p className="login-form-kicker">Вход в базу</p>
        <h2>Откройте учёт</h2>
        <p className="muted">
          Имя пользователя: <b>admin</b>. Если пароль ещё не меняли, он в файле{" "}
          <b>data\credentials.txt</b>.
        </p>
        <label>
          Имя пользователя
          <input
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Вход…" : "Войти"}
        </button>
      </form>
    </div>
  );
}

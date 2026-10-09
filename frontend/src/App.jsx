import { useEffect, useState } from "react";
import { matchPath, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage.jsx";
import FacultyPage from "./pages/FacultyPage.jsx";
import GroupsPage from "./pages/GroupsPage.jsx";
import StudentsPage from "./pages/StudentsPage.jsx";
import StudentCardPage from "./pages/StudentCardPage.jsx";
import RelativesPage from "./pages/RelativesPage.jsx";
import GeographyPage from "./pages/GeographyPage.jsx";
import MourningPage from "./pages/MourningPage.jsx";
import DisciplinePage from "./pages/DisciplinePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ChangePasswordPage from "./pages/ChangePasswordPage.jsx";
import { api } from "./api.js";

import gerb from "./assets/gerb.png";
import BrandLockup from "./components/BrandLockup.jsx";
import { NavIcon } from "./components/NavIcons.jsx";

const NAV = [
  { to: "/", label: "Главная", icon: "home", end: true },
  { to: "/students", label: "Личный состав", icon: "users" },
  { to: "/relatives", label: "Родственники", icon: "family" },
  { to: "/geography", label: "География и жильё", icon: "map" },
  { to: "/mourning", label: "Печальные события", icon: "mourning" },
  { to: "/discipline", label: "Дисциплинарная практика", icon: "discipline" },
];

const REF_NAV = [
  { to: "/groups", label: "Группы потока" },
  { to: "/faculty", label: "Факультет" },
];

const PAGE_META = [
  {
    path: "/",
    kicker: "Обзор",
    title: "Главная",
    hint: "Сводка по личному составу Факультета",
  },
  {
    path: "/students/:id",
    kicker: "Личный состав",
    title: "Карточка",
    hint: "Социально-демографические данные",
  },
  {
    path: "/students",
    kicker: "Учёт",
    title: "Личный состав",
    hint: "Список, карточки и загрузка соцдемов",
  },
  {
    path: "/relatives",
    kicker: "Связи",
    title: "Родственники",
    hint: "Контакты семей курсантов",
  },
  {
    path: "/geography",
    kicker: "Проживание",
    title: "География и жильё",
    hint: "Откуда приехали и где живут",
  },
  {
    path: "/mourning",
    kicker: "Учёт",
    title: "Печальные события",
    hint: "События, привязанные к карточкам",
  },
  {
    path: "/discipline",
    kicker: "Учёт",
    title: "Дисциплинарная практика",
    hint: "Благодарности, выговоры и снятие взысканий",
  },
  {
    path: "/groups/:id",
    kicker: "Справочник",
    title: "Группы потока",
    hint: "Состав выбранной учебной группы",
  },
  {
    path: "/groups",
    kicker: "Справочник",
    title: "Группы потока",
    hint: "Выберите группу, чтобы увидеть обучающихся",
  },
  {
    path: "/faculty",
    kicker: "Справочник",
    title: "Факультет",
    hint: "Сведения о факультете и потоке",
  },
];

function usePageMeta() {
  const { pathname } = useLocation();
  return (
    PAGE_META.find((p) => matchPath({ path: p.path, end: true }, pathname)) ?? {
      kicker: "ФСИТ",
      title: "БД",
      hint: "",
    }
  );
}

function AppShell({ user, onLogout, onShutdown, onChangePassword }) {
  const navigate = useNavigate();
  const page = usePageMeta();

  return (
    <div className="app-frame">
      <a className="skip-link" href="#content">
        К содержимому
      </a>
      <aside className="app-sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img
              className="brand-emblem"
              src={gerb}
              alt=""
              width={88}
              height={106}
            />
          </div>
          <BrandLockup />
        </div>

        <nav className="side-nav" aria-label="Основное меню">
          <p className="nav-label">Разделы</p>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? "side-link active" : "side-link"
              }
            >
              <NavIcon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
          <p className="nav-label">Справочник</p>
          {REF_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? "side-link active" : "side-link"
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="side-actions">
          <button
            type="button"
            className="side-btn"
            onClick={() => navigate("/students")}
          >
            Добавить человека
          </button>
          <button
            type="button"
            className="side-btn"
            onClick={() => navigate("/students")}
          >
            Импорт соцдемов
          </button>
          <button type="button" className="side-btn" onClick={onChangePassword}>
            Сменить пароль
          </button>
          <button type="button" className="side-btn" onClick={onLogout}>
            Выйти{user?.username ? ` (${user.username})` : ""}
          </button>
          <button type="button" className="side-btn" onClick={onShutdown}>
            Сохранить и выключить
          </button>
          <p className="brand-ver">Правки сохраняются сами</p>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="topbar">
          <div>
            <p className="topbar-kicker">{page.kicker}</p>
            <h1>{page.title}</h1>
            {page.hint ? <p className="topbar-hint">{page.hint}</p> : null}
          </div>
          <div className="topbar-meta">
            <span className="topbar-pill">
              {user?.display_name || user?.username || "admin"}
            </span>
            <span className="topbar-local">Только этот компьютер</span>
          </div>
        </header>
        <main id="content" className="app-main">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/students/:id" element={<StudentCardPage />} />
            <Route path="/relatives" element={<RelativesPage />} />
            <Route path="/geography" element={<GeographyPage />} />
            <Route path="/mourning" element={<MourningPage />} />
            <Route path="/discipline" element={<DisciplinePage />} />
            <Route path="/groups/:id?" element={<GroupsPage />} />
            <Route path="/faculty" element={<FacultyPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [stopped, setStopped] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    const onLost = () => setUser(null);
    const onMustChange = () => {
      setUser((prev) => (prev ? { ...prev, must_change: true } : prev));
    };
    window.addEventListener("socdem-auth-lost", onLost);
    window.addEventListener("socdem-must-change", onMustChange);
    return () => {
      cancelled = true;
      window.removeEventListener("socdem-auth-lost", onLost);
      window.removeEventListener("socdem-must-change", onMustChange);
    };
  }, []);

  async function logout() {
    try {
      await api.logout();
    } catch {
      /* cookie всё равно сбросим на сервере при следующем входе */
    }
    setUser(null);
  }

  async function shutdownApp() {
    const ok = window.confirm(
      "Сохранить все изменения и выключить базу?\nПосле этого браузер и чёрное окно можно закрыть."
    );
    if (!ok) return;
    try {
      await api.shutdown();
    } catch {
      /* сервер гасится сразу после ответа */
    }
    setStopped(true);
  }

  if (stopped) {
    return (
      <div className="login-screen login-screen--simple">
        <div className="login-card">
          <p className="login-form-kicker">Готово</p>
          <h2>Данные сохранены</h2>
          <p className="muted">
            База выключена. Это окно браузера можно закрыть. В следующий раз
            снова откройте файл «Открыть базу».
          </p>
        </div>
      </div>
    );
  }

  if (user === undefined) {
    return (
      <div className="login-screen login-screen--simple">
        <p className="muted">Загрузка…</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  if (user.must_change || changingPassword) {
    return (
      <ChangePasswordPage
        forced={Boolean(user.must_change)}
        onDone={(next) => {
          setUser(next);
          setChangingPassword(false);
        }}
        onCancel={
          user.must_change ? undefined : () => setChangingPassword(false)
        }
      />
    );
  }

  return (
    <AppShell
      user={user}
      onLogout={logout}
      onShutdown={shutdownApp}
      onChangePassword={() => setChangingPassword(true)}
    />
  );
}

import { useEffect, useState } from "react";
import {
  Link,
  matchPath,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import DashboardPage from "./pages/DashboardPage.jsx";
import FacultyPage from "./pages/FacultyPage.jsx";
import GroupsPage from "./pages/GroupsPage.jsx";
import StudentsPage from "./pages/StudentsPage.jsx";
import StudentCardPage from "./pages/StudentCardPage.jsx";
import RelativesPage from "./pages/RelativesPage.jsx";
import GeographyPage from "./pages/GeographyPage.jsx";
import MourningPage from "./pages/MourningPage.jsx";
import DisciplinePage from "./pages/DisciplinePage.jsx";
import BirthdaysPage from "./pages/BirthdaysPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ChangePasswordPage from "./pages/ChangePasswordPage.jsx";
import { api } from "./api.js";

import ParadeBanner from "./components/ParadeBanner.jsx";
import academyMark from "./assets/academy-mark-navy.png";
import PageLoader from "./components/PageLoader.jsx";
import { ConfirmProvider, useConfirm } from "./components/ConfirmDialog.jsx";
import { NavIcon } from "./components/NavIcons.jsx";

const NAV_GROUPS = [
  {
    label: "Обзор",
    items: [{ to: "/", label: "Главная", icon: "home", end: true }],
  },
  {
    label: "Состав",
    items: [
      { to: "/students", label: "Личный состав", icon: "users" },
      { to: "/officers", label: "Офицеры", icon: "officer" },
      { to: "/civilians", label: "Гражданский персонал", icon: "civilian" },
    ],
  },
  {
    label: "Учёт",
    items: [
      { to: "/relatives", label: "Родственники", icon: "family" },
      { to: "/birthdays", label: "Дни рождения", icon: "calendar" },
      { to: "/geography", label: "География и жильё", icon: "map" },
      { to: "/mourning", label: "Печальные события", icon: "mourning" },
      { to: "/discipline", label: "Дисциплинарная практика", icon: "discipline" },
    ],
  },
];

const PAGE_META = [
  {
    path: "/",
    kicker: "Обзор",
    title: "Главная",
    hint: "",
  },
  {
    path: "/students/new",
    kicker: "Учёт",
    title: "Добавить человека",
    hint: "Новая карточка личного состава",
  },
  {
    path: "/officers/new",
    kicker: "Учёт",
    title: "Добавить офицера",
    hint: "Новая карточка офицера",
  },
  {
    path: "/civilians/new",
    kicker: "Учёт",
    title: "Добавить сотрудника",
    hint: "Новая карточка гражданского персонала",
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
    hint: "Список и карточки личного состава",
  },
  {
    path: "/officers",
    kicker: "Учёт",
    title: "Офицеры",
    hint: "Офицерский состав факультета",
  },
  {
    path: "/civilians",
    kicker: "Учёт",
    title: "Гражданский персонал",
    hint: "Гражданские сотрудники факультета",
  },
  {
    path: "/relatives",
    kicker: "Связи",
    title: "Родственники",
    hint: "Контакты семей курсантов",
  },
  {
    path: "/birthdays",
    kicker: "Календарь",
    title: "Дни рождения",
    hint: "Ближайшие дни рождения личного состава",
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
    kicker: "Состав",
    title: "Группы потока",
    hint: "Состав выбранной учебной группы",
  },
  {
    path: "/groups",
    kicker: "Состав",
    title: "Группы потока",
    hint: "Выберите группу, чтобы увидеть обучающихся",
  },
  {
    path: "/faculty/:course",
    kicker: "Состав",
    title: "Курс факультета",
    hint: "Личный состав выбранного курса",
  },
  {
    path: "/faculty",
    kicker: "Состав",
    title: "Курс факультета",
    hint: "Выберите курс, чтобы увидеть его личный состав",
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

/** На всех экранах кроме главной — одна кнопка «На главную». */
function useTopbarBack(location) {
  if (location.pathname === "/") return null;
  return { to: "/", label: "На главную" };
}

function AppShell({ onStopped }) {
  const navigate = useNavigate();
  const location = useLocation();
  const page = usePageMeta();
  const topbarBack = useTopbarBack(location);
  const ask = useConfirm();
  const [navOpen, setNavOpen] = useState(true);
  const isHome = location.pathname === "/";

  useEffect(() => {
    if (location.pathname !== "/") setNavOpen(false);
  }, [location.pathname]);

  function openSection(path) {
    setNavOpen(false);
    if (path) navigate(path);
  }

  async function shutdownApp() {
    const ok = await ask({
      title: "Сохранить и выключить?",
      message:
        "Все изменения будут записаны на диск.\nПосле этого можно закрыть браузер и чёрное окно сервера.",
      confirmLabel: "Сохранить и выключить",
      cancelLabel: "Остаться в базе",
      confirmTone: "primary",
    });
    if (!ok) return;
    try {
      await api.shutdown();
    } catch {
      /* сервер гасится сразу после ответа */
    }
    onStopped();
  }

  return (
    <div className={navOpen ? "app-frame" : "app-frame nav-collapsed"}>
      <a className="skip-link" href="#content">
        К содержимому
      </a>
      <div className="app-parade">
        <ParadeBanner />
      </div>
      <aside className="app-sidebar">
        <nav className="side-nav" aria-label="Основное меню">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-label">{group.label}</p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setNavOpen(false)}
                  className={({ isActive }) =>
                    isActive ? "side-link active" : "side-link"
                  }
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-actions">
          <button
            type="button"
            className="side-btn"
            onClick={() => openSection("/students/new")}
          >
            Добавить человека
          </button>
          <button type="button" className="side-btn" onClick={shutdownApp}>
            Сохранить и выключить
          </button>
          <p className="brand-ver">Правки сохраняются сами</p>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="topbar">
          <div className="topbar-lead">
            {isHome ? (
              <div className="topbar-toolbar">
                <button
                  type="button"
                  className="nav-toggle"
                  aria-expanded={navOpen}
                  onClick={() => setNavOpen((open) => !open)}
                >
                  {navOpen ? "Скрыть меню" : "Меню"}
                </button>
              </div>
            ) : null}
            <img
              className="topbar-mark"
              src={academyMark}
              alt=""
              width={40}
              height={40}
            />
            <div>
              <p className="topbar-kicker">{page.kicker}</p>
              <h1>{page.title}</h1>
              {page.hint ? <p className="topbar-hint">{page.hint}</p> : null}
            </div>
          </div>
          {topbarBack ? (
            <Link to={topbarBack.to} className="topbar-back topbar-back--end">
              ← {topbarBack.label}
            </Link>
          ) : null}
        </header>
        <main id="content" className="app-main">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/students/new" element={<StudentsPage category="cadet" creating />} />
            <Route path="/officers/new" element={<StudentsPage key="officer-new" category="officer" creating />} />
            <Route path="/civilians/new" element={<StudentsPage key="civilian-new" category="civilian" creating />} />
            <Route path="/students" element={<StudentsPage category="cadet" />} />
            <Route path="/officers" element={<StudentsPage key="officer" category="officer" />} />
            <Route path="/civilians" element={<StudentsPage key="civilian" category="civilian" />} />
            <Route path="/students/:id" element={<StudentCardPage />} />
            <Route path="/relatives" element={<RelativesPage />} />
            <Route path="/birthdays" element={<BirthdaysPage />} />
            <Route path="/geography" element={<GeographyPage />} />
            <Route path="/mourning" element={<MourningPage />} />
            <Route path="/discipline" element={<DisciplinePage />} />
            <Route path="/groups/:id?" element={<GroupsPage />} />
            <Route path="/faculty/:course?" element={<FacultyPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [stopped, setStopped] = useState(false);
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
        <PageLoader label="Подключение к базе…" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  if (user.must_change) {
    return (
      <ChangePasswordPage
        forced
        onDone={(next) => setUser(next)}
      />
    );
  }

  return (
    <ConfirmProvider>
      <AppShell onStopped={() => setStopped(true)} />
    </ConfirmProvider>
  );
}

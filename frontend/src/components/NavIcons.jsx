const common = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  "aria-hidden": true,
};

export function IconHome(props) {
  return (
    <svg {...common} {...props}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  );
}

export function IconUsers(props) {
  return (
    <svg {...common} {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IconFamily(props) {
  return (
    <svg {...common} {...props}>
      <circle cx="9" cy="7" r="3" />
      <path d="M4 20v-1a5 5 0 0 1 5-5h0" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M14 20v-1a3 3 0 0 1 3-3h0" />
    </svg>
  );
}

export function IconMap(props) {
  return (
    <svg {...common} {...props}>
      <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function IconStatUser(props) {
  return <IconUsers {...props} />;
}

export function IconStatGlobe(props) {
  return (
    <svg {...common} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

export function IconStatBuilding(props) {
  return (
    <svg {...common} {...props}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
      <path d="M6 12h12M10 6h4M10 10h4M10 14h4M10 18h4" />
    </svg>
  );
}

export function IconStatPhone(props) {
  return (
    <svg {...common} {...props}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

export function IconMourning(props) {
  return (
    <svg {...common} {...props}>
      <path d="M12 2v4M12 18v4M8 6h8l-1 12H9L8 6Z" />
      <path d="M10 6c0-1.1.9-2 2-2s2 .9 2 2" />
    </svg>
  );
}

export function IconOfficer(props) {
  return (
    <svg {...common} {...props}>
      <path d="M12 3.2 14.4 8.4 20 9.1 16.2 12.8 17.1 18.5 12 15.8 6.9 18.5 7.8 12.8 4 9.1 9.6 8.4 12 3.2Z" />
    </svg>
  );
}

export function IconCivilian(props) {
  return (
    <svg {...common} {...props}>
      <rect x="3" y="7" width="18" height="13" rx="1.5" />
      <path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7M3 12h18" />
    </svg>
  );
}

export function IconDiscipline(props) {
  return (
    <svg {...common} {...props}>
      <path d="M12 3 19 6.5v5.2c0 4.4-2.8 7.3-7 8.8-4.2-1.5-7-4.4-7-8.8V6.5L12 3Z" />
      <path d="M8.5 12h7M12 8.5v7" />
    </svg>
  );
}

export function IconCalendar(props) {
  return (
    <svg {...common} {...props}>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <path d="M8 14h2v2H8z" />
    </svg>
  );
}

export function IconGrid(props) {
  return (
    <svg {...common} {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

const NAV_ICON = {
  home: IconHome,
  users: IconUsers,
  officer: IconOfficer,
  civilian: IconCivilian,
  family: IconFamily,
  calendar: IconCalendar,
  map: IconMap,
  mourning: IconMourning,
  discipline: IconDiscipline,
  faculty: IconStatBuilding,
  groups: IconGrid,
};

export function NavIcon({ name }) {
  const C = NAV_ICON[name] ?? IconHome;
  return <C className="side-icon-svg" />;
}

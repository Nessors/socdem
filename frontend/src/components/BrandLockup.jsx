export default function BrandLockup({ asHero = false }) {
  const TitleTag = asHero ? "h1" : "p";
  return (
    <div className={asHero ? "brand-lockup brand-lockup--hero" : "brand-lockup"}>
      <p className="brand-kicker">Социально-демографические данные</p>
      <TitleTag className="brand-title">
        Факультет специальных информационных технологий
      </TitleTag>
      <p className="brand-sub">Военно-политическая работа</p>
    </div>
  );
}

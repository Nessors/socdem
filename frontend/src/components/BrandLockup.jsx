export default function BrandLockup({ asHero = false }) {
  const TitleTag = asHero ? "h1" : "p";
  return (
    <div className={asHero ? "brand-lockup brand-lockup--hero" : "brand-lockup"}>
      <p className="brand-kicker">База данных</p>
      <TitleTag className="brand-title">
        Факультета специальных информационных технологий
      </TitleTag>
      <p className="brand-sub">Военно-политическая работа</p>
    </div>
  );
}

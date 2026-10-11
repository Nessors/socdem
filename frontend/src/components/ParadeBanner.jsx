import gerb from "../assets/gerb.png";
import academyMark from "../assets/academy-mark-gold.png";

export default function ParadeBanner() {
  return (
    <section className="parade" aria-label="Факультет">
      <img
        className="parade-mark"
        src={academyMark}
        alt=""
        width={108}
        height={108}
      />
      <div className="parade-copy">
        <div className="parade-words">
          <p className="parade-title">
            Факультет специальных информационных технологий
          </p>
          <p className="parade-sub">Военно-политическая работа</p>
        </div>
      </div>
      <img
        className="parade-gerb"
        src={gerb}
        alt=""
        width={108}
        height={108}
      />
    </section>
  );
}

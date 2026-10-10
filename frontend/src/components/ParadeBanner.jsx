import gerb from "../assets/gerb.png";
import facultyEmblem from "../assets/faculty-emblem.png";

export default function ParadeBanner() {
  return (
    <section className="parade" aria-label="Факультет">
      <img
        className="parade-gerb"
        src={gerb}
        alt=""
        width={168}
        height={202}
      />
      <div className="parade-copy">
        <p className="parade-title">
          Факультет специальных информационных технологий
        </p>
        <p className="parade-sub">Военно-политическая работа</p>
      </div>
      <img
        className="parade-emblem"
        src={facultyEmblem}
        alt=""
        width={168}
        height={252}
      />
    </section>
  );
}

import gerb from "../assets/gerb.png";
import BrandLockup from "./BrandLockup.jsx";

export default function LoginHero({ className = "" }) {
  return (
    <aside className={`login-hero${className ? ` ${className}` : ""}`}>
      <div className="login-hero-glow" aria-hidden="true" />
      <img className="login-gerb" src={gerb} alt="" width={104} height={125} />
      <BrandLockup asHero />
      <p className="login-hero-lead">
        Учёт личного состава на этом компьютере.
      </p>
      <ul className="login-hero-points">
        <li>Карточки и фото хранятся в этой папке</li>
        <li>Правки записываются сами, через пару секунд</li>
        <li>Выключайте базу кнопкой «Сохранить и выключить»</li>
      </ul>
    </aside>
  );
}

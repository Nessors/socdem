/** Единый индикатор загрузки для всех разделов */
export default function PageLoader({ label = "Загрузка…" }) {
  return (
    <div className="page-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="page-loader__track" aria-hidden="true">
        <span className="page-loader__bar" />
      </div>
      <p className="page-loader__label">{label}</p>
    </div>
  );
}

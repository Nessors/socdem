export const HOUSING_LABELS = {
  barracks: "В казарме",
  off_barracks: "Вне казармы",
};

export function housingLabel(value) {
  return HOUSING_LABELS[value] || "Не указано";
}

export default function HousingPicker({
  value,
  onChange,
  disabled = false,
  name = "housing",
  compact = false,
}) {
  return (
    <div
      className={compact ? "housing-picker housing-picker--compact" : "housing-picker"}
      role="radiogroup"
      aria-label="Проживание"
    >
      {Object.entries(HOUSING_LABELS).map(([key, label]) => (
        <label key={key} className={value === key ? "is-on" : undefined}>
          <input
            type="radio"
            name={name}
            value={key}
            checked={value === key}
            disabled={disabled}
            onChange={() => onChange(key)}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

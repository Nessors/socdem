import { useId } from "react";

function SearchGlyph() {
  return (
    <svg className="fio-search__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.5 3a7.5 7.5 0 0 1 5.88 12.03l4.27 4.27-1.42 1.42-4.27-4.27A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"
      />
    </svg>
  );
}

/**
 * Единая поисковая строка по ФИО (и связанным полям) во всех разделах.
 */
export default function FioSearchField({
  value,
  onChange,
  placeholder = "Поиск по ФИО…",
  label,
  id,
  className = "",
  wide = false,
  grow = false,
  "aria-label": ariaLabel,
}) {
  const autoId = useId();
  const inputId = id || autoId;
  const text = value ?? "";

  function clear() {
    onChange({ target: { value: "" } });
  }

  const rootClass = [
    "fio-search",
    wide ? "fio-search--wide" : "",
    grow ? "fio-search--grow" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={rootClass} htmlFor={inputId}>
      {label ? <span className="fio-search__label">{label}</span> : null}
      <span className="fio-search__wrap">
        <SearchGlyph />
        <input
          id={inputId}
          type="search"
          className="fio-search__input"
          placeholder={placeholder}
          value={text}
          onChange={onChange}
          autoComplete="off"
          enterKeyHint="search"
          aria-label={ariaLabel || label || placeholder}
        />
        {text ? (
          <button
            type="button"
            className="fio-search__clear"
            aria-label="Очистить поиск"
            onClick={clear}
          >
            ×
          </button>
        ) : null}
      </span>
    </label>
  );
}

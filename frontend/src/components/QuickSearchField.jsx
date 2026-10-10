import { useEffect, useId, useMemo, useRef, useState } from "react";

const DEFAULT_MAX = 10;

export default function QuickSearchField({
  value,
  onChange,
  suggestions = [],
  placeholder = "Начните ввод или выберите из базы…",
  maxVisible = DEFAULT_MAX,
  disabled,
}) {
  const listId = useId();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const filtered = useMemo(() => {
    const needle = String(value ?? "").trim().toLowerCase();
    const list = suggestions.filter(Boolean);
    if (!needle) return list.slice(0, maxVisible);
    return list
      .filter((item) => item.toLowerCase().includes(needle))
      .slice(0, maxVisible);
  }, [suggestions, value, maxVisible]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (text) => {
    onChange({ target: { value: text } });
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e) => {
    if (!open || filtered.length === 0) {
      if (e.key === "ArrowDown" && filtered.length) {
        setOpen(true);
        setActive(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? filtered.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(filtered[active]);
    }
  };

  const showList = open && filtered.length > 0 && suggestions.length > 0;

  return (
    <span className="quick-search-field" ref={wrapRef}>
      <input
        type="search"
        value={value ?? ""}
        onChange={onChange}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
      />
      {showList ? (
        <ul className="quick-search-list" id={listId} role="listbox">
          {filtered.map((item, index) => (
            <li key={item} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={index === active ? "is-active" : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}

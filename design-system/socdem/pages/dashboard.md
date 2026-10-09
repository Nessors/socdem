# Dashboard (Главная) — overrides

**Паттерн:** Command dashboard — KPI cards + 2 charts + filterable table.

## Layout
- Верх: KPI-карточки в grid (`stat-card`) — белая поверхность, иконка в мягком синем чипе, без градиента.
- Середина: donut «География» + bar «Родственники» в `chart-panel`.
- Низ: «Быстрый поиск» — search + selects + table (max 12 строк + ссылка на полный список).

## React
- Фильтрация: `useDeferredValue` для поиска (не блокировать ввод).
- Производные списки считать при render, без лишних `useEffect`.

## A11y
- Все интерактивные элементы: `cursor: pointer`, видимый `:focus-visible`.
- KPI не использовать emoji — только SVG-иконки.

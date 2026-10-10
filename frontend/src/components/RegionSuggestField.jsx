import QuickSearchField from "./QuickSearchField.jsx";
import { REGION_LABELS } from "../geo/regionLabels.js";

export default function RegionSuggestField({ value, onChange }) {
  return (
    <div className="region-suggest-field">
      <QuickSearchField
        value={value ?? ""}
        onChange={onChange}
        suggestions={REGION_LABELS}
        maxVisible={14}
        placeholder="Субъект РФ или страна"
      />
      <p className="muted region-suggest-note">
        Подсказки по субъектам — только из программы, интернет не нужен. При необходимости можно
        дописать город или населённый пункт вручную.
      </p>
    </div>
  );
}

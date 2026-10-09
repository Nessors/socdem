import { formatDuty, formatRank } from "../serviceTitle.js";
import { dashText } from "../utils";

export function IdentityHeaderCells() {
  return (
    <>
      <th>Должность</th>
      <th>Звание</th>
    </>
  );
}

export function IdentityCells({ person }) {
  return (
    <>
      <td className="col-position">{dashText(formatDuty(person))}</td>
      <td className="col-rank">{dashText(formatRank(person))}</td>
    </>
  );
}

export function IdentityLine({ person }) {
  return (
    <span className="identity-line">
      <span className="identity-position">{dashText(formatDuty(person))}</span>
      <span className="identity-rank">{dashText(formatRank(person))}</span>
    </span>
  );
}

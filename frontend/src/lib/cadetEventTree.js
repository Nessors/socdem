import { courseCodeFromGroup } from "../serviceTitle.js";
import { fullName } from "../utils";

/** Курс → группа → курсант → список записей (родственники или печальные события). */
export function buildCadetEventTree(rows, { itemKey = "id" } = {}) {
  const byCourse = new Map();

  for (const row of rows) {
    const code = courseCodeFromGroup(row.group_name) || "—";
    if (!byCourse.has(code)) byCourse.set(code, new Map());
    const byGroup = byCourse.get(code);
    const groupName = row.group_name || "Без группы";
    if (!byGroup.has(groupName)) byGroup.set(groupName, new Map());
    const byStudent = byGroup.get(groupName);
    const sid = row.student_id;
    if (!byStudent.has(sid)) {
      byStudent.set(sid, {
        student_id: sid,
        last_name: row.last_name,
        first_name: row.first_name,
        patronymic: row.patronymic,
        group_name: groupName,
        items: [],
      });
    }
    byStudent.get(sid).items.push(row);
  }

  const courses = [...byCourse.entries()]
    .map(([code, byGroup]) => {
      const groups = [...byGroup.entries()]
        .map(([name, byStudent]) => {
          const cadets = [...byStudent.values()]
            .map((cadet) => {
              cadet.items.sort((a, b) => {
                if (a.is_missing_parent !== b.is_missing_parent) {
                  return a.is_missing_parent ? 1 : -1;
                }
                const da = a.death_date ? String(a.death_date) : "";
                const db = b.death_date ? String(b.death_date) : "";
                if (da !== db) return db.localeCompare(da);
                return String(a[itemKey]).localeCompare(String(b[itemKey]), "ru");
              });
              return cadet;
            })
            .sort((a, b) => fullName(a).localeCompare(fullName(b), "ru"));
          return { name, cadets };
        })
        .filter((g) => g.cadets.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true }));
      const count = groups.reduce(
        (sum, g) => sum + g.cadets.reduce((s, c) => s + c.items.length, 0),
        0
      );
      return { code, groups, count };
    })
    .filter((c) => c.groups.length > 0)
    .sort((a, b) => {
      if (a.code === "—") return 1;
      if (b.code === "—") return -1;
      return a.code.localeCompare(b.code, "ru", { numeric: true });
    });

  return courses;
}

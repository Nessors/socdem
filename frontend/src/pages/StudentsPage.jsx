import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { validateStudentPayload } from "../../../socdemValidation.js";
import { api, photoUrl } from "../api";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import DocxBatchImport from "../components/DocxBatchImport.jsx";
import PageLoader from "../components/PageLoader.jsx";
import DraftSection from "../components/DraftSection.jsx";
import PhotoSlots from "../components/PhotoSlots.jsx";
import RegionSuggestField from "../components/RegionSuggestField.jsx";
import FioSearchField from "../components/FioSearchField.jsx";
import QuickSearchField from "../components/QuickSearchField.jsx";
import { IdentityCells, IdentityHeaderCells } from "../components/PersonIdentity.jsx";
import {
  CAREER_FIELDS,
  COMMANDER_FIELDS,
  MOURNING_FIELDS,
  PROFILE_FIELDS,
  PROFILE_PLACE_FIELD_KEYS,
  PROFILE_SUGGEST_FIELD_KEYS,
  RELATIVE_FIELDS,
  careerSummary,
  commanderSummary,
  mourningSummary,
  relativeSummary,
} from "../profileConfig";
import { courseCodeFromGroup, MILITARY_RANKS, normalizeMilitaryRank } from "../serviceTitle.js";
import {
  buildProfileFieldSuggestions,
  formatDate,
  fullName,
  newPersonPath,
  personCategory,
  personnelListPath,
  personnelListReturn,
  personSearchHay,
  toInputDate,
} from "../utils";

const COURSES = ["61", "62", "63", "64", "65"];

const PERSONNEL = {
  cadet: {
    addTitle: "Добавить человека",
    submit: "Добавить в базу",
    showGroup: true,
    showImport: true,
  },
  officer: {
    addTitle: "Добавить офицера",
    submit: "Добавить офицера",
    showGroup: false,
    showImport: true,
  },
  civilian: {
    addTitle: "Добавить сотрудника",
    submit: "Добавить сотрудника",
    showGroup: false,
    showImport: true,
  },
};

function asBool(v) {
  return v === true || v === "t" || v === "true";
}

const emptyForm = {
  last_name: "",
  first_name: "",
  patronymic: "",
  phone: "",
  birth_date: "",
  group_id: "",
};

function courseTree(groups, people, hideEmptyGroups) {
  const byCode = new Map();
  const ensure = (code) => {
    if (!byCode.has(code)) byCode.set(code, new Map());
    return byCode.get(code);
  };

  for (const group of groups) {
    const code = courseCodeFromGroup(group.name);
    if (!code) continue;
    const map = ensure(code);
    const id = Number(group.id);
    if (!map.has(id)) map.set(id, { id, name: group.name, people: [] });
  }

  const loose = [];
  for (const person of people) {
    const code = courseCodeFromGroup(person.group_name);
    let bucket = null;
    if (code) {
      const map = ensure(code);
      bucket = map.get(Number(person.group_id));
      if (!bucket) {
        bucket = [...map.values()].find((g) => g.name === person.group_name);
      }
      if (!bucket) {
        const id = Number(person.group_id) || person.group_name || "none";
        bucket = { id, name: person.group_name || "Без группы", people: [] };
        map.set(id, bucket);
      }
    }
    if (bucket) bucket.people.push(person);
    else loose.push(person);
  }

  for (const map of byCode.values()) {
    for (const bucket of map.values()) {
      bucket.people.sort((a, b) => fullName(a).localeCompare(fullName(b), "ru"));
    }
  }

  const courses = [...byCode.entries()]
    .map(([code, map]) => ({
      code,
      groups: [...map.values()]
        .filter((g) => !hideEmptyGroups || g.people.length > 0)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "ru", { numeric: true })),
    }))
    .filter((course) => course.groups.length > 0)
    .sort((a, b) => {
      const ia = COURSES.indexOf(a.code);
      const ib = COURSES.indexOf(b.code);
      if (ia === -1 && ib === -1) return a.code.localeCompare(b.code, "ru");
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

  loose.sort((a, b) => fullName(a).localeCompare(fullName(b), "ru"));
  return { courses, loose };
}

function Chevron() {
  return (
    <svg className="roster-chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6 3.5 11 8 6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function blankCreateForm() {
  const form = { ...emptyForm };
  for (const field of PROFILE_FIELDS) form[field.key] = "";
  return form;
}

const SUGGEST_KEYS = new Set(PROFILE_SUGGEST_FIELD_KEYS);
const PLACE_KEYS = new Set(PROFILE_PLACE_FIELD_KEYS);

function StudentForm({
  groups,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  showGroup = true,
  variant = "plain",
  profileSuggestions = null,
  footer = null,
  children,
}) {
  const [form, setForm] = useState(() =>
    initial ?? (variant === "create" ? blankCreateForm() : emptyForm)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(initial ?? (variant === "create" ? blankCreateForm() : emptyForm));
    setError("");
  }, [initial, variant]);

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = { ...form };
      if (showGroup) body.group_id = Number(form.group_id);
      else delete body.group_id;
      delete body.housing;
      if (body.military_rank) {
        body.military_rank = normalizeMilitaryRank(body.military_rank) || "";
      }
      const validationError = validateStudentPayload(body, { partial: Boolean(initial) });
      if (validationError) {
        setError(validationError);
        return;
      }
      await onSubmit(body);
      if (!initial) setForm(emptyForm);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const nameFields = (
    <>
      <label>
        Фамилия *
        <input
          required
          value={form.last_name}
          onChange={set("last_name")}
          autoComplete="family-name"
          title="Только буквы, без цифр"
        />
      </label>
      <label>
        Имя *
        <input
          required
          value={form.first_name}
          onChange={set("first_name")}
          autoComplete="given-name"
          title="Только буквы, без цифр"
        />
      </label>
      <label>
        Отчество
        <input
          value={form.patronymic}
          onChange={set("patronymic")}
          autoComplete="additional-name"
          title="Только буквы, без цифр"
        />
      </label>
    </>
  );

  const factFields = (
    <>
      <label>
        Телефон *
        <input required value={form.phone} onChange={set("phone")} autoComplete="tel" />
      </label>
      <label>
        Дата рождения *
        <input
          type="date"
          required
          value={form.birth_date}
          onChange={set("birth_date")}
        />
      </label>
      {showGroup ? (
        <label>
          Группа *
          <select required value={form.group_id} onChange={set("group_id")}>
            <option value="">— выберите —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );

  const actions = (
    <>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Сохранение…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </>
  );

  if (variant === "create") {
    return (
      <form className="student-form add-form" onSubmit={handleSubmit}>
        <div className="add-block">
          <p className="section-caption">Фамилия, имя, отчество</p>
          <div className="form-grid add-names">{nameFields}</div>
        </div>
        <div className="add-block">
          <p className="section-caption">Связь и учёт</p>
          <div className="form-grid add-facts">{factFields}</div>
        </div>
        <div className="add-block">
          <p className="section-caption">Данные соцдема</p>
          <div className="form-grid add-profile">
            {PROFILE_FIELDS.map((field) => {
              const control =
                PLACE_KEYS.has(field.key) ? (
                  <RegionSuggestField value={form[field.key] ?? ""} onChange={set(field.key)} />
                ) : field.key === "military_rank" ? (
                  <QuickSearchField
                    value={form[field.key] ?? ""}
                    onChange={set(field.key)}
                    suggestions={MILITARY_RANKS}
                    placeholder="Только звание, без приказа"
                  />
                ) : profileSuggestions && SUGGEST_KEYS.has(field.key) ? (
                  <QuickSearchField
                    value={form[field.key] ?? ""}
                    onChange={set(field.key)}
                    suggestions={profileSuggestions[field.key] ?? []}
                  />
                ) : (
                  <input value={form[field.key] ?? ""} onChange={set(field.key)} />
                );

              if (PLACE_KEYS.has(field.key)) {
                return (
                  <div
                    key={field.key}
                    className={field.wide ? "wide form-field-block" : "form-field-block"}
                  >
                    <span className="form-field-label">{field.label}</span>
                    {control}
                  </div>
                );
              }

              return (
                <label key={field.key} className={field.wide ? "wide" : undefined}>
                  {field.label}
                  {control}
                </label>
              );
            })}
          </div>
        </div>
        {children}
        {footer}
        {actions}
      </form>
    );
  }

  return (
    <form className="student-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        {nameFields}
        {factFields}
      </div>
      {actions}
    </form>
  );
}

export default function StudentsPage({ category = "cadet", creating = false }) {
  const ask = useConfirm();
  const navigate = useNavigate();
  const kind = PERSONNEL[category] ?? PERSONNEL.cadet;
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [listError, setListError] = useState("");
  const [draftPhotos, setDraftPhotos] = useState({ 1: null, 2: null });
  const [draftLists, setDraftLists] = useState({
    relatives: [],
    commanders: [],
    career: [],
    mourning: [],
  });
  const [thumbVer, setThumbVer] = useState(0);
  const [openCourses, setOpenCourses] = useState(() => new Set());
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [managingGroups, setManagingGroups] = useState(() => new Set());
  const [managingFlat, setManagingFlat] = useState(false);

  useEffect(() => {
    if (!editing) return;
    document.querySelector(".panel-edit")?.scrollIntoView({ block: "nearest" });
  }, [editing]);

  useEffect(() => {
    Promise.all([api.students(), api.groups()])
      .then(([st, gr]) => {
        setStudents(st);
        setGroups(gr);
      })
      .finally(() => setLoading(false));
  }, []);

  const roster = students.filter((s) => personCategory(s) === category);
  const searching = query.trim().length > 0;
  const filtered = roster.filter((s) => {
    const hay = personSearchHay(s).toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });
  const tree = useMemo(
    () => courseTree(groups, filtered, searching),
    [groups, filtered, searching]
  );

  const profileSuggestions = useMemo(
    () => buildProfileFieldSuggestions(students, PROFILE_SUGGEST_FIELD_KEYS),
    [students]
  );

  const toggleSet = (setter, key) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const syncPhotosMeta = useCallback(async () => {
    const list = await api.students();
    setStudents(list);
    setThumbVer((v) => v + 1);
    setEditing((cur) =>
      cur ? list.find((s) => s.id === cur.id) ?? cur : null
    );
  }, []);

  const handleCreate = async (body) => {
    const created = await api.createStudent({ ...body, category });
    try {
      for (const slot of [1, 2]) {
        if (draftPhotos[slot]) {
          await api.uploadPhoto(created.id, slot, draftPhotos[slot]);
        }
      }
      for (const [listKind, rows] of Object.entries(draftLists)) {
        for (const row of rows) {
          const payload = { ...row };
          delete payload._key;
          await api.createRecord(created.id, listKind, payload);
        }
      }
    } catch {
      /* карточка уже есть — остальное дописывается в ней */
    }
    navigate(`/students/${created.id}`, {
      state: { returnTo: personnelListReturn(category) },
    });
  };

  const handleUpdate = async (body) => {
    const updated = await api.updateStudent(editing.id, body);
    setStudents((list) =>
      list.map((s) => (s.id === updated.id ? updated : s))
    );
    setEditing(null);
  };

  const handleDelete = async (person) => {
    const ok = await ask({
      title: "Удалить человека?",
      message: `Карточка «${fullName(person)}» будет удалена из базы вместе с фото и связанными записями.`,
    });
    if (!ok) return;
    await api.deleteStudent(person.id);
    setStudents((list) => list.filter((s) => s.id !== person.id));
    if (editing?.id === person.id) setEditing(null);
  };

  if (loading) return <PageLoader label="Загрузка списка…" />;

  if (creating) {
    return (
      <div className="add-person">
        {kind.showImport ? (
          <DocxBatchImport
            groups={groups}
            category={category}
            onImported={syncPhotosMeta}
          />
        ) : null}
        <div className="add-person-layout">
          <section className="add-person-main">
            <p className="section-caption">Карточка</p>
            <h2>{kind.addTitle}</h2>
            <StudentForm
              variant="create"
              groups={groups}
              showGroup={kind.showGroup}
              submitLabel={kind.submit}
              profileSuggestions={profileSuggestions}
              onSubmit={handleCreate}
              onCancel={() => navigate(personnelListPath(category))}
              footer={
                <div className="add-person-photos add-person-photos--bottom">
                  <p className="section-caption">Фото</p>
                  <p className="muted">
                    Полный рост и по грудь. JPEG или PNG, до 5 МБ каждый.
                  </p>
                  <PhotoSlots
                    draftFiles={draftPhotos}
                    onDraftChange={(slot, file) =>
                      setDraftPhotos((d) => ({ ...d, [slot]: file }))
                    }
                  />
                </div>
              }
            >
              <DraftSection
                title="Семья (отец, мать, братья, сёстры)"
                fields={RELATIVE_FIELDS}
                summary={relativeSummary}
                items={draftLists.relatives}
                onChange={(relatives) => setDraftLists((lists) => ({ ...lists, relatives }))}
                addLabel="Добавить родственника"
                recordKind="relatives"
              />
              <DraftSection
                title="Данные на командиров"
                fields={COMMANDER_FIELDS}
                summary={commanderSummary}
                items={draftLists.commanders}
                onChange={(commanders) => setDraftLists((lists) => ({ ...lists, commanders }))}
                addLabel="Добавить командира"
                recordKind="commanders"
              />
              <DraftSection
                title="Работа в прошлом"
                fields={CAREER_FIELDS}
                summary={careerSummary}
                items={draftLists.career}
                onChange={(career) => setDraftLists((lists) => ({ ...lists, career }))}
                addLabel="Добавить период"
                recordKind="career"
              />
              <DraftSection
                title="Печальные события"
                fields={MOURNING_FIELDS}
                summary={mourningSummary}
                items={draftLists.mourning}
                onChange={(mourning) => setDraftLists((lists) => ({ ...lists, mourning }))}
                addLabel="Добавить событие"
                recordKind="mourning"
              />
            </StudentForm>
          </section>
        </div>
      </div>
    );
  }

  const finishManaging = (people) => {
    setEditing((cur) => (cur && people.some((person) => person.id === cur.id) ? null : cur));
  };

  const cadetRoster = category === "cadet";

  const peopleTable = (people, emptyText, managing) => (
    <div className="table-wrap roster-people">
      {people.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>№</th>
              <IdentityHeaderCells />
              <th>ФИО</th>
              <th>Фото</th>
              {!cadetRoster ? <th>Телефон</th> : null}
              {!cadetRoster ? <th>Дата рождения</th> : null}
              {managing ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {people.map((s, i) => (
              <tr key={s.id}>
                <td>{i + 1}</td>
                <IdentityCells person={s} />
                <td>
                  <Link
                    to={`/students/${s.id}`}
                    state={{ returnTo: personnelListReturn(category) }}
                    className="name-link"
                  >
                    {fullName(s)}
                  </Link>
                </td>
                <td className={cadetRoster ? "thumb-cell thumb-cell-bust" : "thumb-cell"}>
                  {cadetRoster ? (
                    asBool(s.has_photo_2) ? (
                      <img
                        className="thumb thumb-bust"
                        src={`${photoUrl(s.id, 2)}&v=${thumbVer}`}
                        alt=""
                      />
                    ) : (
                      <span className="thumb-empty thumb-bust" />
                    )
                  ) : (
                    [1, 2].map((slot) =>
                      asBool(s[`has_photo_${slot}`]) ? (
                        <img
                          key={slot}
                          className="thumb"
                          src={`${photoUrl(s.id, slot)}&v=${thumbVer}`}
                          alt=""
                        />
                      ) : (
                        <span key={slot} className="thumb-empty" />
                      )
                    )
                  )}
                </td>
                {!cadetRoster ? (
                  <td>
                    <a href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a>
                  </td>
                ) : null}
                {!cadetRoster ? <td>{formatDate(s.birth_date)}</td> : null}
                {managing ? (
                  <td className="row-actions">
                    <button type="button" className="btn btn-sm" onClick={() => setEditing(s)}>
                      Изменить
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <section className="card panel table-panel">
      <div className="card-head list-head">
        <div className="list-head-side">
          <Link to={newPersonPath(category)} className="btn primary btn-sm">
            {kind.addTitle}
          </Link>
          <p className="section-caption">
            В списке {filtered.length}{" "}
            {filtered.length === 1 ? "человек" : "чел."}
          </p>
        </div>
        <FioSearchField
          grow
          placeholder="Поиск по ФИО, должности, званию…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {editing && (
        <div className="panel panel-edit">
          <h3>Редактирование: {fullName(editing)}</h3>
          <PhotoSlots
            studentId={editing.id}
            hasPhoto1={asBool(editing.has_photo_1)}
            hasPhoto2={asBool(editing.has_photo_2)}
            onUploaded={syncPhotosMeta}
          />
          <StudentForm
            groups={groups}
            showGroup={kind.showGroup}
            initial={{
              last_name: editing.last_name,
              first_name: editing.first_name,
              patronymic: editing.patronymic ?? "",
              phone: editing.phone,
              birth_date: toInputDate(editing.birth_date),
              group_id: String(editing.group_id),
            }}
            submitLabel="Сохранить изменения"
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
          <div className="record-delete">
            <button type="button" className="btn danger" onClick={() => handleDelete(editing)}>
              Удалить запись
            </button>
          </div>
        </div>
      )}

      {listError && <p className="form-error">{listError}</p>}
      {kind.showGroup ? (
        filtered.length === 0 && roster.length === 0 ? (
          <p className="empty">В этом разделе пока никого нет.</p>
        ) : tree.courses.length === 0 && tree.loose.length === 0 ? (
          <p className="empty">Никого не найдено по запросу.</p>
        ) : (
          <div className="roster-tree">
            {tree.courses.map((course) => {
              const courseCount = course.groups.reduce((sum, g) => sum + g.people.length, 0);
              const courseOpened = searching || openCourses.has(course.code);
              return (
                <section
                  key={course.code}
                  className={`roster-node${courseCount === 0 ? " is-empty" : ""}`}
                >
                  <button
                    type="button"
                    className={`roster-toggle${courseOpened ? " is-open" : ""}`}
                    aria-expanded={courseOpened}
                    onClick={() => toggleSet(setOpenCourses, course.code)}
                  >
                    <Chevron />
                    <span className="roster-toggle-name">{course.code} курс</span>
                    <span className="roster-count">{courseCount}</span>
                  </button>
                  {courseOpened && (
                    <ul className="roster-groups">
                      {course.groups.map((group) => {
                        const groupOpened = searching || openGroups.has(group.id);
                        return (
                          <li key={group.id} className="roster-group">
                            <div className="roster-group-bar">
                              <button
                                type="button"
                                className={`roster-toggle roster-toggle-group${groupOpened ? " is-open" : ""}`}
                                aria-expanded={groupOpened}
                                onClick={() => toggleSet(setOpenGroups, group.id)}
                              >
                                <Chevron />
                                <span className="roster-toggle-name">{group.name}</span>
                                <span className="roster-count">{group.people.length}</span>
                              </button>
                              {groupOpened && group.people.length > 0 && (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => {
                                    const open = managingGroups.has(group.id);
                                    toggleSet(setManagingGroups, group.id);
                                    if (open) finishManaging(group.people);
                                  }}
                                >
                                  {managingGroups.has(group.id) ? "Готово" : "Изменить"}
                                </button>
                              )}
                            </div>
                            {groupOpened &&
                              peopleTable(
                                group.people,
                                "В группе пока никого нет.",
                                managingGroups.has(group.id)
                              )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
            {tree.loose.length > 0 && (
              <section className="roster-node">
                <div className="roster-group-bar">
                  <p className="roster-loose-title">Без группы</p>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setManagingFlat((open) => !open);
                      if (managingFlat) finishManaging(tree.loose);
                    }}
                  >
                    {managingFlat ? "Готово" : "Изменить"}
                  </button>
                </div>
                {peopleTable(tree.loose, "Никого не найдено по запросу.", managingFlat)}
              </section>
            )}
          </div>
        )
      ) : (
        <>
          {filtered.length > 0 && (
            <div className="roster-flat-tools">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setManagingFlat((open) => !open);
                  if (managingFlat) finishManaging(filtered);
                }}
              >
                {managingFlat ? "Готово" : "Изменить"}
              </button>
            </div>
          )}
          {peopleTable(
            filtered,
            roster.length === 0
              ? "В этом разделе пока никого нет."
              : "Никого не найдено по запросу.",
            managingFlat
          )}
        </>
      )}
    </section>
  );
}

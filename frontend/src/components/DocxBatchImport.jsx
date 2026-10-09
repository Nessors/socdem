import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const ACCEPT =
  ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function keyOf(file) {
  return `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`;
}

function isSocdemFile(file) {
  return /\.docx$/i.test(file.name) && !file.name.startsWith("~$");
}

function statsText(stats) {
  if (!stats) return "";
  const parts = [];
  if (stats.relatives) parts.push(`семья ${stats.relatives}`);
  if (stats.commanders) parts.push(`командиры ${stats.commanders}`);
  if (stats.career) parts.push(`работа ${stats.career}`);
  if (stats.mourning) parts.push(`печальные ${stats.mourning}`);
  parts.push(`фото ${stats.photos ?? 0}`);
  return parts.join(", ");
}

/**
 * Пакетная загрузка соцдемов (.docx) — папкой или списком файлов.
 * Группа определяется сервером по специальности и году набора; при
 * неоднозначности её можно поправить прямо в таблице.
 */
export default function DocxBatchImport({ groups, onImported }) {
  const [items, setItems] = useState([]);
  const [batchGroupId, setBatchGroupId] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const folderRef = useRef(null);
  const filesRef = useRef(null);

  const effectiveGroupId = (it) => it.groupId || batchGroupId || "";

  const update = (key, patch) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const addFiles = (fileList) => {
    const files = [...(fileList ?? [])].filter(isSocdemFile);
    setItems((prev) => {
      const seen = new Set(prev.map((i) => i.key));
      const next = files
        .filter((f) => !seen.has(keyOf(f)))
        .map((f) => ({
          key: keyOf(f),
          file: f,
          name: f.webkitRelativePath || f.name,
          status: "pending",
          groupId: "",
          result: null,
          error: "",
          payload: null,
        }));
      return [...prev, ...next];
    });
  };

  const onPick = (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  };

  const isRunnable = (it) => {
    if (it.status === "pending") return true;
    if (it.status !== "error") return false;
    if (it.payload?.group_resolution && !effectiveGroupId(it)) return false;
    return true;
  };

  const runImport = async () => {
    const targets = items.filter(isRunnable);
    if (targets.length === 0) return;
    setRunning(true);
    setProgress({ done: 0, total: targets.length });

    for (const it of targets) {
      update(it.key, { status: "uploading", error: "" });
      try {
        const gid = effectiveGroupId(it);
        const result = await api.importNewStudentDocx(it.file, gid || undefined);
        update(it.key, {
          status: "done",
          result,
          groupId: String(result.group?.id ?? ""),
          payload: null,
        });
      } catch (err) {
        update(it.key, {
          status: "error",
          error: err.message,
          payload: err.payload ?? null,
        });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setRunning(false);
    onImported?.();
  };

  const changeGroup = async (it, groupId) => {
    if (it.status === "done" && it.result?.student_id) {
      try {
        await api.updateStudent(it.result.student_id, { group_id: Number(groupId) });
        const g = groups.find((x) => String(x.id) === String(groupId)) ?? null;
        update(it.key, {
          groupId: String(groupId),
          result: {
            ...it.result,
            group: g ? { id: g.id, name: g.name } : it.result.group,
            group_resolution: {
              ...(it.result.group_resolution ?? {}),
              confidence: "manual",
              reason: "группа выбрана вручную",
            },
          },
        });
        onImported?.();
      } catch (err) {
        update(it.key, { error: err.message });
      }
      return;
    }
    const gid =
      groupId && batchGroupId && String(groupId) === String(batchGroupId) ? "" : groupId;
    update(it.key, { groupId: gid ? String(gid) : "" });
  };

  const clearList = () => {
    if (running) return;
    setItems([]);
    setProgress({ done: 0, total: 0 });
  };

  const runnableCount = items.filter(isRunnable).length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const checkCount = items.filter(
    (i) => i.status === "done" && i.result?.group_resolution?.confidence === "ambiguous"
  ).length;

  return (
    <div className="panel docx-batch">
      <h3>Загрузка соцдемов (Word .docx) — папкой или файлами</h3>
      <p className="muted csv-hint">
        По умолчанию группа берётся из документа (специальность и год набора). Можно
        задать <strong>одну группу для всей папки</strong> — тогда все файлы попадут в
        неё (в таблице можно переопределить для отдельного человека). Повторная
        загрузка обновляет карточку, а не создаёт дубль.
      </p>

      <label className="docx-batch-group-all">
        <span>Группа для всех файлов</span>
        <select
          value={batchGroupId}
          disabled={running}
          onChange={(e) => setBatchGroupId(e.target.value)}
        >
          <option value="">Авто (из каждого соцдема)</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} — для всей загрузки
            </option>
          ))}
        </select>
      </label>

      <div className="docx-batch-actions">
        <label className={`btn primary file-btn${running ? " disabled" : ""}`}>
          Выбрать папку
          <input
            ref={folderRef}
            type="file"
            accept={ACCEPT}
            multiple
            webkitdirectory=""
            directory=""
            hidden
            disabled={running}
            onChange={onPick}
          />
        </label>
        <label className={`btn file-btn${running ? " disabled" : ""}`}>
          Выбрать файлы
          <input
            ref={filesRef}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            disabled={running}
            onChange={onPick}
          />
        </label>
        <button
          type="button"
          className="btn primary"
          disabled={running || runnableCount === 0}
          onClick={runImport}
        >
          {running
            ? `Загрузка… ${progress.done} / ${progress.total}`
            : `Загрузить (${runnableCount})`}
        </button>
        {items.length > 0 && (
          <button type="button" className="btn" disabled={running} onClick={clearList}>
            Очистить список
          </button>
        )}
      </div>

      {items.length > 0 && (
        <p className="muted docx-batch-summary">
          Файлов: {items.length}. Загружено: {doneCount}. Ошибок: {errorCount}.
          {batchGroupId &&
            ` Общая группа: ${groups.find((g) => String(g.id) === batchGroupId)?.name ?? batchGroupId}.`}
          {checkCount > 0 && ` Проверьте группу: ${checkCount}.`}
        </p>
      )}

      {items.length > 0 && (
        <div className="table-wrap dark-table docx-batch-table">
          <table>
            <thead>
              <tr>
                <th>Файл</th>
                <th>ФИО</th>
                <th>Группа</th>
                <th>Как определена</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const res = it.result;
                const resolution = res?.group_resolution ?? it.payload?.group_resolution;
                const fio = res?.fio ?? it.payload?.preview?.fio ?? "—";
                const ambiguous = resolution?.confidence === "ambiguous";
                const needsGroup =
                  it.status === "error" &&
                  it.payload?.group_resolution != null &&
                  !effectiveGroupId(it);
                const rowGroupValue = it.groupId || batchGroupId || "";

                return (
                  <tr key={it.key} className={`docx-row ${it.status}`}>
                    <td className="docx-file" title={it.name}>
                      {it.name}
                    </td>
                    <td>
                      {res?.student_id ? (
                        <Link to={`/students/${res.student_id}`}>{fio}</Link>
                      ) : (
                        fio
                      )}
                    </td>
                    <td>
                      <select
                        className={ambiguous || needsGroup ? "select-warn" : undefined}
                        value={rowGroupValue}
                        disabled={running}
                        onChange={(e) => changeGroup(it, e.target.value)}
                      >
                        <option value="">
                          {batchGroupId
                            ? `как для всех (${groups.find((g) => String(g.id) === batchGroupId)?.name ?? "общая"})`
                            : "авто из документа"}
                        </option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="docx-reason">
                      {it.status === "pending" && batchGroupId && !it.groupId
                        ? `Общая группа: ${groups.find((g) => String(g.id) === batchGroupId)?.name ?? batchGroupId}`
                        : resolution?.reason ??
                          (it.status === "pending"
                            ? "определится при загрузке"
                            : "—")}
                    </td>
                    <td className="docx-status">
                      {it.status === "pending" && <span className="badge">ожидает</span>}
                      {it.status === "uploading" && (
                        <span className="badge">загрузка…</span>
                      )}
                      {it.status === "done" && (
                        <>
                          <span className={`badge ${ambiguous ? "warn" : "ok"}`}>
                            {res.action === "updated" ? "обновлён" : "создан"}
                            {ambiguous ? " · проверьте группу" : ""}
                          </span>
                          <span className="muted"> {statsText(res.stats)}</span>
                          {res.warnings?.length > 0 && (
                            <span className="muted"> {res.warnings.join(" ")}</span>
                          )}
                        </>
                      )}
                      {it.status === "error" && (
                        <>
                          <span className="badge err">ошибка</span>
                          <span className="form-error inline"> {it.error}</span>
                          {needsGroup && (
                            <span className="muted">
                              {" "}
                              Выберите группу и нажмите «Загрузить».
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

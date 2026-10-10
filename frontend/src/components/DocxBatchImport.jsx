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

function sizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function readEntries(reader) {
  return new Promise((resolve, reject) => {
    const all = [];
    const read = () => {
      reader.readEntries((batch) => {
        if (!batch.length) resolve(all);
        else {
          all.push(...batch);
          read();
        }
      }, reject);
    };
    read();
  });
}

async function fileFromEntry(entry) {
  return new Promise((resolve) => entry.file(resolve));
}

async function collectEntry(entry, out) {
  if (!entry) return;
  if (entry.isFile) {
    out.push(await fileFromEntry(entry));
    return;
  }
  if (entry.isDirectory) {
    const children = await readEntries(entry.createReader());
    for (const child of children) await collectEntry(child, out);
  }
}

async function filesFromList(dataTransfer) {
  const items = [...(dataTransfer.items ?? [])];
  const entries = items
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean);
  if (!entries.length) return [...(dataTransfer.files ?? [])];
  const out = [];
  for (const entry of entries) await collectEntry(entry, out);
  return out;
}

function DocIcon() {
  return (
    <svg className="docx-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 2.5h7.2L19.5 8v13.5a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 21.5v-17A1.5 1.5 0 0 1 7 2.5Zm6.5 1.8V8h3.6l-3.6-3.7ZM8.2 12.2h7.6v1.4H8.2v-1.4Zm0 3h7.6v1.4H8.2v-1.4Zm0 3h5.2v1.4H8.2v-1.4Z"
      />
    </svg>
  );
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
export default function DocxBatchImport({ groups = [], category = "cadet", onImported }) {
  const isCadet = category === "cadet";
  const [items, setItems] = useState([]);
  const [batchGroupId, setBatchGroupId] = useState("");
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
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

  const onDrop = async (event) => {
    event.preventDefault();
    setDragOver(false);
    const dropped = await filesFromList(event.dataTransfer);
    addFiles(dropped);
  };

  const removeItem = (key) => {
    if (running) return;
    setItems((list) => list.filter((it) => it.key !== key));
  };

  const isRunnable = (it) => {
    if (it.status === "pending") return true;
    if (it.status !== "error") return false;
    if (isCadet && it.payload?.group_resolution && !effectiveGroupId(it)) return false;
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
        const result = await api.importNewStudentDocx(it.file, {
          groupId: isCadet ? gid || undefined : undefined,
          category,
        });
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
    if (!isCadet) return;
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
    <section className="docx-batch" aria-label="Загрузка соцдемов">
      <header className="docx-batch-head">
        <p className="section-caption">Word</p>
        <h3>Загрузка соцдемов</h3>
        <p className="muted">
          {isCadet
            ? "Перетащите файлы .docx или выберите папку. Группа берётся из документа. Повторная загрузка обновляет карточку, а не создаёт дубль."
            : "Перетащите файлы .docx или выберите папку. Запись попадёт в этот раздел. Повторная загрузка того же человека обновляет карточку."}
        </p>
      </header>

      <div
        className={`docx-drop${dragOver ? " is-over" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false);
        }}
        onDrop={onDrop}
      >
        <span className="docx-drop-mark">
          <DocIcon />
        </span>
        <p className="docx-drop-title">
          {dragOver ? "Отпустите файлы" : "Перетащите соцдемы сюда"}
        </p>
        <p className="docx-drop-hint">Файлы .docx или целая папка</p>
        <div className="docx-drop-actions">
          <label className={`btn file-btn${running ? " disabled" : ""}`}>
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
          <label className={`btn primary file-btn${running ? " disabled" : ""}`}>
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
        </div>
      </div>

      {isCadet ? (
        <label className="docx-batch-group-all">
          <span>Группа для всех файлов</span>
          <select
            value={batchGroupId}
            disabled={running}
            onChange={(e) => setBatchGroupId(e.target.value)}
          >
            <option value="">Авто, из каждого соцдема</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {running && (
        <div className="docx-progress" aria-hidden="true">
          <span
            style={{
              width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
            }}
          />
        </div>
      )}

      {items.length > 0 && (
        <ul className="docx-file-list">
          {items.map((it) => {
            const res = it.result;
            const resolution = res?.group_resolution ?? it.payload?.group_resolution;
            const fio = res?.fio ?? it.payload?.preview?.fio ?? "";
            const ambiguous = resolution?.confidence === "ambiguous";
            const needsGroup =
              isCadet &&
              it.status === "error" &&
              it.payload?.group_resolution != null &&
              !effectiveGroupId(it);
            const rowGroupValue = it.groupId || batchGroupId || "";
            const reason = !isCadet
              ? it.status === "pending"
                ? "Офицер / гражданский персонал"
                : ""
              : it.status === "pending" && batchGroupId && !it.groupId
                ? `Общая группа: ${groups.find((g) => String(g.id) === batchGroupId)?.name ?? batchGroupId}`
                : resolution?.reason ??
                  (it.status === "pending" ? "Группа определится при загрузке" : "");

            return (
              <li key={it.key} className={`docx-file-row ${it.status}`}>
                <span className="docx-file-mark">
                  <DocIcon />
                </span>
                <div className="docx-file-copy">
                  <p className="docx-file-name" title={it.name}>
                    {it.name}
                  </p>
                  <p className="docx-file-meta">
                    {sizeLabel(it.file.size)}
                    {fio ? ` · ${fio}` : ""}
                    {reason ? ` · ${reason}` : ""}
                  </p>
                  {it.status === "error" && (
                    <p className="form-error">
                      {it.error}
                      {needsGroup ? " Выберите группу и нажмите «Загрузить»." : ""}
                    </p>
                  )}
                  {it.status === "done" && (
                    <p className="docx-file-meta">
                      {res?.student_id ? (
                        <Link to={`/students/${res.student_id}`}>Открыть карточку</Link>
                      ) : null}
                      {statsText(res?.stats) ? ` · ${statsText(res.stats)}` : ""}
                    </p>
                  )}
                </div>
                {isCadet ? (
                  <select
                    className={ambiguous || needsGroup ? "select-warn" : undefined}
                    aria-label="Группа"
                    value={rowGroupValue}
                    disabled={running}
                    onChange={(e) => changeGroup(it, e.target.value)}
                  >
                    <option value="">
                      {batchGroupId
                        ? `Как для всех (${groups.find((g) => String(g.id) === batchGroupId)?.name ?? "общая"})`
                        : "Авто из документа"}
                    </option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="docx-file-status" aria-hidden="true" />
                )}
                <div className="docx-file-status">
                  {it.status === "pending" && <span className="badge">ожидает</span>}
                  {it.status === "uploading" && <span className="badge">загрузка…</span>}
                  {it.status === "done" && (
                    <span className={`badge ${ambiguous ? "warn" : "ok"}`}>
                      {res.action === "updated" ? "обновлён" : "создан"}
                    </span>
                  )}
                  {it.status === "error" && <span className="badge err">ошибка</span>}
                </div>
                <button
                  type="button"
                  className="docx-file-remove"
                  aria-label="Убрать файл из списка"
                  disabled={running}
                  onClick={() => removeItem(it.key)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="docx-batch-foot">
        <p className="muted">
          {items.length === 0
            ? "Файлы ещё не выбраны."
            : `Файлов: ${items.length}. Загружено: ${doneCount}. Ошибок: ${errorCount}.${
                isCadet && checkCount ? ` Проверьте группу: ${checkCount}.` : ""
              }`}
        </p>
        <div className="docx-batch-actions">
          {items.length > 0 && (
            <button type="button" className="btn" disabled={running} onClick={clearList}>
              Очистить
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={running || runnableCount === 0}
            onClick={runImport}
          >
            {running
              ? `Загрузка… ${progress.done} / ${progress.total}`
              : `Загрузить${runnableCount ? ` (${runnableCount})` : ""}`}
          </button>
        </div>
      </footer>
    </section>
  );
}

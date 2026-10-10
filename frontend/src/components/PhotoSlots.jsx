import { useEffect, useState } from "react";
import { api, photoUrl } from "../api";
import { useConfirm } from "./ConfirmDialog.jsx";

export default function PhotoSlots({
  studentId,
  hasPhoto1,
  hasPhoto2,
  onUploaded,
  draftFiles,
  onDraftChange,
}) {
  const ask = useConfirm();
  const [cache, setCache] = useState(0);

  useEffect(() => {
    setCache(0);
  }, [studentId]);

  useEffect(() => {
    setCache((c) => c + 1);
  }, [hasPhoto1, hasPhoto2]);

  const bump = () => {
    setCache((c) => c + 1);
    onUploaded?.();
  };

  const upload = async (slot, file) => {
    if (!file) return;
    if (studentId) {
      await api.uploadPhoto(studentId, slot, file);
      bump();
    } else if (onDraftChange) {
      onDraftChange(slot, file);
    }
  };

  const remove = async (slot, label) => {
    const ok = await ask({
      title: "Удалить фото?",
      message: `Фото «${label}» будет удалено.`,
    });
    if (!ok) return;
    if (studentId) {
      await api.deletePhoto(studentId, slot);
      bump();
    } else if (onDraftChange) {
      onDraftChange(slot, null);
    }
  };

  const slots = [
    { slot: 1, label: "В полный рост", kind: "full", has: hasPhoto1, draft: draftFiles?.[1] },
    { slot: 2, label: "По грудь", kind: "bust", has: hasPhoto2, draft: draftFiles?.[2] },
  ];

  return (
    <div className="photo-slots">
      {slots.map(({ slot, label, kind, has, draft }) => (
          <PhotoSlot
            key={slot}
            slot={slot}
            label={label}
            kind={kind}
            studentId={studentId}
            has={has}
            draft={draft}
            cache={cache}
            onUpload={upload}
            onRemove={remove}
          />
        ))}
    </div>
  );
}

function PhotoSlot({ slot, label, kind, studentId, has, draft, cache, onUpload, onRemove }) {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (studentId || !draft) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(draft);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [studentId, draft]);

  const src = studentId
    ? has
      ? `${photoUrl(studentId, slot)}&v=${cache}`
      : null
    : preview;

  return (
          <div className={`photo-slot photo-slot-${kind}`}>
            <p className="photo-label">{label}</p>
            <div className="photo-preview">
              {src ? (
                <img src={src} alt={label} />
              ) : (
                <span className="photo-placeholder">Нет фото</span>
              )}
            </div>
            <label className="btn btn-sm primary file-btn">
              {has || draft ? "Заменить" : "Загрузить"}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  onUpload(slot, f);
                  e.target.value = "";
                }}
              />
            </label>
            {(has || draft) && (
              <button
                type="button"
                className="btn btn-sm danger"
                onClick={() => onRemove(slot, label)}
              >
                Удалить
              </button>
            )}
          </div>
  );
}

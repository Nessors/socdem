import { useEffect, useState } from "react";
import { api, photoUrl } from "../api";

export default function PhotoSlots({
  studentId,
  hasPhoto1,
  hasPhoto2,
  onUploaded,
  draftFiles,
  onDraftChange,
}) {
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

  const remove = async (slot) => {
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
      {slots.map(({ slot, label, kind, has, draft }) => {
        const src = studentId
          ? has
            ? `${photoUrl(studentId, slot)}&v=${cache}`
            : null
          : draft
            ? URL.createObjectURL(draft)
            : null;

        return (
          <div key={slot} className={`photo-slot photo-slot-${kind}`}>
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
                  upload(slot, f);
                  e.target.value = "";
                }}
              />
            </label>
            {(has || draft) && (
              <button
                type="button"
                className="btn btn-sm danger"
                onClick={() => remove(slot)}
              >
                Удалить
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

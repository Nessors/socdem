import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ConfirmContext = createContext(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolver = useRef(null);
  const cancelRef = useRef(null);

  const ask = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setRequest({
        title: options.title || "Удалить?",
        message: options.message || "Это действие нельзя отменить.",
        confirmLabel: options.confirmLabel || "Удалить",
        cancelLabel: options.cancelLabel || "Отмена",
        confirmTone: options.confirmTone === "primary" ? "primary" : "danger",
      });
    });
  }, []);

  const finish = useCallback((ok) => {
    resolver.current?.(ok);
    resolver.current = null;
    setRequest(null);
  }, []);

  useEffect(() => {
    if (!request) return undefined;
    cancelRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, finish]);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {request
        ? createPortal(
            <div
              className="confirm-backdrop"
              onMouseDown={() => finish(false)}
            >
              <div
                className="confirm-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                aria-describedby="confirm-message"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <h2 id="confirm-title">{request.title}</h2>
                <p id="confirm-message" className="confirm-message">
                  {request.message}
                </p>
                <div className="confirm-actions">
                  <button
                    type="button"
                    className="btn"
                    ref={cancelRef}
                    onClick={() => finish(false)}
                  >
                    {request.cancelLabel}
                  </button>
                  <button
                    type="button"
                    className={
                      request.confirmTone === "primary" ? "btn primary" : "btn danger"
                    }
                    onClick={() => finish(true)}
                  >
                    {request.confirmLabel}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </ConfirmContext.Provider>
  );
}

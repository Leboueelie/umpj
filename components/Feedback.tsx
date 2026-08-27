"use client";

import { useState, useCallback } from "react";

type ConfirmState = {
  message: string;
  confirmLabel: string;
  resolve: (v: boolean) => void;
};

type ToastItem = {
  id: number;
  message: string;
  type: "success" | "error";
};

export function useFeedback() {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const confirm = useCallback((message: string, confirmLabel = "Supprimer") => {
    return new Promise<boolean>((resolve) =>
      setConfirmState({ message, confirmLabel, resolve })
    );
  }, []);

  const toast = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const closeConfirm = (value: boolean) => {
    if (!confirmState) return;
    const r = confirmState.resolve;
    setConfirmState(null);
    r(value);
  };

  const node = (
    <>
      {confirmState && (
        <div className="modal-backdrop" onClick={() => closeConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="modal-msg">{confirmState.message}</p>
            <div className="form-actions">
              <button className="btn danger" type="button" onClick={() => closeConfirm(true)}>
                {confirmState.confirmLabel}
              </button>
              <button className="btn secondary" type="button" onClick={() => closeConfirm(false)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.type}`}
            onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
          >
            {t.message}
          </div>
        ))}
      </div>
    </>
  );

  return { confirm, toast, node };
}

"use client";

import { useState, useCallback } from "react";

type ConfirmState = {
  message: string;
  confirmLabel: string;
  resolve: (v: boolean) => void;
};

type PromptState = {
  message: string;
  placeholder: string;
  defaultValue: string;
  resolve: (v: string | null) => void;
};

type ToastItem = {
  id: number;
  message: string;
  type: "success" | "error";
};

export function useFeedback() {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const confirm = useCallback((message: string, confirmLabel = "Supprimer") => {
    return new Promise<boolean>((resolve) =>
      setConfirmState({ message, confirmLabel, resolve })
    );
  }, []);

  const prompt = useCallback((message: string, placeholder = "", defaultValue = "") => {
    return new Promise<string | null>((resolve) => {
      setPromptValue(defaultValue);
      setPromptState({ message, placeholder, defaultValue, resolve });
    });
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

  const closePrompt = (value: string | null) => {
    if (!promptState) return;
    const r = promptState.resolve;
    setPromptState(null);
    setPromptValue("");
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
      {promptState && (
        <div className="modal-backdrop" onClick={() => closePrompt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="modal-msg">{promptState.message}</p>
            <input
              type="text"
              className="modal-input"
              placeholder={promptState.placeholder}
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && promptValue.trim()) {
                  closePrompt(promptValue.trim());
                } else if (e.key === "Escape") {
                  closePrompt(null);
                }
              }}
              autoFocus
            />
            <div className="form-actions">
              <button
                className="btn"
                type="button"
                onClick={() => closePrompt(promptValue.trim())}
                disabled={!promptValue.trim()}
              >
                Créer
              </button>
              <button className="btn secondary" type="button" onClick={() => closePrompt(null)}>
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

  return { confirm, prompt, toast, node };
}

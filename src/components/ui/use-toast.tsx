"use client";

import { createContext, useCallback, useContext, useState } from "react";
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

type ToastAction = {
  label: string;
  onClick: () => void | Promise<void>;
};

type ToastMessage = {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
  durationMs?: number;
  action?: ToastAction;
};

const ToastContext = createContext<{
  toast: (msg: Omit<ToastMessage, "id">) => void;
  dismiss: (id: string) => void;
} | null>(null);

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((msg: Omit<ToastMessage, "id">) => {
    const id = crypto.randomUUID();
    const durationMs = msg.durationMs ?? (msg.action ? 12_000 : 4_000);
    setToasts((prev) => [...prev, { ...msg, id, durationMs }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, durationMs);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      <ToastProvider>
        {children}
        {toasts.map((t) => (
          <Toast key={t.id} variant={t.variant} open duration={t.durationMs ?? 4000}>
            <div className="grid gap-2">
              <ToastTitle>{t.title}</ToastTitle>
              {t.description && <ToastDescription>{t.description}</ToastDescription>}
              {t.action ? (
                <button
                  type="button"
                  className="mt-1 w-fit rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                  onClick={() => {
                    void Promise.resolve(t.action!.onClick()).finally(() => dismiss(t.id));
                  }}
                >
                  {t.action.label}
                </button>
              ) : null}
            </div>
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToasterProvider");
  return ctx;
}

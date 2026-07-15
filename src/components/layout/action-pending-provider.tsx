"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

type ActionPendingContextValue = {
  begin: () => void;
  end: () => void;
};

const ActionPendingContext = createContext<ActionPendingContextValue | null>(null);

export function ActionPendingProvider({ children }: { children: React.ReactNode }) {
  const countRef = useRef(0);
  const [active, setActive] = useState(false);

  const begin = useCallback(() => {
    countRef.current += 1;
    setActive(true);
  }, []);

  const end = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1);
    setActive(countRef.current > 0);
  }, []);

  useEffect(() => {
    document.body.style.cursor = active ? "wait" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [active]);

  return (
    <ActionPendingContext.Provider value={{ begin, end }}>
      {active ? (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 bg-primary/20"
          role="status"
          aria-live="polite"
          aria-label="Loading"
        >
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : null}
      {children}
    </ActionPendingContext.Provider>
  );
}

function useActionPendingContext() {
  return useContext(ActionPendingContext);
}

export function usePendingTransition() {
  const ctx = useActionPendingContext();
  const [isPending, startTransition] = useTransition();

  const run = useCallback(
    (fn: () => Promise<void>) => {
      ctx?.begin();
      startTransition(async () => {
        try {
          await fn();
        } finally {
          ctx?.end();
        }
      });
    },
    [ctx, startTransition]
  );

  return { isPending, run };
}

export function useKeyedPending() {
  const ctx = useActionPendingContext();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = useCallback(
    (key: string, fn: () => Promise<void>) => {
      setPendingKey(key);
      ctx?.begin();
      startTransition(async () => {
        try {
          await fn();
        } finally {
          setPendingKey(null);
          ctx?.end();
        }
      });
    },
    [ctx, startTransition]
  );

  const isKeyPending = useCallback(
    (key: string) => isPending && pendingKey === key,
    [isPending, pendingKey]
  );

  return { run, isKeyPending, isPending };
}

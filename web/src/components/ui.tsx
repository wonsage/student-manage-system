import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

/* ---------- Spinner / Empty ---------- */
export function Spinner() {
  return (
    <div className="center">
      <div className="spinner" />
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <div className="icon">🗂️</div>
      <div>{text}</div>
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({
  status,
  children,
}: {
  status: string;
  children: ReactNode;
}) {
  return <span className={`badge ${status}`}>{children}</span>;
}

/* ---------- Modal ---------- */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex between mb-16">
          <h3>{title}</h3>
          <button className="btn small" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Toast ---------- */
interface ToastState {
  id: number;
  type: "ok" | "err";
  text: string;
}

const ToastContext = createContext<(type: "ok" | "err", text: string) => void>(
  () => {}
);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const push = useCallback((type: "ok" | "err", text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div>
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

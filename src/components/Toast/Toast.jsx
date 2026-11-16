import { useEffect, useState, useCallback } from 'react';
import './Toast.css';

const ICONES = {
  success: 'fi-br-check',
  warning: 'fi-br-triangle-warning',
  error: 'fi-br-cross-circle',
  info: 'fi-br-info'
};

function ToastItem({ id, message, type = 'error', onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose && onClose(id), 3500);
    return () => clearTimeout(timer);
  }, [id, onClose]);

  const iconClass = ICONES[type] || ICONES.info;

  // Erros usam role="alert" (anúncio imediato); os demais ficam na região polite do container.
  return (
    <div className={`toast toast--${type}`} role={type === 'error' ? 'alert' : undefined}>
      <i className={`fi ${iconClass} toast__icon`} aria-hidden="true" />
      <div className="toast__body">{message}</div>
      <button className="toast__close" onClick={() => onClose && onClose(id)} aria-label="Fechar" title="Fechar">
        <i className="fi fi-br-cross-small" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    // Normaliza apelidos ('warn', 'err') para as classes CSS existentes
    let normalized = (type || 'info').toString().toLowerCase();
    if (normalized === 'warn') normalized = 'warning';
    if (normalized === 'err') normalized = 'error';
    const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    setToasts(prev => [...prev, { id, message, type: normalized }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

export default function ToastContainer({ toasts = [], removeToast = () => {} }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map(t => (
        <ToastItem key={t.id} {...t} onClose={removeToast} />
      ))}
    </div>
  );
}

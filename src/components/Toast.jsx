import { useEffect } from 'react';
import './Toast.css';

export function Toast({ message, actionLabel, onAction, variant = 'success', duration = 5000, onClose }) {
  useEffect(() => {
    if (!duration) return undefined;
    const timer = setTimeout(() => {
      if (onClose) onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!message) return null;

  return (
    <div className="toast-container">
      <div className={`toast toast-${variant}`}>
        <span className="toast-message">{message}</span>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              onAction();
              if (onClose) onClose();
            }}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

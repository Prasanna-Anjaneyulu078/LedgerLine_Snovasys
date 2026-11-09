import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import './index.css';

const ConfirmModal = ({
  isOpen,
  title,
  children,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onClose,
  onCancel,
  cancelIcon,
  isDestructive = false,
  isLoading = false,
  isCancelLoading = false,
  maxWidth,
  hideCancel = false,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isLoading && onClose) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog"
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        <div className="modal-footer">
          {!hideCancel && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onCancel || onClose}
              disabled={isLoading || isCancelLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {cancelIcon}
              <span>{isCancelLoading ? 'Preparing...' : cancelText}</span>
            </button>
          )}
          {(onConfirm || hideCancel) && (
            <button
              type="button"
              className={`${isDestructive ? 'btn-destructive' : 'btn-primary'} ${
                isLoading ? 'btn-disabled' : ''
              }`}
              onClick={onConfirm || onClose}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;

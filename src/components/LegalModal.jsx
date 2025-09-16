import React, { useEffect } from 'react';

export default function LegalModal({ open, url, title, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative rounded-lg shadow-xl w-[90vw] h-[85vh] max-w-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(rgba(255,255,255,0.08), rgba(255,255,255,0.08)), linear-gradient(135deg, #d95cff 0%, #c026d3 50%, #a855f7 100%)',
          border: '4px solid rgba(255,255,255,0.75)',
          padding: '10px'
        }}
      >
        <button
          type="button"
          aria-label="Lukk"
          onClick={onClose}
          className="text-white/90 hover:text-white"
          style={{ position: 'absolute', top: 8, right: 12, zIndex: 10, fontSize: 18 }}
        >
          ×
        </button>
        <div className="w-full h-full">
          <iframe
            title={title || 'Innhold'}
            src={url}
            className="w-full h-full"
            style={{ border: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}



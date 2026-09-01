export default function Modal({ open, title, onClose, children }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-paper dark:bg-panel rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-line">
          <h3 className="font-display font-semibold text-ink dark:text-paper">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink/40 dark:text-mist hover:text-ink/70 dark:hover:text-paper text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

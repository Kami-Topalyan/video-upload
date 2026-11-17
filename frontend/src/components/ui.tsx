import { useEffect, type ReactNode } from "react";

// Class names shared by the sign-in and create-room dialogs.

export const labelClass =
  "mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300";

export const inputClass =
  "w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-(--surface) dark:text-white";

export const submitButtonClass =
  "flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60";

export function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
    >
      {children}
    </div>
  );
}

interface ModalProps {
  onClose: () => void;
  /** While true (e.g. a request is in flight) the dialog can't be dismissed. */
  busy?: boolean;
  /** id of the element that titles the dialog, or a plain label if there is no visible title. */
  labelledBy?: string;
  label?: string;
  children: ReactNode;
}

/** Backdrop + dialog with a close button; closes on Escape or a click outside. */
export function Modal({ onClose, busy = false, labelledBy, label, children }: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={label}
        className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-(--surface)"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close modal"
          className="absolute right-5 top-5 rounded-lg p-2 text-gray-400 transition hover:text-gray-300 "
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {children}
      </div>
    </div>
  );
}

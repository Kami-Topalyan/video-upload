import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";

interface Props {
  onFiles: (files: File[]) => void;
  /** Value for the file picker's `accept` attribute. */
  accept?: string;
  title?: string;
  hint?: string;
  /** When true the zone ignores clicks and drops (e.g. every slot is already filled). */
  disabled?: boolean;
}

export function Dropzone({
  onFiles,
  accept,
  title = "Drop files here",
  hint = "or click to browse",
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) onFiles(Array.from(e.dataTransfer.files));
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(e.target.files ?? []));
    e.target.value = ""; // allow picking the same file again
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  };

  return (
    <div
      className={`dropzone${dragging ? " dropzone--active" : ""} h-min`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept || undefined}
        hidden
        disabled={disabled}
        onChange={handleChange}
      />
      <p className="dropzone__title">{title}</p>
      <p className="dropzone__hint">{hint}</p>
    </div>
  );
}

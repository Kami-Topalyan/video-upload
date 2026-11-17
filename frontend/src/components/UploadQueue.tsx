import { formatBytes } from "../format";
import type { UploadItem } from "../types";

interface Props {
  items: UploadItem[];
  onCancel: (id: number) => void;
  onDismiss: (id: number) => void;
}

const STATUS_LABEL: Record<UploadItem["status"], string> = {
  uploading: "Uploading",
  done: "Done",
  error: "Failed",
  cancelled: "Cancelled",
};

export function UploadQueue({ items, onCancel, onDismiss }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="card" aria-label="Uploads in progress">
      <h2>Uploads</h2>
      <ul className="list">
        {items.map((item) => (
          <li key={item.id} className="row">
            <div className="row__main">
              <span className="row__name">{item.name}</span>
              <span className="row__meta">
                {formatBytes(item.size)} · {STATUS_LABEL[item.status]}
                {item.error ? ` - ${item.error}` : ""}
              </span>
              {item.status === "uploading" && (
                <progress value={item.progress} max={100} aria-label={`Uploading ${item.name}`} />
              )}
            </div>
            {item.status === "uploading" ? (
              <button type="button" className="btn btn--ghost" onClick={() => onCancel(item.id)}>
                Cancel
              </button>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={() => onDismiss(item.id)}>
                Dismiss
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

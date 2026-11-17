import { formatBytes, formatDate } from "../format";
import type { UploadedFile } from "../types";

interface Props {
  files: UploadedFile[];
  canDelete: (file: UploadedFile) => boolean;
  /** Short description of the requirement a file was uploaded for, if any. */
  requirementName?: (file: UploadedFile) => string | null;
  onDownload: (file: UploadedFile) => void;
  onDelete: (file: UploadedFile) => void;
}

export function FileList({ files, canDelete, requirementName, onDownload, onDelete }: Props) {
  return (
    <section className="bg-(--surface) border border-(--border) p-4 rounded-md h-min" aria-label="Uploaded files">
      <h2>Files</h2>
      {files.length === 0 ? (
        <p className="muted">Nothing uploaded yet.</p>
      ) : (
        <ul className="list">
          {files.map((file) => (
            <li key={file.id} className="row">
              <div className="row__main">
                <span className="row__name">{file.original_name}</span>
                <span className="row__meta">
                  {formatBytes(file.size_bytes)} · {formatDate(file.created_at)}
                  {file.uploaded_by_username ? ` · ${file.uploaded_by_username}` : ""}
                  {requirementName?.(file) ? ` · ${requirementName(file)}` : ""}
                </span>
              </div>
              <button type="button" className="btn" onClick={() => onDownload(file)}>
                Download
              </button>
              {canDelete(file) && (
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => {
                    if (window.confirm(`Delete "${file.original_name}"?`)) onDelete(file);
                  }}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

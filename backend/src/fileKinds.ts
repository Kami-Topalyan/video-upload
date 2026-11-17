import path from "node:path";

// The kinds of file a room can ask for. Keep in sync with frontend/src/fileKinds.ts
// and the CHECK constraint on room_requirements.kind.

interface KindRule {
  label: string;
  extensions: readonly string[];
  /** Also accept anything the browser reports with this MIME prefix. */
  mimePrefix?: string;
}

export const FILE_KINDS = {
  video: {
    label: "Video",
    extensions: [".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".mpg", ".mpeg", ".wmv", ".mxf", ".mts", ".m2ts"],
    mimePrefix: "video/",
  },
  image: {
    label: "Image",
    extensions: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".tif", ".tiff", ".bmp", ".svg", ".raw", ".dng"],
    mimePrefix: "image/",
  },
  audio: {
    label: "Audio",
    extensions: [".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg", ".opus", ".aif", ".aiff"],
    mimePrefix: "audio/",
  },
  document: {
    label: "Document",
    extensions: [".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt", ".xls", ".xlsx", ".csv", ".ppt", ".pptx"],
  },
  archive: {
    label: "Archive",
    extensions: [".zip", ".rar", ".7z", ".tar", ".gz", ".tgz"],
  },
  any: { label: "Any file", extensions: [] },
} as const satisfies Record<string, KindRule>;

export type FileKind = keyof typeof FILE_KINDS;

export const isFileKind = (value: unknown): value is FileKind =>
  typeof value === "string" && Object.hasOwn(FILE_KINDS, value);

/** Does a file with this name / browser-reported MIME type satisfy `kind`? */
export function matchesKind(kind: FileKind, filename: string, mimeType: string | undefined): boolean {
  if (kind === "any") return true;
  const rule: KindRule = FILE_KINDS[kind];
  const ext = path.extname(filename).toLowerCase();
  if (rule.extensions.includes(ext)) return true;
  return rule.mimePrefix !== undefined && (mimeType ?? "").toLowerCase().startsWith(rule.mimePrefix);
}

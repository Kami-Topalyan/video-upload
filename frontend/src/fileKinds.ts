import type { FileKind } from "./types";

// Keep in sync with backend/src/fileKinds.ts. The server is the one that enforces this;
// the browser copy only filters the file picker and gives instant feedback.

interface KindInfo {
  label: string;
  /** Plural noun for sentences like "2 videos". */
  plural: string;
  extensions: string[];
  mimePrefix?: string;
}

export const FILE_KINDS: Record<FileKind, KindInfo> = {
  video: {
    label: "Video",
    plural: "videos",
    extensions: [".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".mpg", ".mpeg", ".wmv", ".mxf", ".mts", ".m2ts"],
    mimePrefix: "video/",
  },
  image: {
    label: "Image",
    plural: "images",
    extensions: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".tif", ".tiff", ".bmp", ".svg", ".raw", ".dng"],
    mimePrefix: "image/",
  },
  audio: {
    label: "Audio",
    plural: "audio files",
    extensions: [".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg", ".opus", ".aif", ".aiff"],
    mimePrefix: "audio/",
  },
  document: {
    label: "Document",
    plural: "documents",
    extensions: [".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt", ".xls", ".xlsx", ".csv", ".ppt", ".pptx"],
  },
  archive: {
    label: "Archive",
    plural: "archives",
    extensions: [".zip", ".rar", ".7z", ".tar", ".gz", ".tgz"],
  },
  any: { label: "Any file", plural: "files", extensions: [] },
};

export const KIND_ORDER = Object.keys(FILE_KINDS) as FileKind[];

/** Value for <input type="file" accept>. Empty means "anything". */
export const acceptFor = (kind: FileKind): string => {
  const info = FILE_KINDS[kind];
  return [...(info.mimePrefix ? [`${info.mimePrefix}*`] : []), ...info.extensions].join(",");
};

export function matchesKind(kind: FileKind, file: File): boolean {
  if (kind === "any") return true;
  const info = FILE_KINDS[kind];
  const name = file.name.toLowerCase();
  if (info.extensions.some((ext) => name.endsWith(ext))) return true;
  return info.mimePrefix !== undefined && file.type.toLowerCase().startsWith(info.mimePrefix);
}

/** "Raw footage – 2 videos" style description of a requirement. */
export function describeRequirement(kind: FileKind, count: number, label: string | null): string {
  const info = FILE_KINDS[kind];
  const what = `${count} ${count === 1 ? info.label.toLowerCase() : info.plural}`;
  return label ? `${label} (${what})` : what;
}

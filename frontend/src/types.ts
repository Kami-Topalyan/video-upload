export type RoomRole = "owner" | "member";

export interface User {
  id: string;
  username: string;
  isAdmin: boolean;
}

/** What a room can ask each member to upload. Keep in sync with backend/src/fileKinds.ts. */
export type FileKind = "video" | "image" | "audio" | "document" | "archive" | "any";

/** "Upload `count_required` files of type `kind`". */
export interface Requirement {
  id: string;
  kind: FileKind;
  label: string | null;
  count_required: number;
}

/** What the admin fills in when creating a room. */
export interface RequirementInput {
  kind: FileKind;
  count: number;
  label?: string;
}

/** A file stored in a room. */
export interface UploadedFile {
  id: string;
  requirement_id: string | null;
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
  /** null if the uploader's account no longer exists. */
  uploaded_by: string | null;
  uploaded_by_username: string | null;
}

export interface Member {
  id: string;
  username: string;
  role: string;
  avatarId: string | null;
  uploaded: Record<string, number>;
  complete: boolean;
}

export interface RequirementRow {
  key: number;
  kind: FileKind;
  count: number;
  label: string;
}

/** A room as it appears in the sidebar list. */
export interface RoomSummary {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  role: RoomRole;
  file_count: number;
  member_count: number;
}

export interface RoomInfo {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RoomDetailed {
  room: RoomInfo;
  /** The current user's role in this room. */
  role: RoomRole;
  requirements: Requirement[];
  members: Member[];
  files: UploadedFile[];
  reqFiles: RequirementRow[];
}

export type UploadStatus = "uploading" | "done" | "error" | "cancelled";

/** A client-side upload in flight (or recently finished). */
export interface UploadItem {
  id: number;
  roomId: string;
  requirementId: string;
  name: string;
  size: number;
  progress: number;
  status: UploadStatus;
  error?: string;
}

import type {
  RequirementInput,
  RoomDetailed,
  RoomInfo,
  RoomSummary,
  UploadedFile,
  User,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";
const TOKEN_KEY = "token";

// ---- Token storage ----

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

// ---- Request helper ----


export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let onUnauthorized: (() => void) | null = null;

/** Called when the server rejects a signed-in request with 401 (e.g. the token expired). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Don't send the token or treat a 401 as an expired session (login). */
  anonymous?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = options.anonymous ? null : getToken();
  const isFormData = options.body instanceof FormData;

  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    body = isFormData ? (options.body as FormData) : JSON.stringify(options.body);
  }

  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });

  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(await readError(res, `Request failed (${res.status})`), res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}



// ---- Auth ----

interface AuthResponse {
  user: User;
  token: string;
}

async function authenticate(path: string, username: string, password: string): Promise<User> {
  const { user, token } = await request<AuthResponse>(path, {
    method: "POST",
    body: { username, password },
    anonymous: true,
  });
  setToken(token);
  return user;
}

export const login = (username: string, password: string): Promise<User> =>
  authenticate("/auth/login", username, password);

export const getMe = async (): Promise<User> => (await request<{ user: User }>("/auth/me")).user;

// ---- Users ----

/** Admin only: everyone else, for picking room members. */
export const getUsers = async (): Promise<User[]> =>
  (await request<{ users: User[] }>("/users")).users;

/** Admin only: give someone an account. */
export const createUser = async (
  username: string,
  password: string,
  isAdmin: boolean,
): Promise<User> =>
  (await request<{ user: User }>("/users", { method: "POST", body: { username, password, isAdmin } }))
    .user;

export const uploadUserAvatar = async (userId: string, file: File): Promise<User> => {
  const formData = new FormData();
  formData.append("avatar", file);
  console.log(file)
  return (
    await request<{ user: User }>(`/users/${userId}/avatar`, {
      method: "PATCH",
      body: formData,
    })
  ).user;
};



// ---- Rooms ----

export const getRooms = async (): Promise<RoomSummary[]> =>
  (await request<{ rooms: RoomSummary[] }>("/rooms")).rooms;

export const getRoom = (roomId: string): Promise<RoomDetailed> =>
  request<RoomDetailed>(`/rooms/${encodeURIComponent(roomId)}`);

export const createRoom = async (
  name: string,
  memberIds: string[],
  requirements: RequirementInput[],
): Promise<RoomInfo> =>
  (
    await request<{ room: RoomInfo }>("/rooms", {
      method: "POST",
      body: { name, memberIds, requirements },
    })
  ).room;


export const patchRoom = async (
  roomId: string,
  name: string,
  memberIds: string[],
  requirements: RequirementInput[],
): Promise<RoomInfo> =>
  (
    await request<{ room: RoomInfo }>(`/rooms/${encodeURIComponent(roomId)}`, {
      method: "PATCH",
      body: { name, memberIds, requirements },
    })
  ).room;

export const deleteRoom = async (roomId: string): Promise<String> =>
    (await request<{ message: String }>(`/rooms/${encodeURIComponent(roomId)}`, {method: "DELETE"})).message
  ;

// ---- Files ----

const fileUrl = (roomId: string, fileId: string): string =>
  `/rooms/${encodeURIComponent(roomId)}/files/${encodeURIComponent(fileId)}`;

export const deleteFile = (roomId: string, fileId: string): Promise<void> =>
  request<void>(fileUrl(roomId, fileId), { method: "DELETE" });

/**
 * Download a file. The request needs the auth header, so it can't be a plain link;
 * the bytes are fetched, then saved through a temporary object URL.
 * Note this holds the whole file in memory.
 */
export async function downloadFile(roomId: string, file: UploadedFile): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}${fileUrl(roomId, file.id)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(await readError(res, "Failed to download file"), res.status);
  }

  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = file.original_name;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Upload one file into one requirement of a room. Uses XMLHttpRequest because fetch() can't report
 * upload progress. Abort via the signal to cancel an in-flight upload.
 */
export function uploadFile(
  roomId: string,
  requirementId: string,
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `${BASE}/rooms/${encodeURIComponent(roomId)}/requirements/${encodeURIComponent(requirementId)}/files`,
    );

    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as { file?: UploadedFile };
          if (data.file) resolve(data.file);
          else reject(new Error("No uploaded file returned by server"));
        } catch {
          reject(new Error("Unexpected response from server"));
        }
        return;
      }

      if (xhr.status === 401) onUnauthorized?.();

      let message = `Upload failed (${xhr.status})`;
      try {
        message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
      } catch {
        // Non-JSON error body (e.g. a proxy error page); keep the generic message.
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    const body = new FormData();
    body.append("file", file);
    xhr.send(body);
  });
}

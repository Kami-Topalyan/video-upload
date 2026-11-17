import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createUser, uploadUserAvatar } from "../api";
import type { User } from "../types";
import {
  ErrorMessage,
  Modal,
  Spinner,
  inputClass,
  labelClass,
  submitButtonClass,
} from "./ui";

interface CreateUserModalProps {
  onClose: () => void;
  onCreated: (user: User) => void;
}

// Keep in sync with the rules in backend/src/credentials.ts.
const USERNAME_HINT = "3-30 characters: letters, numbers, dots, underscores or hyphens.";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB, matches multer limit

/** Admin-only: create an account and hand the username and password to its owner. */
export default function CreateUserModal({ onClose, onCreated }: CreateUserModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<User | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Clean up object URLs when the preview changes or modal unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setError("");

    if (!file) {
      setAvatarFile(null);
      setPreviewUrl(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image must be 2 MB or smaller.");
      event.target.value = "";
      return;
    }

    setAvatarFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearAvatar = () => {
    setAvatarFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      let user = await createUser(username.trim(), password, isAdmin);

      // Upload the avatar if one was selected
      if (avatarFile) {
        user = await uploadUserAvatar(user.id, avatarFile);
      }

      onCreated(user);
      setCreated(user);
      setUsername("");
      setPassword("");
      setIsAdmin(false);
      clearAvatar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} busy={loading} labelledBy="user-title">
      <h2 id="user-title" className="mb-7 text-2xl font-bold text-gray-900 dark:text-white">
        Create an account
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="newAvatar" className={labelClass}>
            Avatar (optional)
          </label>
          <div className="mt-2 flex items-center gap-4">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Selected avatar preview"
                className="h-16 w-16 rounded-full object-cover border border-gray-300 dark:border-gray-700"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700">
                200×200
              </div>
            )}

            <div className="flex flex-col gap-1">
              <input
                ref={fileInputRef}
                id="newAvatar"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-200 dark:text-gray-300 dark:file:bg-gray-800 dark:file:text-gray-200"
              />
              {avatarFile && (
                <button
                  type="button"
                  onClick={clearAvatar}
                  className="self-start text-xs text-red-500 hover:underline"
                >
                  Remove image
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-400">PNG, JPG, or WebP up to 2 MB.</p>
        </div>

        <div>
          <label htmlFor="newUsername" className={labelClass}>
            Username
          </label>
          <input
            id="newUsername"
            type="text"
            autoComplete="off"
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
          <p className="mt-2 text-xs text-gray-400">{USERNAME_HINT}</p>
        </div>

        <div>
          <label htmlFor="newPassword" className={labelClass}>
            Password
          </label>
          <input
            id="newPassword"
            type="text"
            autoComplete="off"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <p className="mt-2 text-xs text-gray-400">
            At least 8 characters. Shown in plain text so you can pass it on.
          </p>
        </div>

        <div className="flex flex-row gap-2">
          <input
            id="newIsAdmin"
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          <label htmlFor="newIsAdmin">Make this person an admin</label>
        </div>

        {created && !error && (
          <p role="status">
            Created <strong>{created.username}</strong>. You can add another.
          </p>
        )}
        {error && <ErrorMessage>{error}</ErrorMessage>}

        <button type="submit" disabled={loading} className={submitButtonClass}>
          {loading && <Spinner />}
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>
    </Modal>
  );
}

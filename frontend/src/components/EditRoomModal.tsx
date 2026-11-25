import { useEffect, useState, type FormEvent } from "react";
import { getUsers } from "../api";
import { FILE_KINDS, KIND_ORDER } from "../fileKinds";
import type { FileKind, RoomDetailed, User } from "../types";
import {
  ErrorMessage,
  Modal,
  Spinner,
  inputClass,
  labelClass,
  submitButtonClass,
} from "./ui";

const ROOM_NAME_MAX = 150;
const MAX_REQUIREMENTS = 20;
const MAX_COUNT = 50;

/** What the admin ends up with after editing. Wire this to the API when it exists. */
export interface RoomEdits {
  name: string;
  memberIds: string[];
  requirements: { kind: FileKind; count: number; label?: string }[];
}

interface RequirementRow {
  key: number;
  kind: FileKind;
  count: number;
  label: string;
}

interface EditRoomModalProps {
  room: RoomDetailed;
  onClose: () => void;
  /* Fix this typing */
  onSave: any;
}

export default function EditRoomModal({ room, onClose, onSave }: EditRoomModalProps) {
  const [roomName, setRoomName] = useState(room.room.name);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(room.members.filter((m) => m.role === "member").map((m) => m.id)),
  );
  const [rows, setRows] = useState<RequirementRow[]>(() =>
    room.requirements.map((requirement, index) => ({
      key: index,
      kind: requirement.kind,
      count: requirement.count_required,
      label: requirement.label ?? "",
    })),
  );
  const [nextKey, setNextKey] = useState(room.requirements.length);

  const updateRow = (key: number, changes: Partial<RequirementRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...changes } : row)));

  const addRow = () => {
    setRows((prev) => [...prev, { key: nextKey, kind: "video", count: 1, label: "" }]);
    setNextKey((k) => k + 1);
  };

  const removeRow = (key: number) => setRows((prev) => prev.filter((row) => row.key !== key));

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load users.");
      });
  }, []);

  const toggleUser = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    const name = roomName.trim();

    if (!name) {
      setError("Please enter a room name.");
      return;
    }

    if (rows.length === 0) {
      setError("Add at least one upload requirement.");
      return;
    }

    setLoading(true);

    try {
      await onSave({
        name,
        memberIds: [...selectedIds],
        requirements: rows.map((row) => ({
          kind: row.kind,
          count: row.count,
          label: row.label.trim() || undefined,
        })),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} busy={loading} labelledBy="edit-room-title">
      <div className="mb-7">
        <h2 id="edit-room-title" className="text-2xl font-bold text-gray-900 dark:text-white">
          Edit Room
        </h2>

        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Rename the room, change who has to upload, and change what each of them must upload.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="editRoomName" className={labelClass}>
            Room name
          </label>

          <input
            id="editRoomName"
            type="text"
            autoFocus
            required
            maxLength={ROOM_NAME_MAX}
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className={inputClass}
          />

          <p className="mt-2 text-xs text-gray-400">Maximum {ROOM_NAME_MAX} characters.</p>

          <p className={`${labelClass} mt-5`}>Who has to upload</p>

          <div className="border rounded-sm p-4">
            {users.length === 0 && (
              <p className="text-sm text-gray-500">No other accounts yet.</p>
            )}
            {users.map((user) => (
              <div key={user.id} className="flex flex-row gap-2">
                <input
                  id={`edit-member-${user.id}`}
                  type="checkbox"
                  checked={selectedIds.has(user.id)}
                  onChange={(e) => toggleUser(user.id, e.target.checked)}
                />

                <label htmlFor={`edit-member-${user.id}`}>{user.username}</label>
              </div>
            ))}
          </div>

          <p className={`${labelClass} mt-5`}>What each person must upload</p>

          <div className="border rounded-sm p-4 space-y-3">
            {rows.map((row, index) => (
              <div key={row.key} className="flex flex-row flex-wrap items-center gap-2">
                <input
                  type="number"
                  aria-label={`Requirement ${index + 1}: number of files`}
                  min={1}
                  max={MAX_COUNT}
                  required
                  value={row.count}
                  onChange={(e) => updateRow(row.key, { count: Number(e.target.value) })}
                  className="w-20 border rounded-sm px-2 py-1"
                />

                <select
                  aria-label={`Requirement ${index + 1}: file type`}
                  value={row.kind}
                  onChange={(e) => updateRow(row.key, { kind: e.target.value as FileKind })}
                  className="border rounded-sm px-2 py-1"
                >
                  {KIND_ORDER.map((kind) => (
                    <option key={kind} value={kind}>
                      {FILE_KINDS[kind].label}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  aria-label={`Requirement ${index + 1}: label (optional)`}
                  maxLength={100}
                  value={row.label}
                  onChange={(e) => updateRow(row.key, { label: e.target.value })}
                  placeholder="Label (optional), e.g. Raw footage"
                  className="flex-1 min-w-40 border rounded-sm px-2 py-1"
                />

                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                  aria-label={`Remove requirement ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}

            <button type="button" onClick={addRow} disabled={rows.length >= MAX_REQUIREMENTS}>
              + Add requirement
            </button>
          </div>
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <button type="submit" disabled={loading} className={submitButtonClass}>
          {loading && <Spinner />}
          {loading ? "Saving..." : "Save changes"}
        </button>
      </form>
    </Modal>
  );
}
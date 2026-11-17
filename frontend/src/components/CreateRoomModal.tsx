import { useEffect, useState, type FormEvent } from "react";
import { createRoom, getUsers } from "../api";
import { FILE_KINDS, KIND_ORDER } from "../fileKinds";
import type { FileKind, RoomInfo, User } from "../types";
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

interface RequirementRow {
  key: number;
  kind: FileKind;
  count: number;
  label: string;
}

interface CreateRoomModalProps {
  onClose: () => void;
  onCreated: (room: RoomInfo) => void;
}

export default function CreateRoomModal({ onClose, onCreated }: CreateRoomModalProps) {
  const [roomName, setRoomName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<RequirementRow[]>([
    { key: 0, kind: "video", count: 1, label: "" },
  ]);
  const [nextKey, setNextKey] = useState(1);

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
      const requirements = rows.map((row) => ({
        kind: row.kind,
        count: row.count,
        label: row.label.trim() || undefined,
      }));
      onCreated(await createRoom(name, [...selectedIds], requirements));
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} busy={loading} labelledBy="room-title">
      <div className="mb-7">
        <h2 id="room-title" className="text-2xl font-bold text-gray-900 dark:text-white">
          Create a Room
        </h2>

        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Name the room, choose who has to upload, and say what each of them must upload.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="roomName" className={labelClass}>
            Room name
          </label>

          <input
            id="roomName"
            type="text"
            autoFocus
            required
            maxLength={ROOM_NAME_MAX}
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="e.g. Project Team"
            className={inputClass}
          />

          <p className="mt-2 text-xs text-gray-400">
            Maximum {ROOM_NAME_MAX} characters.
          </p>

          <p className={`${labelClass} mt-5`}>Who has to upload</p>

          <div className="border rounded-sm p-4">
            {users.length === 0 && (
              <p className="text-sm text-gray-500">No other accounts yet. Create some first.</p>
            )}
            {users.map((user) => (
              <div key={user.id} className="flex flex-row gap-2">
                <input
                  id={`member-${user.id}`}
                  type="checkbox"
                  checked={selectedIds.has(user.id)}
                  onChange={(e) => toggleUser(user.id, e.target.checked)}
                />

                <label htmlFor={`member-${user.id}`}>{user.username}</label>
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
          {loading ? "Creating room..." : "Create Room"}
        </button>
      </form>
    </Modal>
  );
}

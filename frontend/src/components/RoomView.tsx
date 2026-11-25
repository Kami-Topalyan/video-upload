import { useState } from "react";
import { deleteFile, downloadFile, patchRoom } from "../api";
import { FILE_KINDS, acceptFor, describeRequirement, matchesKind } from "../fileKinds";
import { useUploads } from "../hooks/useUploads";
import type { Requirement, RoomDetailed, UploadedFile } from "../types";
import { Dropzone } from "./Dropzone";
import EditRoomModal from "./EditRoomModal";
import { FileList } from "./FileList";
import { UploadQueue } from "./UploadQueue";
import { Uploaders } from "./Uploaders";

interface RoomViewProps {
  selectedRoom: RoomDetailed;
  currentUserId: string;
  /** Refetch a room (and the room list) after its files change. */
  onReload: (roomId: string) => Promise<void>;
}

export function RoomView({ selectedRoom, currentUserId, onReload }: RoomViewProps) {
  const roomId = selectedRoom.room.id;
  const { requirements, members } = selectedRoom;
  const isMember = selectedRoom.role === "member";

  // Remember which room an error belongs to so it doesn't follow you to another room.
  const [error, setError] = useState<{ roomId: string; message: string } | null>(null);
  const visibleError = error?.roomId === roomId ? error.message : null;

  const [editing, setEditing] = useState(false);

  const { items, start, cancel, dismiss } = useUploads(roomId, onReload);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError({ roomId, message: e instanceof Error ? e.message : fallback });
    }
  };

  const handleDownload = (file: UploadedFile) =>
    run(() => downloadFile(roomId, file), "Failed to download file");

  const handleDelete = (file: UploadedFile) =>
    run(async () => {
      await deleteFile(roomId, file.id);
      await onReload(roomId);
    }, "Failed to delete file");

  // The server enforces this too: owners can delete anything, members only their own files.
  const canDelete = (file: UploadedFile) =>
    selectedRoom.role === "owner" || file.uploaded_by === currentUserId;

  const me = members.find((member) => member.id === currentUserId);

  /** How many more files this member can still start for a requirement. */
  const slotsLeft = (requirement: Requirement): number => {
    const uploaded = me?.uploaded[requirement.id] ?? 0;
    const inFlight = items.filter(
      (item) => item.requirementId === requirement.id && item.status === "uploading",
    ).length;
    return Math.max(0, requirement.count_required - uploaded - inFlight);
  };

  const handleFiles = (requirement: Requirement, files: File[]) => {
    const right = files.filter((file) => matchesKind(requirement.kind, file));
    const accepted = right.slice(0, slotsLeft(requirement));

    const problems: string[] = [];
    if (right.length < files.length) {
      problems.push(
        `${files.length - right.length} file(s) skipped: this requirement only takes ${FILE_KINDS[requirement.kind].plural}.`,
      );
    }
    if (accepted.length < right.length) {
      problems.push(`${right.length - accepted.length} file(s) skipped: not enough slots left.`);
    }
    setError(problems.length ? { roomId, message: problems.join(" ") } : null);

    if (accepted.length > 0) start(accepted, requirement.id);
  };

  const requirementName = (file: UploadedFile): string | null => {
    const requirement = requirements.find((r) => r.id === file.requirement_id);
    return requirement
      ? (requirement.label ?? FILE_KINDS[requirement.kind].label)
      : null;
  };

  return (
    <>
      {selectedRoom.role === "owner" && (
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">{selectedRoom.room.name}</h1>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700"
          >
            Edit room
          </button>
        </div>
      )}

      {editing && (
        <EditRoomModal
          room={selectedRoom}
          onClose={() => setEditing(false)}
          // TODO: connect to the API (PATCH /rooms/:roomId) once editing is supported.
          onSave={patchRoom}
        />
      )}

      <section className="bg-(--surface) border border-(--border) p-4 rounded-md h-min" aria-label="Requirements">
        <h2>Each person must upload</h2>
        <ul className="list">
          {requirements.map((requirement) => (
            <li key={requirement.id} className="row">
              {describeRequirement(
                requirement.kind,
                requirement.count_required,
                requirement.label,
              )}
            </li>
          ))}
        </ul>
      </section>

      <Uploaders members={members} requirements={requirements} />

      {isMember &&
        requirements.map((requirement) => {
          const uploaded = me?.uploaded[requirement.id] ?? 0;
          const left = slotsLeft(requirement);
          const title = requirement.label ?? FILE_KINDS[requirement.kind].label;

          return (
            <Dropzone
              key={requirement.id}
              accept={acceptFor(requirement.kind)}
              disabled={left === 0}
              onFiles={(files) => handleFiles(requirement, files)}
              title={`${title}: ${Math.min(uploaded, requirement.count_required)} of ${requirement.count_required} uploaded`}
              hint={
                left === 0
                  ? uploaded >= requirement.count_required
                    ? "All done"
                    : "Uploading…"
                  : `Drop up to ${left} ${left === 1 ? FILE_KINDS[requirement.kind].label.toLowerCase() : FILE_KINDS[requirement.kind].plural} here, or click to browse`
              }
            />
          );
        })}

      <UploadQueue items={items} onCancel={cancel} onDismiss={dismiss} />
      {visibleError && (
        <div className="alert" role="alert">
          {visibleError}
        </div>
      )}
      <FileList
        files={selectedRoom.files}
        canDelete={canDelete}
        requirementName={requirementName}
        onDownload={handleDownload}
        onDelete={handleDelete}
      />
    </>
  );
}
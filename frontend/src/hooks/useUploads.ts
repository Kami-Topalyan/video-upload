import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uploadFile } from "../api";
import type { UploadItem } from "../types";

/**
 * Tracks client-side uploads with progress, cancel and dismiss.
 *
 * Uploads belong to the room they were started in: they keep running if you look
 * at another room, and only show up in the queue of their own room.
 * Everything still in flight is cancelled when the component using this unmounts.
 */
export function useUploads(roomId: string, onUploaded: (roomId: string) => void) {
  const [allItems, setAllItems] = useState<UploadItem[]>([]);
  const controllers = useRef(new Map<number, AbortController>());
  const nextId = useRef(0);

  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((controller) => controller.abort());
  }, []);

  const patch = useCallback((id: number, changes: Partial<UploadItem>) => {
    setAllItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }, []);

  const start = useCallback(
    (files: File[], requirementId: string) => {
      for (const file of files) {
        const id = nextId.current++;
        const controller = new AbortController();
        controllers.current.set(id, controller);

        setAllItems((prev) => [
          {
            id,
            roomId,
            requirementId,
            name: file.name,
            size: file.size,
            progress: 0,
            status: "uploading",
          },
          ...prev,
        ]);

        uploadFile(roomId, requirementId, file, (progress) => patch(id, { progress }), controller.signal)
          .then(() => {
            patch(id, { progress: 100, status: "done" });
            onUploaded(roomId);
          })
          .catch((err: unknown) => {
            if (err instanceof DOMException && err.name === "AbortError") {
              patch(id, { status: "cancelled" });
            } else {
              patch(id, {
                status: "error",
                error: err instanceof Error ? err.message : "Upload failed",
              });
            }
          })
          .finally(() => controllers.current.delete(id));
      }
    },
    [roomId, onUploaded, patch],
  );

  const cancel = useCallback((id: number) => controllers.current.get(id)?.abort(), []);

  const dismiss = useCallback(
    (id: number) => setAllItems((prev) => prev.filter((item) => item.id !== id)),
    [],
  );

  const items = useMemo(
    () => allItems.filter((item) => item.roomId === roomId),
    [allItems, roomId],
  );

  return { items, start, cancel, dismiss };
}

import { Trash } from "lucide-react";
import { deleteRoom } from "../api";
import type { RoomSummary } from "../types";

interface UploadRoomsProps {
  rooms: RoomSummary[];
  setRooms: (rooms: RoomSummary[]) => void;
  onSelect: (roomId: string | null) => void;
  isAdmin: boolean | undefined;
}

export function Rooms({ rooms, onSelect, setRooms, isAdmin }: UploadRoomsProps) {
  async function onDeleteRoom(roomId: string) {
    await deleteRoom(roomId);
    onSelect(null);
    setRooms(rooms.filter((room) => room.id !== roomId));
  }
  return (
    <div className="p-4 flex-1 min-h-0 overflow-y-auto gap-5 flex flex-col">
      {rooms.map((room) => (
        <div
          key={room.id}
          className="rounded-md p-4 text-left bg-olive-300 hover:bg-olive-300/85 transition-colors flex flex-row justify-between cursor-pointer"
          onClick={() => onSelect(room.id)}
        >
          <span className="text-black font-bold">{room.name}</span>
          <div className="flex gap-6">

              {isAdmin && (
                <button className="text-black font-bold cursor-pointer "
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteRoom(room.id);
                }}>
                  <Trash className="hover:stroke-red-500 transition-colors"/>
                </button>
              )}
          </div>
        </div>
      ))}
    </div>
  );
}

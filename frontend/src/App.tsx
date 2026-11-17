import { useCallback, useEffect, useState } from "react";
import { getRoom, getRooms, setUnauthorizedHandler } from "./api";
import CreateRoomModal from "./components/CreateRoomModal";
import CreateUserModal from "./components/CreateUserModal";
import LoginModal from "./components/LoginModal";
import { RoomView } from "./components/RoomView";
import { UploadRooms } from "./components/Rooms";
import { useAuth } from "./hooks/useAuth";
import type { RoomDetailed, RoomSummary } from "./types";

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error ? e.message : fallback;

export default function App() {
  const { user, setUser, logout } = useAuth();

  const [loginOpen, setLoginOpen] = useState(false);
  const [roomCreatorOpen, setRoomCreatorOpen] = useState(false);
  const [userCreatorOpen, setUserCreatorOpen] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<RoomDetailed | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = useCallback(() => {
    logout();
    setRooms([]);
    setSelectedRoom(null);
    setError(null);
  }, [logout]);

  // If the server says our token is no longer valid, sign out.
  useEffect(() => {
    setUnauthorizedHandler(handleLogout);
    return () => setUnauthorizedHandler(null);
  }, [handleLogout]);

  const refreshRooms = useCallback(async () => {
    try {
      setRooms(await getRooms());
    } catch (e) {
      setError(errorMessage(e, "Failed to load rooms"));
    }
  }, []);

  // Load the room list whenever someone signs in (including from a saved session).
  useEffect(() => {
    if (user) void refreshRooms();
  }, [user, refreshRooms]);

  const selectRoom = async (roomId: string | null) => {
    try {
      setError(null);
      if(roomId)
      setSelectedRoom(await getRoom(roomId));

      else
      setSelectedRoom(null)
    } catch (e) {
      setError(errorMessage(e, "Failed to open room"));
    }
  };

  // Refresh a room's files plus the sidebar. If you've switched rooms meanwhile, leave the view alone.
  const reloadRoom = useCallback(
    async (roomId: string) => {
      try {
        const [detail] = await Promise.all([getRoom(roomId), refreshRooms()]);
        setSelectedRoom((current) => (current?.room.id === roomId ? detail : current));
      } catch (e) {
        setError(errorMessage(e, "Failed to refresh room"));
      }
    },
    [refreshRooms],
  );

  // Keep the open room fresh, so people's icons turn green without a manual refresh.
  const openRoomId = selectedRoom?.room.id;
  useEffect(() => {
    if (!openRoomId) return;
    const timer = setInterval(() => {
      if (!document.hidden) void reloadRoom(openRoomId);
    }, 15_000);
    return () => clearInterval(timer);
  }, [openRoomId, reloadRoom]);

  return (
    <main className="flex min-h-screen w-full">
      <aside className="sticky top-0 flex h-dvh w-80 shrink-0 flex-col gap-2 p-2">
      <div className="w-80 h-screen shrink-0 flex flex-col rounded-md p-2 gap-2">
        <section className="shrink-0 rounded-md border border-(--border) bg-(--surface) p-4">
        <div className="flex items-center justify-between gap-4 px-2">  
          <span className="font-semibold">Rooms</span>

          {user?.isAdmin && (
            <button
              onClick={() => setRoomCreatorOpen(true)}
              aria-label="Create room"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 font-semibold text-white transition hover:bg-blue-700"
            >
              +
            </button>
          )}
        
        </div>
        </section>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-(--border) bg-(--surface)">
          <UploadRooms rooms={rooms} setRooms={setRooms} onSelect={selectRoom} isAdmin={user?.isAdmin}/>
        </div>
        {user?.isAdmin && (
          <button
            onClick={() => setUserCreatorOpen(true)}
            className="w-full p-2 bg-blue-600 rounded-lg font-semibold text-white transition hover:bg-blue-700"
          >
            Create user
          </button>
        )}
        {user && (
          <button
            onClick={() => logout()}
            className="w-full p-2 bg-red-600 rounded-lg font-semibold text-white transition hover:bg-red-700"
          >
            Logout {user.username}
          </button>
        )}
        {!user && (
          <button
            onClick={() => setLoginOpen(true)}
            className="w-full p-2 bg-blue-600 rounded-lg font-semibold text-white transition hover:bg-blue-700"
          >
            Sign in
          </button>
        )}

      </div>
      </aside>
      <div className="flex w-full min-w-0 p-20 h-min justify-center content-center">
        <div className="grid gap-20 w-full max-w-300">
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          {user && selectedRoom && (
            <RoomView
              selectedRoom={selectedRoom}
              currentUserId={user.id}
              onReload={reloadRoom}
            />
          )}
        </div>
      </div>

      {loginOpen && (
        <LoginModal onClose={() => setLoginOpen(false)} onSuccess={setUser} />
      )}

      {userCreatorOpen && (
        <CreateUserModal onClose={() => setUserCreatorOpen(false)} onCreated={() => {}} />
      )}

      {user?.isAdmin && roomCreatorOpen && (
        <CreateRoomModal
          onClose={() => setRoomCreatorOpen(false)}
          onCreated={() => void refreshRooms()}
        />
      )}
    </main>
  );
}

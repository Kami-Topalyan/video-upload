import type { Member, Requirement } from "../types";

interface UploadersProps {
  members: Member[];
  requirements: Requirement[];
}

/** One tile per member who has to upload. Green once they have met every requirement. */
export function Uploaders({ members, requirements }: UploadersProps) {
  const required = requirements.reduce((sum, r) => sum + r.count_required, 0);

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-8">
      {members
        .filter((member) => member.role === "member")
        .map((member) => {
          const done = requirements.reduce(
            (sum, r) => sum + Math.min(member.uploaded[r.id] ?? 0, r.count_required),
            0,
          );

          return (
            <div className="justify-center flex w-full md:w-[calc(50%-0.75rem)] xl:w-[calc(33.3333%-0.75rem)] 2xl:w-[calc(25%-0.75rem)]">
              <div
                key={member.id}
                data-complete={member.complete}
                className={`rounded-md overflow-hidden w-[200px] h-[260px] grid ${member.complete ? "bg-green-600" : "bg-red-700"}`}
              >
                <div className="h-[180px] w-full bg-black/20 flex items-center justify-center overflow-hidden">
                  {member.avatarId ? (
                    <img
                      src={`/api/avatars/${member.avatarId}`}
                      alt={`${member.username}'s avatar`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl font-bold uppercase text-white/70">
                      {member.username.slice(0, 1)}
                    </span>
                  )}
                </div>
                <div className="flex flex-col justify-self-center self-center items-center">
                  <span className="capitalize">{member.username}</span>
                  <span>
                    {member.complete ? "Complete" : `${done}/${required} files`}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}

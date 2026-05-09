import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RankBadge } from "@/components/ui/RankBadge";
import { StatCard } from "@/components/ui/StatCard";
import { getRankLabel } from "@/lib/types";

const FRIENDS = [
  { name: "Jake", hours: "12.3", tier: "gold" as const, div: 1, isYou: false },
  { name: "You", hours: "6.5", tier: "silver" as const, div: 2, isYou: true },
  { name: "Maya", hours: "4.1", tier: "silver" as const, div: 1, isYou: false },
];

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="w-9 h-9 rounded-lg bg-studyrank-purple/20 border border-studyrank-purple/30 flex items-center justify-center">
      <span className="text-studyrank-purple text-xs font-semibold">{initials}</span>
    </div>
  );
}

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const displayName =
    profile?.display_name ||
    user.user_metadata?.display_name ||
    user.email?.split("@")[0] ||
    "You";

  const tier = profile?.rank_tier ?? "silver";
  const division = profile?.rank_division ?? 2;

  return (
    <div className="min-h-screen bg-studyrank-base flex flex-col">
      {/* Top bar */}
      <header className="border-b border-studyrank-border bg-studyrank-surface px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <p className="uppercase tracking-[0.3em] text-studyrank-purple text-xs font-semibold">
            StudyRank
          </p>
          <div className="flex items-center gap-3">
            <Avatar name={displayName} />
            <RankBadge tier={tier} division={division} size="sm" />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
        {/* Greeting */}
        <div>
          <h1 className="font-bold tracking-tight text-2xl text-studyrank-primary">
            Welcome back, {displayName.split(" ")[0]}.
          </h1>
          <p className="text-studyrank-secondary text-sm mt-1">
            {getRankLabel(tier, division)} · Keep grinding.
          </p>
        </div>

        {/* Stats row */}
        <div className="flex gap-3">
          <StatCard label="This Week" value="6.5" unit="HRS" />
          <StatCard label="Rank Points" value="340" unit="RP" />
          <StatCard label="Streak" value="3" unit="DAYS" />
        </div>

        {/* Friends leaderboard */}
        <div className="bg-studyrank-card border border-studyrank-border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-studyrank-border">
            <p className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted">
              Friends This Week
            </p>
          </div>

          {FRIENDS.map((friend, i) => (
            <div
              key={friend.name}
              className={`flex items-center gap-4 px-5 py-3.5 border-b border-studyrank-border last:border-0 transition-colors ${
                friend.isYou ? "bg-studyrank-purple/10" : ""
              }`}
            >
              <span className="font-mono font-light text-studyrank-muted w-4 text-sm shrink-0">
                {i + 1}
              </span>
              <span
                className={`flex-1 text-sm font-medium ${
                  friend.isYou ? "text-studyrank-purple" : "text-studyrank-primary"
                }`}
              >
                {friend.name}
                {friend.isYou && (
                  <span className="ml-2 text-[10px] uppercase tracking-widest text-studyrank-muted font-semibold">
                    you
                  </span>
                )}
              </span>
              <span className="font-mono text-studyrank-secondary text-sm">
                {friend.hours} hrs
              </span>
              <RankBadge tier={friend.tier} division={friend.div} size="sm" />
            </div>
          ))}
        </div>

        {/* Start session button */}
        <div className="mt-auto pt-2">
          <Link
            href="/session"
            className="flex items-center justify-center w-full bg-studyrank-purple hover:bg-[#5a52c0] active:bg-[#4e47ae] text-studyrank-primary font-semibold uppercase tracking-widest text-sm rounded-md py-4 transition-colors duration-150"
          >
            Start Session
          </Link>
        </div>
      </main>
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RankBadge } from "@/components/ui/RankBadge";
import { StatCard } from "@/components/ui/StatCard";
import { ProfileMenu } from "@/components/ui/ProfileMenu";
import { getRankLabel, type RankTier } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtVerified(sec: number | null) {
  if (!sec || sec === 0) return "0m";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function sessionDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d >= today)
    return `Today · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  if (d >= yesterday) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function dayShort(d: Date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 3);
}


// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Date range for "this week" (last 7 days)
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  // Fetch profile + sessions in parallel
  const [{ data: profile }, { data: rawSessions }, { data: board }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("sessions")
        .select("id, started_at, duration_seconds, verified_seconds, distraction_count, rank_points_earned, subject")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(50),
      supabase
        .from("profiles")
        .select("id, display_name, rank_tier, rank_division, rank_points")
        .order("rank_points", { ascending: false })
        .limit(10),
    ]);

  const sessions = rawSessions ?? [];
  const leaderboard = board ?? [];

  const displayName =
    profile?.display_name ||
    user.user_metadata?.display_name ||
    user.email?.split("@")[0] ||
    "You";

  const tier = (profile?.rank_tier ?? "bronze") as RankTier;
  const division = (profile?.rank_division ?? 3) as 1 | 2 | 3;

  // ── Compute stats ─────────────────────────────────────────────────────────

  const thisWeek = sessions.filter(
    (s) => new Date(s.started_at) >= weekStart
  );
  const weekVerifiedSec = thisWeek.reduce(
    (sum, s) => sum + (s.verified_seconds ?? 0),
    0
  );
  const weeklyHours = (weekVerifiedSec / 3600).toFixed(1);

  // ── 7-day graph buckets ───────────────────────────────────────────────────

  const buckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    return { date: d, label: dayShort(d), hours: 0, isToday: i === 6 };
  });

  for (const s of thisWeek) {
    const sd = new Date(s.started_at); sd.setHours(0, 0, 0, 0);
    const bucket = buckets.find((b) => b.date.toDateString() === sd.toDateString());
    if (bucket) bucket.hours += (s.verified_seconds ?? 0) / 3600;
  }

  const maxHours = Math.max(...buckets.map((b) => b.hours), 0.5);
  const recentSessions = sessions.slice(0, 8);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-studyrank-base flex flex-col">
      {/* Top bar */}
      <header className="border-b border-studyrank-border bg-studyrank-surface px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <p className="uppercase tracking-[0.3em] text-studyrank-purple text-xs font-semibold">
            StudyRank
          </p>
          <div className="flex items-center gap-3">
            <RankBadge tier={tier} division={division} size="sm" />
            <ProfileMenu displayName={displayName} email={user.email ?? ""} />
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

        {/* Stats — real data from profile */}
        <div className="flex gap-3">
          <StatCard label="This Week" value={weeklyHours} unit="HRS" />
          <StatCard label="Rank Points" value={String(profile?.rank_points ?? 0)} unit="RP" />
          <StatCard label="Streak" value={String(profile?.streak_days ?? 0)} unit="DAYS" />
        </div>

        {/* 7-day verified hours graph */}
        <div className="bg-studyrank-card border border-studyrank-border rounded-lg p-5">
          <p className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted mb-5">
            Last 7 Days · Verified Hours
          </p>
          <div className="flex items-end gap-2 h-28">
            {buckets.map((b) => {
              const heightPct = (b.hours / maxHours) * 100;
              return (
                <div key={b.label} className="flex-1 flex flex-col items-center gap-1.5">
                  {/* bar */}
                  <div className="w-full flex flex-col justify-end" style={{ height: 80 }}>
                    <div
                      className="w-full rounded-sm transition-all"
                      style={{
                        height: b.hours > 0 ? `${Math.max(heightPct, 4)}%` : 2,
                        background: b.isToday
                          ? "#6c64d4"
                          : b.hours > 0
                            ? "#2d2d6e"
                            : "#1e1e32",
                      }}
                    />
                  </div>
                  {/* label */}
                  <span
                    className={`text-[9px] uppercase tracking-wide ${
                      b.isToday ? "text-studyrank-purple" : "text-studyrank-muted"
                    }`}
                  >
                    {b.label}
                  </span>
                  {/* hours label only if > 0 */}
                  <span className="text-[9px] font-mono text-studyrank-secondary h-3">
                    {b.hours > 0 ? `${b.hours.toFixed(1)}h` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent sessions */}
        <div className="bg-studyrank-card border border-studyrank-border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-studyrank-border flex items-center justify-between">
            <p className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted">
              Past Sessions
            </p>
            <span className="text-[10px] uppercase tracking-wide text-studyrank-muted">
              {sessions.length} total
            </span>
          </div>

          {recentSessions.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-studyrank-secondary text-sm">No sessions yet.</p>
              <p className="text-studyrank-muted text-xs mt-1">
                Complete your first session to see your history.
              </p>
            </div>
          ) : (
            recentSessions.map((s) => {
              const focusRate =
                s.duration_seconds && s.duration_seconds > 0 && s.verified_seconds != null
                  ? Math.round((s.verified_seconds / s.duration_seconds) * 100)
                  : null;
              const subjectInitials = s.subject
                ? s.subject.slice(0, 2).toUpperCase()
                : "FS";
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-4 px-5 py-3.5 border-b border-studyrank-border last:border-0"
                >
                  {/* Subject icon */}
                  <div className="w-8 h-8 rounded-md bg-studyrank-surface border border-studyrank-border flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-semibold text-studyrank-muted">
                      {subjectInitials}
                    </span>
                  </div>

                  {/* Subject + date */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-studyrank-primary truncate">
                      {s.subject || "Focus Session"}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-studyrank-muted">
                      {sessionDate(s.started_at)}
                    </p>
                  </div>

                  {/* Duration + focus */}
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm text-studyrank-primary">
                      {fmtVerified(s.verified_seconds)}
                    </p>
                    {focusRate !== null && (
                      <p className="text-[10px] text-studyrank-muted">
                        {focusRate}% focus
                      </p>
                    )}
                  </div>

                  {/* RP earned */}
                  {s.rank_points_earned != null && s.rank_points_earned > 0 && (
                    <span className="text-[10px] font-mono text-studyrank-gold shrink-0">
                      +{s.rank_points_earned} RP
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Leaderboard */}
        <div className="bg-studyrank-card border border-studyrank-border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-studyrank-border">
            <p className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted">
              Leaderboard · All Time RP
            </p>
          </div>

          {leaderboard.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-studyrank-muted text-sm">No data yet.</p>
            </div>
          ) : (
            leaderboard.map((p, i) => {
              const isYou = p.id === user.id;
              const lTier = (p.rank_tier ?? "bronze") as RankTier;
              const lDiv = (p.rank_division ?? 3) as 1 | 2 | 3;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-4 px-5 py-3.5 border-b border-studyrank-border last:border-0 ${
                    isYou ? "bg-studyrank-purple/10" : ""
                  }`}
                >
                  {/* Position */}
                  <span className="font-mono text-sm w-4 shrink-0 text-studyrank-muted">
                    {i + 1}
                  </span>

                  {/* Name */}
                  <span
                    className={`flex-1 text-sm font-medium ${
                      isYou ? "text-studyrank-purple" : "text-studyrank-primary"
                    }`}
                  >
                    {p.display_name || "Anonymous"}
                    {isYou && (
                      <span className="ml-2 text-[10px] uppercase tracking-widest text-studyrank-muted font-semibold">
                        you
                      </span>
                    )}
                  </span>

                  {/* RP */}
                  <span className="font-mono text-sm text-studyrank-secondary">
                    {p.rank_points} RP
                  </span>

                  <RankBadge tier={lTier} division={lDiv} size="sm" />
                </div>
              );
            })
          )}
        </div>

        {/* Start session CTA */}
        <div className="mt-auto pt-2 pb-4">
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

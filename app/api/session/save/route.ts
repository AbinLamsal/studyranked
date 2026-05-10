import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    startedAt,
    endedAt,
    totalSeconds,
    verifiedSeconds,
    distractionCount,
    rankPointsEarned,
    subject,
  } = await request.json();

  // Ensure profile row exists (handles users whose trigger never fired)
  await supabase
    .from("profiles")
    .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });

  const { error: sessionError } = await supabase.from("sessions").insert({
    user_id: user.id,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: totalSeconds,
    verified_seconds: verifiedSeconds,
    distraction_count: distractionCount,
    rank_points_earned: rankPointsEarned,
    subject: subject || null,
  });

  if (sessionError) {
    console.error("[save-session] insert error:", sessionError);
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("rank_points, weekly_hours, streak_days")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const [{ data: todaySess }, { data: yesterSess }] = await Promise.all([
      supabase
        .from("sessions")
        .select("id")
        .eq("user_id", user.id)
        .gte("started_at", today.toISOString())
        .limit(1),
      supabase
        .from("sessions")
        .select("id")
        .eq("user_id", user.id)
        .gte("started_at", yesterday.toISOString())
        .lt("started_at", today.toISOString())
        .limit(1),
    ]);

    const hasToday = (todaySess?.length ?? 0) > 0;
    const hasYesterday = (yesterSess?.length ?? 0) > 0;
    let newStreak = profile.streak_days ?? 0;
    if (!hasToday) {
      newStreak = hasYesterday ? newStreak + 1 : 1;
    }

    await supabase
      .from("profiles")
      .update({
        rank_points: (profile.rank_points ?? 0) + rankPointsEarned,
        weekly_hours: +(
          ((profile.weekly_hours ?? 0) + verifiedSeconds / 3600).toFixed(2)
        ),
        streak_days: newStreak,
      })
      .eq("id", user.id);
  }

  return NextResponse.json({ success: true });
}

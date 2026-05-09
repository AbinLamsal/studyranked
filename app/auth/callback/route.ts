import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("rank_tier")
          .eq("id", user.id)
          .single();

        if (!profile?.rank_tier) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }

        return NextResponse.redirect(`${origin}/home`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

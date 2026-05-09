import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("rank_tier")
    .eq("id", user.id)
    .single();

  if (!profile?.rank_tier) {
    redirect("/onboarding");
  }

  redirect("/home");
}

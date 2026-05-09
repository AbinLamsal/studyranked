"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { RankBadge } from "@/components/ui/RankBadge";

const FAKE_LEADERBOARD = [
  { name: "Marcus K.", hours: "18.4", tier: "gold" as const, div: 1 },
  { name: "Priya S.", hours: "14.2", tier: "gold" as const, div: 3 },
  { name: "Jake T.", hours: "11.9", tier: "silver" as const, div: 1 },
];

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/onboarding");
    router.refresh();
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  const inputClass =
    "w-full bg-studyrank-card border border-studyrank-border rounded-md px-4 py-3 text-studyrank-primary placeholder-studyrank-muted text-sm focus:outline-none focus:border-studyrank-purple transition-colors";

  return (
    <div className="min-h-screen flex bg-studyrank-base">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-studyrank-surface flex-col justify-between p-12 border-r border-studyrank-border">
        <div>
          <p className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted mb-2">
            Join the competition
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-mono font-light tracking-widest text-studyrank-primary text-7xl leading-none">
            02:14:33
          </p>
          <p className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted mt-1">
            Verified Focus Time
          </p>

          <div className="mt-10 bg-studyrank-card border border-studyrank-border rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-studyrank-border">
              <p className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted">
                Global This Week
              </p>
            </div>
            {FAKE_LEADERBOARD.map((entry, i) => (
              <div
                key={entry.name}
                className="flex items-center gap-4 px-5 py-3 border-b border-studyrank-border last:border-0"
              >
                <span className="font-mono font-light text-studyrank-muted w-4 text-sm">
                  {i + 1}
                </span>
                <span className="flex-1 text-studyrank-primary text-sm font-medium">
                  {entry.name}
                </span>
                <span className="font-mono text-studyrank-secondary text-sm">
                  {entry.hours} hrs
                </span>
                <RankBadge tier={entry.tier} division={entry.div} size="sm" />
              </div>
            ))}
          </div>
        </div>

        <p className="text-studyrank-muted text-xs">
          Every session is AI-verified. No padding. No cheating.
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <p className="uppercase tracking-[0.3em] text-studyrank-purple text-xs font-semibold mb-8">
            StudyRank
          </p>

          <h1 className="font-bold tracking-tight text-3xl text-studyrank-primary mb-8">
            Create account
          </h1>

          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Your name"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <Button type="submit" fullWidth disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-studyrank-border" />
            <span className="text-studyrank-muted text-xs uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-studyrank-border" />
          </div>

          <Button
            variant="secondary"
            fullWidth
            onClick={handleGoogle}
            disabled={googleLoading}
          >
            <GoogleIcon />
            <span className="ml-2">
              {googleLoading ? "Redirecting…" : "Continue with Google"}
            </span>
          </Button>

          <p className="mt-6 text-center text-studyrank-secondary text-sm">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-studyrank-purple hover:text-studyrank-primary transition-colors"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

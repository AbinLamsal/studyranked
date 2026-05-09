"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { RankBadge } from "@/components/ui/RankBadge";
import { RankTier } from "@/lib/types";

type HoursOption = {
  label: string;
  sublabel: string;
  tier: RankTier;
};

const HOURS_OPTIONS: HoursOption[] = [
  { label: "Less than 5 hours", sublabel: "Getting started", tier: "bronze" },
  { label: "5–10 hours", sublabel: "Building habits", tier: "silver" },
  { label: "10–20 hours", sublabel: "Serious grind", tier: "gold" },
  { label: "20+ hours", sublabel: "Full send", tier: "platinum" },
];

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <circle cx="8" cy="8" r="7.5" stroke="#1D9E75" />
      <path
        d="M4.5 8l2.5 2.5 4.5-5"
        stroke="#1D9E75"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      className="mx-auto"
    >
      <rect
        x="4"
        y="14"
        width="40"
        height="28"
        rx="4"
        stroke="#6c64d4"
        strokeWidth="2"
      />
      <circle cx="24" cy="28" r="8" stroke="#6c64d4" strokeWidth="2" />
      <circle cx="24" cy="28" r="3.5" stroke="#6c64d4" strokeWidth="1.5" />
      <path
        d="M16 14v-2a2 2 0 012-2h12a2 2 0 012 2v2"
        stroke="#6c64d4"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="38" cy="20" r="2" fill="#6c64d4" />
    </svg>
  );
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === current
              ? "w-6 h-2 bg-studyrank-purple"
              : i < current
              ? "w-2 h-2 bg-studyrank-purple/40"
              : "w-2 h-2 bg-studyrank-border"
          }`}
        />
      ))}
    </div>
  );
}

function RankProgressBar({ points, max }: { points: number; max: number }) {
  const pct = Math.min((points / max) * 100, 100);
  return (
    <div className="w-full h-1.5 bg-studyrank-border rounded-full overflow-hidden">
      <div
        className="h-full bg-studyrank-gold rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [selectedTier, setSelectedTier] = useState<RankTier | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleFinish() {
    if (!selectedTier) return;
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from("profiles")
        .update({ rank_tier: selectedTier, rank_division: 2 })
        .eq("id", user.id);
    }

    router.push("/home");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-studyrank-base flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <p className="uppercase tracking-[0.3em] text-studyrank-purple text-xs font-semibold text-center mb-10">
          StudyRank
        </p>

        <StepDots current={step} total={3} />

        <div className="mt-10">
          {step === 0 && (
            <div className="flex flex-col items-center text-center">
              <CameraIcon />
              <h2 className="font-bold tracking-tight text-2xl text-studyrank-primary mt-6 mb-2">
                Your camera. Your device. Always.
              </h2>
              <p className="text-studyrank-secondary text-sm mb-8">
                Focus tracking happens entirely on your machine.
              </p>

              <div className="w-full bg-studyrank-card border border-studyrank-border rounded-lg p-5 flex flex-col gap-4 text-left mb-8">
                {[
                  "AI runs on your device — nothing is uploaded",
                  "No footage is stored or recorded",
                  "You can disable camera any time in settings",
                ].map((point) => (
                  <div key={point} className="flex items-start gap-3">
                    <CheckIcon />
                    <p className="text-studyrank-primary text-sm">{point}</p>
                  </div>
                ))}
              </div>

              <Button fullWidth onClick={() => setStep(1)}>
                Got it, continue
              </Button>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="font-bold tracking-tight text-2xl text-studyrank-primary mb-1">
                Let&apos;s place your rank
              </h2>
              <p className="text-studyrank-secondary text-sm mb-8">
                3 quick questions
              </p>

              <p className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted mb-4">
                How many hours do you study per week?
              </p>

              <div className="flex flex-col gap-3 mb-8">
                {HOURS_OPTIONS.map((opt) => (
                  <button
                    key={opt.tier}
                    onClick={() => setSelectedTier(opt.tier)}
                    className={`w-full text-left px-4 py-4 rounded-lg bg-studyrank-card border transition-all duration-150 ${
                      selectedTier === opt.tier
                        ? "border-studyrank-purple bg-studyrank-purple/10"
                        : "border-studyrank-border hover:border-studyrank-secondary"
                    }`}
                  >
                    <p className="text-studyrank-primary font-medium text-sm">
                      {opt.label}
                    </p>
                    <p className="text-studyrank-muted text-xs mt-0.5">
                      {opt.sublabel}
                    </p>
                  </button>
                ))}
              </div>

              {selectedTier && (
                <Button fullWidth onClick={() => setStep(2)}>
                  Next
                </Button>
              )}
            </div>
          )}

          {step === 2 && selectedTier && (
            <div className="flex flex-col items-center text-center">
              <p className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted mb-6">
                Your starting rank
              </p>

              <div className="w-24 h-24 rounded-lg bg-studyrank-gold/10 border border-studyrank-gold/30 flex items-center justify-center mb-6">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 40 40"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M20 4l4.9 9.9 10.9 1.6-7.9 7.7 1.9 10.8L20 29.4l-9.8 5.2 1.9-10.8L4.2 15.5l10.9-1.6L20 4z"
                    stroke="#c9a227"
                    strokeWidth="1.5"
                    fill="none"
                  />
                </svg>
              </div>

              <RankBadge tier={selectedTier} division={2} />

              <h2 className="font-bold tracking-tight text-2xl text-studyrank-primary mt-4 mb-1">
                You&apos;re starting in{" "}
                {selectedTier.charAt(0).toUpperCase() + selectedTier.slice(1)} II
              </h2>
              <p className="text-studyrank-secondary text-sm mb-6">
                Rank up by logging verified focus sessions.
              </p>

              <div className="w-full mb-2">
                <div className="flex justify-between text-xs text-studyrank-muted mb-2">
                  <span>0 RP</span>
                  <span>100 RP</span>
                </div>
                <RankProgressBar points={0} max={100} />
              </div>

              <p className="text-studyrank-muted text-xs mb-8">
                Earn rank points every session to reach{" "}
                {selectedTier.charAt(0).toUpperCase() + selectedTier.slice(1)} I
              </p>

              <Button fullWidth onClick={handleFinish} disabled={saving}>
                {saving ? "Setting up…" : "Let's go"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

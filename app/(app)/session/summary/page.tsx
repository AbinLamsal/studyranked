"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface SummaryData {
  totalSeconds: number;
  verifiedSeconds: number;
  penaltySeconds: number;
  distractionCount: number;
  subject: string;
  rankPointsEarned: number;
  date: string;
}

function fmt(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function SessionSummaryPage() {
  const router = useRouter();
  const [data, setData] = useState<SummaryData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("studyrank_session");
    if (!raw) {
      router.replace("/home");
      return;
    }
    try {
      setData(JSON.parse(raw));
    } catch {
      router.replace("/home");
    }
  }, [router]);

  if (!data) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[#6c64d4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const focusRate =
    data.totalSeconds > 0
      ? Math.round((data.verifiedSeconds / data.totalSeconds) * 100)
      : 100;

  const handleShare = async () => {
    const text = `📚 StudyRank — ${data.date}
⏱ ${fmt(data.verifiedSeconds)} verified
🎯 ${focusRate}% focus rate
⚡ +${data.rankPointsEarned} RP
studyrank.app`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied — silently ignore
    }
  };

  const stats = [
    { label: "Total Time", value: fmt(data.totalSeconds) },
    { label: "Verified Time", value: fmt(data.verifiedSeconds) },
    { label: "Focus Rate", value: `${focusRate}%` },
    { label: "Distractions", value: String(data.distractionCount) },
  ];

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">

        {/* Checkmark */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-[#0a1f12] border border-[#1D9E75] flex items-center justify-center">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1D9E75"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-xl font-light text-[#e8e8ff]">
            Session complete
          </h1>
          {data.subject && (
            <p className="text-sm text-[#444466] mt-1">{data.subject}</p>
          )}
        </div>

        {/* Stats grid */}
        <div className="bg-[#0f0f1a] border border-[#1e1e32] rounded-xl p-5">
          <div className="grid grid-cols-2 gap-5">
            {stats.map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="font-mono text-xl tabular-nums text-[#e8e8ff]">
                  {value}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-[#444466] mt-0.5">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rank points */}
        <div className="bg-[#0f0f1a] border border-[#c9a227] rounded-xl p-5 text-center space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-[#444466]">
            Rank Points Earned
          </p>
          <div
            className="font-mono text-[#c9a227] tabular-nums"
            style={{ fontSize: 44, fontWeight: 200, lineHeight: 1 }}
          >
            +{data.rankPointsEarned} RP
          </div>
          {data.rankPointsEarned === 0 && (
            <p className="text-xs text-[#444466]">
              Study longer to earn rank points
            </p>
          )}
          {data.rankPointsEarned > 0 && (
            <p className="text-xs text-[#444466]">
              Added to your rank progress
            </p>
          )}
        </div>

        {/* Share */}
        <button
          onClick={handleShare}
          className="w-full py-3 bg-[#0f0f1a] border border-[#1e1e32] rounded-lg text-xs uppercase tracking-widest text-[#888899] hover:text-[#e8e8ff] hover:border-[#444466] transition-colors"
        >
          {copied ? "Copied!" : "Share Session"}
        </button>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Link
            href="/session"
            className="flex-1 py-3 bg-[#6c64d4] rounded-lg text-sm text-white text-center uppercase tracking-wider hover:bg-[#7b74d8] transition-colors"
          >
            Study Again
          </Link>
          <Link
            href="/home"
            className="flex-1 py-3 bg-[#1a1a2e] border border-[#1e1e32] rounded-lg text-sm text-[#888899] text-center uppercase tracking-wider hover:text-[#e8e8ff] transition-colors"
          >
            Home
          </Link>
        </div>

        <p className="text-center text-[10px] text-[#444466]">{data.date}</p>
      </div>
    </div>
  );
}

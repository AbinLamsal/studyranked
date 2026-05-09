import { RankTier, RANK_LABELS } from "@/lib/types";

interface RankBadgeProps {
  tier: RankTier;
  division: number;
  size?: "sm" | "md";
}

export function RankBadge({ tier, division, size = "md" }: RankBadgeProps) {
  const roman = ["I", "II", "III"][division - 1] ?? "I";
  const label = `${RANK_LABELS[tier].toUpperCase()} ${roman}`;

  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[10px]"
      : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center font-semibold tracking-widest uppercase rounded-md border border-studyrank-gold/40 bg-studyrank-gold/10 text-studyrank-gold ${sizeClasses}`}
    >
      {label}
    </span>
  );
}

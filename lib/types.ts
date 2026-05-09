export type RankTier =
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "master"
  | "grandmaster";

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  rank_tier: RankTier | null;
  rank_division: 1 | 2 | 3 | null;
  rank_points: number;
  weekly_hours: number;
  streak_days: number;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  verified_seconds: number | null;
  distraction_count: number | null;
  rank_points_earned: number | null;
  subject: string | null;
}

export interface RankInfo {
  tier: RankTier;
  division: 1 | 2 | 3;
  label: string;
}

export const RANK_LABELS: Record<RankTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  diamond: "Diamond",
  master: "Master",
  grandmaster: "Grandmaster",
};

export function getRankLabel(tier: RankTier, division: number): string {
  return `${RANK_LABELS[tier]} ${["I", "II", "III"][division - 1]}`;
}

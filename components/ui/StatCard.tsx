interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
}

export function StatCard({ label, value, unit }: StatCardProps) {
  return (
    <div className="flex-1 bg-studyrank-card border border-studyrank-border rounded-lg p-4">
      <p className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted mb-3">
        {label}
      </p>
      <p className="font-mono font-light tracking-widest text-studyrank-primary text-2xl">
        {value}
        {unit && (
          <span className="text-sm text-studyrank-secondary ml-1">{unit}</span>
        )}
      </p>
    </div>
  );
}

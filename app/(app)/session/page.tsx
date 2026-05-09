"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export default function SessionPage() {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  function handleEnd() {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    router.push("/home");
  }

  return (
    <div className="min-h-screen bg-studyrank-base flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 w-full max-w-md">
        <p className="uppercase text-xs font-semibold tracking-widest text-studyrank-muted">
          Study Session
        </p>

        <div className="my-8">
          <p className="font-mono font-light tracking-widest text-studyrank-primary text-6xl text-center tabular-nums">
            {formatTime(elapsed)}
          </p>
        </div>

        <div className="w-full h-px bg-studyrank-border mb-4" />

        <p className="text-studyrank-muted text-xs uppercase tracking-widest text-center">
          Camera coming in week 2
        </p>

        <div className="mt-8 w-full">
          <Button variant="secondary" fullWidth onClick={handleEnd}>
            End Session
          </Button>
        </div>
      </div>
    </div>
  );
}

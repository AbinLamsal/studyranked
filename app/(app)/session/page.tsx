"use client";

import { useEffect, useRef, useReducer, useState } from "react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

type SessionStatus = "pre" | "active" | "ended";
type FocusState = "focused" | "distracted" | "drowsy";
type CameraStatus = "idle" | "requesting" | "initializing" | "ready" | "denied";

interface SessionState {
  status: SessionStatus;
  focusState: FocusState;
  totalSeconds: number;
  verifiedSeconds: number;
  penaltySeconds: number;
  currentDistractionSeconds: number;
  distractionCount: number;
  subject: string;
  cameraGranted: boolean;
  startedAt: Date | null;
}

type Action =
  | { type: "START"; subject: string; cameraGranted: boolean }
  | { type: "TICK" }
  | { type: "SET_FOCUS"; state: FocusState }
  | { type: "COUNT_DISTRACTION" }
  | { type: "SET_SUBJECT"; subject: string }
  | { type: "END" };

// ── Reducer ────────────────────────────────────────────────────────────────────

const init: SessionState = {
  status: "pre",
  focusState: "focused",
  totalSeconds: 0,
  verifiedSeconds: 0,
  penaltySeconds: 0,
  currentDistractionSeconds: 0,
  distractionCount: 0,
  subject: "",
  cameraGranted: false,
  startedAt: null,
};

function reducer(s: SessionState, a: Action): SessionState {
  switch (a.type) {
    case "START":
      return {
        ...s,
        status: "active",
        subject: a.subject,
        cameraGranted: a.cameraGranted,
        startedAt: new Date(),
      };
    case "TICK": {
      if (s.status !== "active") return s;
      // Manual mode (no camera): time accrues but is NOT verified
      if (!s.cameraGranted) {
        return { ...s, totalSeconds: s.totalSeconds + 1 };
      }
      const focused = s.focusState === "focused";
      return {
        ...s,
        totalSeconds: s.totalSeconds + 1,
        verifiedSeconds: focused ? s.verifiedSeconds + 1 : s.verifiedSeconds,
        penaltySeconds: focused ? s.penaltySeconds : s.penaltySeconds + 1,
        currentDistractionSeconds: focused
          ? 0
          : s.currentDistractionSeconds + 1,
      };
    }
    case "SET_FOCUS":
      return s.focusState === a.state ? s : { ...s, focusState: a.state };
    case "COUNT_DISTRACTION":
      return { ...s, distractionCount: s.distractionCount + 1 };
    case "SET_SUBJECT":
      return { ...s, subject: a.subject };
    case "END":
      return { ...s, status: "ended" };
    default:
      return s;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ptDist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Eye Aspect Ratio — 6 landmarks per eye [outer, top1, top2, inner, bot1, bot2]
function computeEAR(eye: { x: number; y: number }[]) {
  const [p1, p2, p3, p4, p5, p6] = eye;
  const h = ptDist(p1, p4);
  return h > 0 ? (ptDist(p2, p6) + ptDist(p3, p5)) / (2 * h) : 0;
}

function fmt(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtPenalty(s: number) {
  return `+${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDistraction(s: number) {
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} so far`;
}


const SUBJECTS = ["Biology", "Maths", "History", "Coding", "Physics", "English"];

const FRIENDS = [
  { pos: 1, name: "Alex H", hours: 2.3, rank: "Gold I" },
  { pos: 2, name: "Zara M", hours: 1.8, rank: "Silver II" },
  { pos: 3, name: "Daniel K", hours: 0.9, rank: "Bronze I" },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function SessionPage() {
  const router = useRouter();
  const [s, dispatch] = useReducer(reducer, init);
  const [camStatus, setCamStatus] = useState<CameraStatus>("idle");
  const [showEndModal, setShowEndModal] = useState(false);
  const [customSubject, setCustomSubject] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiPreloading, setAiPreloading] = useState(true);

  // DOM refs
  const launchingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faceapiRef = useRef<any>(null);
  const faceMeshReadyRef = useRef(false);     // true once models are loaded
  const animFrameRef = useRef<number>(0);
  const mountedRef = useRef(true);

  // Detection timing refs — updated per frame, no re-renders needed
  const rawFocusRef = useRef<FocusState>("focused");
  const lastFaceSeenRef = useRef(Date.now());
  const drowsyStartRef = useRef<number | null>(null);
  const distractionStartRef = useRef<number | null>(null);
  const distractionCountedRef = useRef(false);
  const focusReturnStartRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);

  // Parse subject from URL on mount
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("subject");
    if (p) dispatch({ type: "SET_SUBJECT", subject: p });
  }, []);

  // Master cleanup on unmount.
  // mountedRef is reset to true on every setup so React 18 Strict Mode's
  // setup→cleanup→setup cycle doesn't leave it stuck at false.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Attach the camera stream once the video element renders (after dispatch(START))
  useEffect(() => {
    if (s.cameraGranted && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch((err) =>
        console.error("video play failed:", err)
      );
    }
  }, [s.cameraGranted]);

  // ── face-api.js: load from localhost /models (no CDN, loads in ~200ms) ────────

  useEffect(() => {
    const run = async () => {
      const t0 = performance.now();
      const log = (msg: string) =>
        console.log(`[AI] ${msg} (${Math.round(performance.now() - t0)}ms)`);
      try {
        log("importing face-api");
        const faceapi = await import("@vladmandic/face-api");
        log("imported");
        // CPU backend skips WebGL shader compilation (~3s saved on first load)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (faceapi as any).tf.setBackend("cpu");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (faceapi as any).tf.ready();
        log("CPU backend ready");
        await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
        log("face detector model loaded");
        await faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models");
        log("landmark model loaded");
        if (!mountedRef.current) return;
        faceapiRef.current = faceapi;
        faceMeshReadyRef.current = true;
        setAiPreloading(false);
        setCamStatus((prev) => (prev === "initializing" ? "ready" : prev));
        log("READY ✓");
      } catch (err) {
        console.error("[AI] load failed:", err);
        setAiPreloading(false);
        setCamStatus((prev) => (prev === "initializing" ? "denied" : prev));
      }
    };
    run();
  }, []);

  // ── Frame loop: camera preview + face detection ───────────────────────────────

  useEffect(() => {
    if (s.status !== "active" || !s.cameraGranted) return;

    const draw = async (ts: number) => {
      const video = videoRef.current;

      if (video && video.readyState >= 2) {
        // Video element shows its own preview directly; just run AI here.
        if (faceMeshReadyRef.current && faceapiRef.current && ts - lastFrameTimeRef.current > 100) {
          lastFrameTimeRef.current = ts;
          try {
            const faceapi = faceapiRef.current;
            const now = Date.now();
            const result = await faceapi
              .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
              .withFaceLandmarks(true);

            if (!result) {
              if ((now - lastFaceSeenRef.current) / 1000 >= 2) {
                rawFocusRef.current = "distracted";
              }
            } else {
              lastFaceSeenRef.current = now;
              const { landmarks, detection } = result;
              const box = detection.box;

              // Compare nose tip to FACE-BOX center (not video center) so it's
              // robust to the user sitting off-centre relative to the camera.
              const noseTip = landmarks.getNose()[3];
              const faceCenterX = box.x + box.width / 2;
              const noseOffset = (noseTip.x - faceCenterX) / box.width;

              if (Math.abs(noseOffset) > 0.13) {
                rawFocusRef.current = "distracted";
                drowsyStartRef.current = null;
              } else {
                // EAR with proper 6-point eye landmarks
                const avgEAR =
                  (computeEAR(landmarks.getLeftEye()) + computeEAR(landmarks.getRightEye())) / 2;
                if (avgEAR < 0.2) {
                  if (!drowsyStartRef.current) drowsyStartRef.current = now;
                  if ((now - drowsyStartRef.current!) / 1000 >= 1.5) {
                    rawFocusRef.current = "drowsy";
                    try { navigator.vibrate?.([200, 100, 200]); } catch {}
                  }
                } else {
                  drowsyStartRef.current = null;
                  rawFocusRef.current = "focused";
                }
              }
            }
          } catch { /* ignore per-frame errors */ }
        }
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [s.status, s.cameraGranted]);

  // ── 1Hz time ticker — increments seconds counters ───────────────────────────

  useEffect(() => {
    if (s.status !== "active") return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [s.status]);

  // ── 4Hz focus state poller — UI reacts ~4× faster than before ───────────────

  useEffect(() => {
    if (s.status !== "active" || !s.cameraGranted) return;

    const id = setInterval(() => {
      const raw = rawFocusRef.current;
      const now = Date.now();

      if (raw !== "focused") {
        focusReturnStartRef.current = null;
        if (distractionStartRef.current === null) {
          distractionStartRef.current = now;
          distractionCountedRef.current = false;
        }
        // Count as distraction event after 3s sustained
        const dur = (now - distractionStartRef.current!) / 1000;
        if (dur >= 3 && !distractionCountedRef.current) {
          distractionCountedRef.current = true;
          dispatch({ type: "COUNT_DISTRACTION" });
        }
        dispatch({ type: "SET_FOCUS", state: raw });
      } else {
        // Grace: 500ms of "focused" required before switching back
        if (focusReturnStartRef.current === null) {
          focusReturnStartRef.current = now;
        }
        if ((now - focusReturnStartRef.current!) / 1000 >= 0.5) {
          distractionStartRef.current = null;
          dispatch({ type: "SET_FOCUS", state: "focused" });
        }
      }
    }, 250);

    return () => clearInterval(id);
  }, [s.status, s.cameraGranted]);

  // ── Start session ────────────────────────────────────────────────────────────

  const handleStart = async (subject: string) => {
    if (launchingRef.current) return;
    launchingRef.current = true;
    setCamStatus("requesting");
    let granted = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      // The video element doesn't exist yet — it renders after dispatch(START).
      // The attach effect below wires the stream once it mounts.
      granted = true;
      // If AI already finished loading in the background, skip the spinner
      setCamStatus(faceMeshReadyRef.current ? "ready" : "initializing");
    } catch {
      setCamStatus("denied");
      await new Promise((r) => setTimeout(r, 2000));
    }

    dispatch({ type: "START", subject: subject || "Focus Session", cameraGranted: granted });
    // No init call needed — face-api loads from page-open effect
  };

  // ── End session ──────────────────────────────────────────────────────────────

  const handleEnd = async () => {
    if (saving) return;
    setSaving(true);

    const rankPointsEarned = Math.floor((s.verifiedSeconds / 60) * 0.5);

    try {
      await fetch("/api/session/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startedAt: s.startedAt?.toISOString() ?? new Date().toISOString(),
          endedAt: new Date().toISOString(),
          totalSeconds: s.totalSeconds,
          verifiedSeconds: s.verifiedSeconds,
          distractionCount: s.distractionCount,
          rankPointsEarned,
          subject: s.subject || null,
        }),
      });
    } catch (err) {
      console.error("Save session error:", err);
    }

    sessionStorage.setItem(
      "studyrank_session",
      JSON.stringify({
        totalSeconds: s.totalSeconds,
        verifiedSeconds: s.verifiedSeconds,
        penaltySeconds: s.penaltySeconds,
        distractionCount: s.distractionCount,
        subject: s.subject,
        rankPointsEarned,
        date: new Date().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      })
    );

    dispatch({ type: "END" });
    router.push("/session/summary");
  };

  // ── Computed ─────────────────────────────────────────────────────────────────

  const focusRate =
    s.totalSeconds > 0
      ? Math.round((s.verifiedSeconds / s.totalSeconds) * 100)
      : 100;

  const borderColor =
    s.focusState === "focused"
      ? "#1D9E75"
      : s.focusState === "distracted"
        ? "#EF9F27"
        : "#E24B4A";

  const selectedSubject = customSubject || s.subject;

  // ════════════════════════════════════════════════════════════════════════════
  // PRE-SESSION SCREEN
  // ════════════════════════════════════════════════════════════════════════════

  if (s.status === "pre") {
    return (
      <div className="min-h-screen bg-[#080810] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-[#444466]">
              StudyRank
            </p>
            <h1 className="text-2xl font-light text-[#e8e8ff]">
              Ready to lock in?
            </h1>
          </div>

          {/* Subject selector */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-[#444466]">
              Subject
            </p>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((sub) => (
                <button
                  key={sub}
                  onClick={() => {
                    dispatch({ type: "SET_SUBJECT", subject: sub });
                    setCustomSubject("");
                  }}
                  className={`px-3 py-1.5 rounded text-xs uppercase tracking-wider border transition-colors ${
                    s.subject === sub && !customSubject
                      ? "bg-[#6c64d4] border-[#6c64d4] text-white"
                      : "border-[#1e1e32] text-[#888899] hover:border-[#6c64d4] hover:text-[#e8e8ff]"
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Other subject..."
              value={customSubject}
              onChange={(e) => {
                setCustomSubject(e.target.value);
                if (e.target.value)
                  dispatch({ type: "SET_SUBJECT", subject: e.target.value });
              }}
              className="w-full bg-[#0f0f1a] border border-[#1e1e32] rounded px-3 py-2 text-sm text-[#e8e8ff] placeholder-[#444466] focus:outline-none focus:border-[#6c64d4]"
            />
          </div>

          {camStatus === "denied" && (
            <div className="bg-[#1a1a2e] border border-[#1e1e32] rounded-lg p-3 text-xs space-y-1">
              <p className="text-[#EF9F27]">
                No camera access — starting in manual mode
              </p>
              <p className="text-[#444466]">
                Your hours won&apos;t be verified but you can still track time.
              </p>
            </div>
          )}

          <button
            onClick={() => handleStart(selectedSubject)}
            disabled={
              camStatus === "requesting" || camStatus === "initializing"
            }
            className="w-full py-4 bg-[#6c64d4] text-white uppercase tracking-widest text-sm font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#7b74d8] transition-colors"
          >
            {camStatus === "requesting"
              ? "Requesting camera..."
              : camStatus === "initializing"
                ? "Starting..."
                : "START SESSION"}
          </button>

          <div className="flex items-center justify-center gap-2">
            {aiPreloading ? (
              <>
                <div className="w-2.5 h-2.5 border border-[#444466] border-t-[#6c64d4] rounded-full animate-spin" />
                <span className="text-xs text-[#444466]">
                  Warming up AI in background...
                </span>
              </>
            ) : (
              <span className="text-xs text-[#1D9E75]">
                ● AI ready · Camera used only for focus detection
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ACTIVE SESSION
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col">
      {/* Video element rendered directly inside the camera circle below */}

      {/* TOP BAR */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[#0f0f1a] border-b border-[#1e1e32]">
        <button
          onClick={() => setShowEndModal(true)}
          className="p-1 text-[#888899] hover:text-[#e8e8ff] transition-colors"
          aria-label="End session"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>

        <div className="px-3 py-1 bg-[#1a1a2e] border border-[#1e1e32] rounded-full">
          <span className="text-xs uppercase tracking-widest text-[#e8e8ff]">
            {s.subject || "FOCUS SESSION"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inset-0 rounded-full bg-red-500 opacity-75" />
            <span className="relative rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-[10px] uppercase tracking-widest text-[#888899]">
            LIVE
          </span>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-8 max-w-sm mx-auto space-y-4">

          {/* MAIN TIMER — full width, centered */}
          <div className="pt-2 pb-1 text-center">
            <div
              className="font-mono text-[#e8e8ff] tabular-nums"
              style={{
                fontSize: "clamp(44px, 12vw, 80px)",
                fontWeight: 200,
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {fmt(s.totalSeconds)}
            </div>
            <p className="text-[10px] uppercase tracking-widest text-[#444466] mt-2">
              Total Time
            </p>

            <div
              className="mt-3 font-mono text-[#888899] tabular-nums"
              style={{ fontSize: 22, fontWeight: 300 }}
            >
              {fmt(s.verifiedSeconds)}
            </div>
            <p className="text-[10px] uppercase tracking-widest text-[#444466] mt-0.5">
              Verified Time
            </p>
          </div>

          {/* CAMERA PREVIEW — visible video, centred below timer */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="relative rounded-full overflow-hidden border-[3px] transition-colors duration-500"
              style={{ width: 140, height: 140, borderColor }}
            >
              {/* Video is always rendered when camera is granted — even during AI init */}
              {s.cameraGranted ? (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />
                  {camStatus === "initializing" && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
                      <div className="w-5 h-5 border-2 border-[#6c64d4] border-t-transparent rounded-full animate-spin" />
                      <span className="text-[9px] uppercase tracking-widest text-[#e8e8ff]">
                        Loading AI
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full bg-[#1a1a2e] flex flex-col items-center justify-center gap-2">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#444466"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="m1 1 22 22" />
                    <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
                  </svg>
                  <span className="text-[9px] text-[#444466] uppercase tracking-wide">
                    Manual mode
                  </span>
                </div>
              )}
            </div>

            {/* AI detection status label */}
            {s.cameraGranted && camStatus === "ready" && (
              <span
                className="text-[10px] uppercase tracking-widest"
                style={{
                  color:
                    s.focusState === "focused"
                      ? "#1D9E75"
                      : s.focusState === "distracted"
                        ? "#EF9F27"
                        : "#E24B4A",
                }}
              >
                {s.focusState === "focused"
                  ? "● AI tracking · looking straight"
                  : s.focusState === "distracted"
                    ? "● Looking away"
                    : "● Drowsy detected"}
              </span>
            )}
            {s.cameraGranted && camStatus === "initializing" && (
              <span className="text-[10px] uppercase tracking-widest text-[#444466]">
                Initializing camera AI...
              </span>
            )}
          </div>

          {/* FOCUS STATE CARD */}
          {!s.cameraGranted && (
            <div
              className="rounded-lg p-4"
              style={{
                background: "#0f0f1a",
                border: "1px solid #1e1e32",
                borderLeftWidth: 3,
              }}
            >
              <span className="text-xs uppercase tracking-widest font-semibold text-[#888899]">
                Manual Mode
              </span>
              <p className="text-xs text-[#444466] mt-1">
                Time tracked but not verified · No rank points
              </p>
            </div>
          )}

          {s.cameraGranted && s.focusState === "focused" && (
            <div
              className="rounded-lg p-4"
              style={{
                background: "#0a1f12",
                border: "1px solid #1D9E75",
                borderLeftWidth: 3,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inset-0 rounded-full bg-[#1D9E75] opacity-75" />
                  <span className="relative rounded-full h-2 w-2 bg-[#1D9E75]" />
                </span>
                <span className="text-xs uppercase tracking-widest font-semibold text-[#1D9E75]">
                  Locked In
                </span>
              </div>
              <p className="text-xs text-[#444466]">
                Rank points accumulating
              </p>
            </div>
          )}

          {s.cameraGranted && s.focusState === "distracted" && (
            <div
              className="rounded-lg p-4 distracted-card"
              style={{
                background: "#1f1500",
                border: "1px solid #EF9F27",
                borderLeftWidth: 3,
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs uppercase tracking-widest font-semibold text-[#EF9F27]">
                  Look Away Detected
                </span>
                <span className="text-xs font-mono text-[#EF9F27]">
                  {fmtDistraction(s.currentDistractionSeconds)}
                </span>
              </div>
              <p className="text-xs text-[#444466]">
                Timer paused · penalty adding
              </p>
            </div>
          )}

          {s.cameraGranted && s.focusState === "drowsy" && (
            <div
              className="rounded-lg p-4 drowsy-card"
              style={{
                background: "#1f0a0a",
                border: "1px solid #E24B4A",
                borderLeftWidth: 3,
              }}
            >
              <span className="text-xs uppercase tracking-widest font-semibold text-[#E24B4A]">
                Drowsy Detected
              </span>
              <p className="text-xs text-[#444466] mt-1">
                Wake up — timer paused
              </p>
            </div>
          )}

          {/* STATS ROW */}
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                label: "Distractions",
                value: String(s.distractionCount),
                color: "#e8e8ff",
              },
              {
                label: "Penalty",
                value: fmtPenalty(s.penaltySeconds),
                color: "#EF9F27",
              },
              { label: "Focus Rate", value: `${focusRate}%`, color: "#e8e8ff" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="bg-[#0f0f1a] border border-[#1e1e32] rounded-lg p-3 text-center"
              >
                <div
                  className="font-mono text-lg tabular-nums"
                  style={{ color }}
                >
                  {value}
                </div>
                <div className="text-[9px] uppercase tracking-widest text-[#444466] mt-0.5">
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* MANUAL MODE NOTICE */}
          {!s.cameraGranted && (
            <div className="flex items-center gap-2 bg-[#0f0f1a] border border-[#1e1e32] rounded-lg p-3">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#444466"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-xs text-[#444466]">
                Manual mode · Allow camera to enable AI tracking
              </span>
            </div>
          )}

          {/* MINI LEADERBOARD */}
          <div className="bg-[#0f0f1a] border border-[#1e1e32] rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#444466] mb-3">
              Friends Today
            </p>
            <div className="space-y-2.5">
              {FRIENDS.map((f) => (
                <div key={f.name} className="flex items-center gap-3">
                  <span className="w-3 text-[10px] font-mono text-[#444466]">
                    {f.pos}
                  </span>
                  <span className="flex-1 text-sm text-[#e8e8ff]">
                    {f.name}
                  </span>
                  <span className="font-mono text-sm text-[#888899]">
                    {f.hours}h
                  </span>
                  <span className="px-2 py-0.5 bg-[#1a1a2e] border border-[#c9a227] rounded text-[9px] uppercase tracking-wide text-[#c9a227]">
                    {f.rank}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* END SESSION */}
          <button
            onClick={() => setShowEndModal(true)}
            className="w-full py-3 bg-[#1a1a2e] border border-[#2a2a4e] rounded-lg text-xs uppercase tracking-widest text-[#888899] hover:text-[#e8e8ff] hover:border-[#444466] transition-colors"
          >
            End Session
          </button>
        </div>
      </div>

      {/* END MODAL */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#0f0f1a] border border-[#1e1e32] rounded-xl p-6 w-full max-w-xs space-y-4">
            <h2 className="text-base font-medium text-[#e8e8ff]">
              End session?
            </h2>
            <p className="text-sm text-[#888899]">
              Your progress will be saved.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndModal(false)}
                className="flex-1 py-2.5 border border-[#1e1e32] rounded-lg text-sm text-[#888899] hover:text-[#e8e8ff] transition-colors"
              >
                Keep going
              </button>
              <button
                onClick={handleEnd}
                disabled={saving}
                className="flex-1 py-2.5 bg-[#6c64d4] rounded-lg text-sm text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "End session"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

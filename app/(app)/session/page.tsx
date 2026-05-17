"use client";

import { useEffect, useRef, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────────

type SessionStatus = "pre" | "active" | "ended";
type FocusState = "focused" | "distracted" | "drowsy";
type CameraStatus = "idle" | "requesting" | "initializing" | "ready" | "denied";
type CameraMode = "face" | "desk";
type DeskFocusState = "writing" | "hand_idle" | "no_hand" | "phone_on_desk";

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
  cameraMode: CameraMode;
  startedAt: Date | null;
}

type Action =
  | { type: "START"; subject: string; cameraGranted: boolean; cameraMode: CameraMode }
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
  cameraMode: "face",
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
        cameraMode: a.cameraMode,
        startedAt: new Date(),
      };
    case "TICK": {
      if (s.status !== "active") return s;
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

function calcPenaltyRP(penaltySeconds: number) {
  return Math.floor(penaltySeconds / 60);
}

function fmtDistraction(s: number) {
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} so far`;
}

const SUBJECTS = ["Biology", "Maths", "History", "Coding", "Physics", "English"];

const TIERS = [
  { label: "Bronze III", min: 0 }, { label: "Bronze II", min: 50 }, { label: "Bronze I", min: 100 },
  { label: "Silver III", min: 200 }, { label: "Silver II", min: 350 }, { label: "Silver I", min: 500 },
  { label: "Gold III", min: 750 }, { label: "Gold II", min: 1000 }, { label: "Gold I", min: 1250 },
  { label: "Platinum III", min: 1500 }, { label: "Platinum II", min: 1800 }, { label: "Platinum I", min: 2100 },
  { label: "Diamond III", min: 2500 }, { label: "Diamond II", min: 3000 }, { label: "Diamond I", min: 3500 },
  { label: "Master", min: 4000 }, { label: "Grandmaster", min: 5000 },
];
function getTier(points: number) {
  let t = TIERS[0];
  for (const tier of TIERS) { if (points >= tier.min) t = tier; }
  return t.label;
}

interface LeaderEntry { id: string; display_name: string | null; rank_points: number; }

// ── Component ──────────────────────────────────────────────────────────────────

export default function SessionPage() {
  const router = useRouter();
  const [s, dispatch] = useReducer(reducer, init);
  const [camStatus, setCamStatus] = useState<CameraStatus>("idle");
  const [showEndModal, setShowEndModal] = useState(false);
  const [customSubject, setCustomSubject] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiPreloading, setAiPreloading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<CameraMode>("face");
  const [aiCalibrated, setAiCalibrated] = useState(false);

  // DOM refs
  const launchingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faceapiRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cocoSsdRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handDetectorRef = useRef<any>(null);
  const faceMeshReadyRef = useRef(false);
  const handDetectorReadyRef = useRef(false);
  const animFrameRef = useRef<number>(0);
  const mountedRef = useRef(true);

  // Detection timing refs
  const rawFocusRef = useRef<FocusState>("focused");
  const lastFaceSeenRef = useRef(Date.now());
  const drowsyStartRef = useRef<number | null>(null);
  const distractionStartRef = useRef<number | null>(null);
  const distractionCountedRef = useRef(false);
  const focusReturnStartRef = useRef<number | null>(null);
  // Smoothing: EMA of deviation + consecutive-frame gate
  const smoothedDevRef = useRef(0);
  const distractedFramesRef = useRef(0);
  // Calibration: first 10 detected frames set the baseline head position
  const calibFramesRef = useRef<{ lateral: number; pitch: number }[]>([]);
  const calibratedRef = useRef(false);
  const baselineRef = useRef({ lateral: 0, pitch: 0.22 });
  // Keyboard/mouse activity — if active recently, user is working regardless of face angle
  const lastActivityRef = useRef(Date.now());
  const lastFrameTimeRef = useRef(0);
  const lastPhoneCheckRef = useRef(0);

  // Desk mode refs
  const deskFocusRef = useRef<DeskFocusState>("no_hand");
  const lastHandSeenRef = useRef(0);
  const handIdleStartRef = useRef<number | null>(null);
  const wristHistoryRef = useRef<{ x: number; y: number; t: number }[]>([]);

  // Parse subject from URL on mount
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("subject");
    if (p) dispatch({ type: "SET_SUBJECT", subject: p });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Track keyboard/mouse activity — overrides face detection while active
  useEffect(() => {
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener("keydown", onActivity);
    window.addEventListener("mousemove", onActivity);
    return () => {
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("mousemove", onActivity);
    };
  }, []);

  // Attach the camera stream once the video element renders
  useEffect(() => {
    if (s.cameraGranted && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch((err) =>
        console.error("video play failed:", err)
      );
    }
  }, [s.cameraGranted]);

  // ── Model preloading ─────────────────────────────────────────────────────────

  useEffect(() => {
    const run = async () => {
      const t0 = performance.now();
      const log = (msg: string) =>
        console.log(`[AI] ${msg} (${Math.round(performance.now() - t0)}ms)`);
      try {
        if (selectedMode === "face") {
          log("importing face-api");
          const faceapi = await import("@vladmandic/face-api");
          log("imported");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (faceapi as any).tf.setBackend("cpu");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (faceapi as any).tf.ready();
          log("CPU backend ready");
          await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
          log("face detector loaded");
          await faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models");
          log("landmark model loaded");
          if (!mountedRef.current) return;
          faceapiRef.current = faceapi;
          faceMeshReadyRef.current = true;

          // COCO-SSD for phone detection (face mode)
          log("loading coco-ssd");
          const cocoSsd = await import("@tensorflow-models/coco-ssd");
          cocoSsdRef.current = await cocoSsd.load({ base: "lite_mobilenet_v2" });
          log("coco-ssd ready");
        } else {
          // Desk mode: MediaPipe Hand Landmark + COCO-SSD
          log("loading mediapipe hand landmarker");
          const { HandLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
          const filesetResolver = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
          );
          handDetectorRef.current = await HandLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
              delegate: "GPU",
            },
            numHands: 1,
            runningMode: "VIDEO",
          });
          handDetectorReadyRef.current = true;
          log("hand landmarker ready");

          log("loading coco-ssd");
          const cocoSsd = await import("@tensorflow-models/coco-ssd");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tf = await import("@tensorflow/tfjs-core" as any);
          await import("@tensorflow/tfjs-backend-cpu");
          await tf.setBackend("cpu");
          await tf.ready();
          cocoSsdRef.current = await cocoSsd.load({ base: "lite_mobilenet_v2" });
          log("coco-ssd ready");
        }

        if (!mountedRef.current) return;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMode]);

  // ── Face mode frame loop ─────────────────────────────────────────────────────

  useEffect(() => {
    if (s.status !== "active" || !s.cameraGranted || s.cameraMode !== "face") return;

    const draw = async (ts: number) => {
      const video = videoRef.current;

      if (video && video.readyState >= 2) {
        if (faceMeshReadyRef.current && faceapiRef.current && ts - lastFrameTimeRef.current > 100) {
          lastFrameTimeRef.current = ts;
          try {
            const faceapi = faceapiRef.current;
            const now = Date.now();
            const result = await faceapi
              .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }))
              .withFaceLandmarks(true);

            if (!result) {
              if ((now - lastFaceSeenRef.current) / 1000 >= 3.5) {
                rawFocusRef.current = "distracted";
              }
            } else {
              lastFaceSeenRef.current = now;
              const { landmarks, detection } = result;
              const box = detection.box;

              const noseTip = landmarks.getNose()[3];
              const noseBridge = landmarks.getNose()[0];
              const faceCenterX = box.x + box.width / 2;
              const lateral = Math.abs((noseTip.x - faceCenterX) / box.width);
              const pitch = (noseTip.y - noseBridge.y) / box.height;

              // Calibration: average first 10 frames to set personal baseline
              if (!calibratedRef.current) {
                calibFramesRef.current.push({ lateral, pitch });
                if (calibFramesRef.current.length >= 10) {
                  const avg = (arr: number[]) => arr.reduce((a, b) => a + b) / arr.length;
                  baselineRef.current = {
                    lateral: avg(calibFramesRef.current.map(f => f.lateral)),
                    pitch:   avg(calibFramesRef.current.map(f => f.pitch)),
                  };
                  calibratedRef.current = true;
                  if (mountedRef.current) setAiCalibrated(true);
                }
                // Stay focused during calibration
                rawFocusRef.current = "focused";
              } else {
                // Deviation from personal baseline
                const lateralDev = lateral - baselineRef.current.lateral;
                const pitchDev   = Math.abs(pitch - baselineRef.current.pitch);
                const totalDev   = Math.max(lateralDev, pitchDev);

                // Asymmetric EMA: slow to worsen, fast to recover
                if (totalDev > smoothedDevRef.current) {
                  smoothedDevRef.current = 0.7 * smoothedDevRef.current + 0.3 * totalDev;
                } else {
                  smoothedDevRef.current = 0.3 * smoothedDevRef.current + 0.7 * totalDev;
                }

                if (smoothedDevRef.current > 0.12) {
                  distractedFramesRef.current = Math.min(distractedFramesRef.current + 1, 10);
                  if (distractedFramesRef.current >= 4) {
                    rawFocusRef.current = "distracted";
                    drowsyStartRef.current = null;
                  }
                } else {
                  distractedFramesRef.current = 0;
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
            }
          } catch { /* ignore per-frame errors */ }

          // Phone detection every 8s
          if (cocoSsdRef.current && ts - lastPhoneCheckRef.current > 8000) {
            lastPhoneCheckRef.current = ts;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cocoSsdRef.current.detect(video).then((preds: any[]) => {
              if (preds.some((p) => p.class === "cell phone" && p.score > 0.55)) {
                rawFocusRef.current = "distracted";
              }
            }).catch(() => {});
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [s.status, s.cameraGranted, s.cameraMode]);

  // ── Desk mode frame loop ─────────────────────────────────────────────────────

  useEffect(() => {
    if (s.status !== "active" || !s.cameraGranted || s.cameraMode !== "desk") return;

    const drawDesk = (ts: number) => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(drawDesk);
        return;
      }

      if (ts - lastFrameTimeRef.current > 100) {
        lastFrameTimeRef.current = ts;
        const now = Date.now();

        // Hand landmark detection
        if (handDetectorReadyRef.current && handDetectorRef.current) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const results: any = handDetectorRef.current.detectForVideo(video, ts);

            if (!results.landmarks || results.landmarks.length === 0) {
              if (lastHandSeenRef.current > 0 && now - lastHandSeenRef.current > 10000) {
                deskFocusRef.current = "no_hand";
              } else if (lastHandSeenRef.current === 0) {
                // Haven't seen a hand yet — start the clock
                if (!handIdleStartRef.current) handIdleStartRef.current = now;
                const waitSecs = (now - handIdleStartRef.current) / 1000;
                if (waitSecs > 10) deskFocusRef.current = "no_hand";
              }
            } else {
              lastHandSeenRef.current = now;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const hand: any[] = results.landmarks[0]; // 21 normalised landmarks

              // Pen grip: thumb tip (4) and index tip (8) close together
              const thumbTip = hand[4];
              const indexTip = hand[8];
              const pinchDist = Math.hypot(
                thumbTip.x - indexTip.x,
                thumbTip.y - indexTip.y
              );
              const isPenGrip = pinchDist < 0.07;

              // Writing motion: track wrist (0) position variance over 2s
              const wrist = hand[0];
              wristHistoryRef.current.push({ x: wrist.x, y: wrist.y, t: now });
              wristHistoryRef.current = wristHistoryRef.current.filter(
                (p) => now - p.t < 2000
              );
              const xs = wristHistoryRef.current.map((p) => p.x);
              const variance = xs.length > 3
                ? Math.max(...xs) - Math.min(...xs)
                : 0;
              const isMoving = variance > 0.015;

              if (isPenGrip && isMoving) {
                deskFocusRef.current = "writing";
                handIdleStartRef.current = null;
              } else {
                if (!handIdleStartRef.current) handIdleStartRef.current = now;
                deskFocusRef.current = "hand_idle";
              }
            }
          } catch { /* ignore per-frame errors */ }
        }

        // Phone on desk every 8s
        if (cocoSsdRef.current && ts - lastPhoneCheckRef.current > 8000) {
          lastPhoneCheckRef.current = ts;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cocoSsdRef.current.detect(video).then((preds: any[]) => {
            if (preds.some((p) => p.class === "cell phone" && p.score > 0.55)) {
              deskFocusRef.current = "phone_on_desk";
            }
          }).catch(() => {});
        }
      }

      animFrameRef.current = requestAnimationFrame(drawDesk);
    };

    animFrameRef.current = requestAnimationFrame(drawDesk);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [s.status, s.cameraGranted, s.cameraMode]);

  // ── 1Hz time ticker ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (s.status !== "active") return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [s.status]);

  // ── 4Hz focus state poller ───────────────────────────────────────────────────

  useEffect(() => {
    if (s.status !== "active" || !s.cameraGranted) return;

    const id = setInterval(() => {
      const now = Date.now();

      // If the user typed or moved mouse in the last 6s, they're working — skip all checks
      if (s.cameraMode === "face" && now - lastActivityRef.current < 6000) {
        rawFocusRef.current = "focused";
        distractedFramesRef.current = 0;
        smoothedDevRef.current = 0;
        drowsyStartRef.current = null;
        distractionStartRef.current = null;
        focusReturnStartRef.current = now;
        dispatch({ type: "SET_FOCUS", state: "focused" });
        return;
      }

      if (s.cameraMode === "desk") {
        // Map desk focus state → rawFocusRef
        const desk = deskFocusRef.current;
        if (desk === "writing") {
          rawFocusRef.current = "focused";
        } else if (desk === "phone_on_desk" || desk === "no_hand") {
          rawFocusRef.current = "distracted";
        } else {
          // hand_idle: 20s grace period
          const idleSecs = handIdleStartRef.current
            ? (now - handIdleStartRef.current) / 1000
            : 0;
          rawFocusRef.current = idleSecs > 5 ? "distracted" : "focused";
        }
      }

      // Shared hysteresis logic (same for both modes)
      const raw = rawFocusRef.current;

      if (raw !== "focused") {
        focusReturnStartRef.current = null;
        if (distractionStartRef.current === null) {
          distractionStartRef.current = now;
          distractionCountedRef.current = false;
        }
        const dur = (now - distractionStartRef.current!) / 1000;
        if (dur >= 3 && !distractionCountedRef.current) {
          distractionCountedRef.current = true;
          dispatch({ type: "COUNT_DISTRACTION" });
        }
        dispatch({ type: "SET_FOCUS", state: raw });
      } else {
        if (focusReturnStartRef.current === null) {
          focusReturnStartRef.current = now;
        }
        if ((now - focusReturnStartRef.current!) / 1000 >= 0.15) {
          distractionStartRef.current = null;
          dispatch({ type: "SET_FOCUS", state: "focused" });
        }
      }
    }, 250);

    return () => clearInterval(id);
  }, [s.status, s.cameraGranted, s.cameraMode]);

  // ── Fetch real leaderboard ───────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
    supabase
      .from("profiles")
      .select("id, display_name, rank_points")
      .order("rank_points", { ascending: false })
      .limit(5)
      .then(({ data }) => { if (data) setLeaderboard(data); });
  }, []);

  // ── Start session ────────────────────────────────────────────────────────────

  const handleStart = async (subject: string) => {
    if (launchingRef.current) return;
    launchingRef.current = true;
    setCamStatus("requesting");
    let granted = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      granted = true;
      setCamStatus(
        (selectedMode === "face" ? faceMeshReadyRef.current : handDetectorReadyRef.current)
          ? "ready"
          : "initializing"
      );
    } catch {
      setCamStatus("denied");
      await new Promise((r) => setTimeout(r, 2000));
    }

    dispatch({
      type: "START",
      subject: subject || "Focus Session",
      cameraGranted: granted,
      cameraMode: selectedMode,
    });
  };

  // ── End session ──────────────────────────────────────────────────────────────

  const handleEnd = async () => {
    if (saving) return;
    setSaving(true);

    const baseRP = Math.floor((s.verifiedSeconds / 60) * 2);
    const penaltyRP = calcPenaltyRP(s.penaltySeconds);
    const rankPointsEarned = Math.max(0, baseRP - penaltyRP);

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
        penaltyRP,
        baseRP,
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
      ? "#22c55e"
      : s.focusState === "distracted"
        ? "#EF9F27"
        : "#ef4444";

  const selectedSubject = customSubject || s.subject;

  // Desk mode status label
  const deskStatusLabel = () => {
    const desk = deskFocusRef.current;
    if (desk === "writing") return { text: "● Writing detected", color: "#22c55e" };
    if (desk === "phone_on_desk") return { text: "● Phone detected", color: "#ef4444" };
    if (desk === "no_hand") return { text: "● Not at desk", color: "#EF9F27" };
    const idleSecs = handIdleStartRef.current
      ? Math.floor((Date.now() - handIdleStartRef.current) / 1000)
      : 0;
    const grace = Math.max(0, 5 - idleSecs);
    return { text: `● Hand idle · ${grace}s grace`, color: "#EF9F27" };
  };

  // ════════════════════════════════════════════════════════════════════════════
  // PRE-SESSION SCREEN
  // ════════════════════════════════════════════════════════════════════════════

  if (s.status === "pre") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] font-sans flex flex-col">
        <nav className="h-12 flex items-center justify-between px-5 border-b border-[#181818]">
          <div className="flex items-center gap-2">
            <Image src="/studyranklogo.png" alt="StudyRank" width={32} height={32} className="flex-shrink-0" />
            <span className="text-sm font-semibold text-white tracking-[-0.2px]">StudyRank</span>
          </div>
          <span className="text-[10px] uppercase tracking-[.1em] text-[#444]">Ranked session</span>
          <Link href="/home" className="text-[11px] text-[#333] hover:text-[#888] transition-colors">
            ← Back
          </Link>
        </nav>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-5">

            {/* Camera Mode Selector */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[.1em] text-[#444]">Camera mode</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelectedMode("face")}
                  className={`px-3 py-3 rounded-lg border text-left transition-colors ${
                    selectedMode === "face"
                      ? "bg-[#111] border-[#3b7aff] text-white"
                      : "border-[#181818] text-[#555] hover:border-[#333] hover:text-[#888]"
                  }`}
                >
                  <div className="text-[12px] font-medium mb-0.5">Face Cam</div>
                  <div className="text-[10px] text-[#444] leading-snug">
                    Tracks gaze, drowsiness &amp; phone use
                  </div>
                </button>
                <button
                  onClick={() => setSelectedMode("desk")}
                  className={`px-3 py-3 rounded-lg border text-left transition-colors ${
                    selectedMode === "desk"
                      ? "bg-[#111] border-[#3b7aff] text-white"
                      : "border-[#181818] text-[#555] hover:border-[#333] hover:text-[#888]"
                  }`}
                >
                  <div className="text-[12px] font-medium mb-0.5">Desk Cam</div>
                  <div className="text-[10px] text-[#444] leading-snug">
                    Detects writing, pen grip &amp; phone on desk
                  </div>
                </button>
              </div>
              {selectedMode === "desk" && (
                <div className="bg-[#0e0e0e] border border-[#181818] rounded-md px-3 py-2 text-[11px] text-[#555]">
                  Point your webcam at your desk so we can see your hands and what&apos;s on the surface
                </div>
              )}
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[.1em] text-[#444]">Subject</p>
              <div className="flex flex-wrap gap-1.5">
                {SUBJECTS.map((sub) => (
                  <button
                    key={sub}
                    onClick={() => {
                      dispatch({ type: "SET_SUBJECT", subject: sub });
                      setCustomSubject("");
                    }}
                    className={`px-3 py-1.5 rounded text-[11px] border transition-colors ${
                      s.subject === sub && !customSubject
                        ? "bg-[#3b7aff] border-[#3b7aff] text-white"
                        : "border-[#181818] text-[#555] hover:border-[#3b7aff] hover:text-[#d8d8d8]"
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
                className="w-full bg-[#0e0e0e] border border-[#181818] rounded px-3 py-2 text-sm text-[#d8d8d8] placeholder-[#333] focus:outline-none focus:border-[#3b7aff]"
              />
            </div>

            {camStatus === "denied" && (
              <div className="bg-[#111] border border-[#181818] rounded-md p-3 text-[11px] space-y-1">
                <p className="text-[#EF9F27]">No camera access — manual mode</p>
                <p className="text-[#444]">Hours won&apos;t be verified · no rank points earned</p>
              </div>
            )}

            <button
              onClick={() => handleStart(selectedSubject)}
              disabled={camStatus === "requesting" || camStatus === "initializing"}
              className="w-full py-[11px] bg-white text-[#0a0a0a] rounded-md text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#e8e8e8] transition-colors"
            >
              {camStatus === "requesting"
                ? "Requesting camera..."
                : camStatus === "initializing"
                  ? "Starting..."
                  : "Start ranked session"}
            </button>

            <div className="flex items-center justify-center gap-2">
              {aiPreloading ? (
                <>
                  <div className="w-2 h-2 border border-[#333] border-t-[#3b7aff] rounded-full animate-spin" />
                  <span className="text-[11px] text-[#333]">
                    {selectedMode === "desk" ? "Loading hand detection AI..." : "Warming up AI..."}
                  </span>
                </>
              ) : (
                <span className="text-[11px] text-[#22c55e]">● AI ready</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ACTIVE SESSION
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* TOP BAR */}
      <div className="shrink-0 h-12 flex items-center justify-between px-5 bg-[#0a0a0a] border-b border-[#181818]">
        <div className="flex items-center gap-2">
          <Image src="/studyranklogo.png" alt="StudyRank" width={28} height={28} className="flex-shrink-0" />
          <span className="text-sm font-semibold text-white tracking-[-0.2px]">StudyRank</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#3b7aff]">● live</span>
          <span className="text-[10px] text-[#444]">·</span>
          <span className="text-[10px] text-[#555]">{s.subject || "Focus Session"}</span>
          <span className="text-[10px] text-[#444]">·</span>
          <span className="text-[10px] text-[#333]">
            {s.cameraMode === "desk" ? "desk cam" : "face cam"}
          </span>
        </div>

        <button
          onClick={() => setShowEndModal(true)}
          className="text-[11px] font-mono text-[#ef4444] hover:text-red-300 transition-colors"
        >
          end
        </button>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-8 max-w-sm mx-auto space-y-4">

          {/* MAIN TIMER */}
          <div className="pt-2 pb-1 text-center">
            <div
              className="font-mono text-[#d8d8d8] tabular-nums"
              style={{
                fontSize: "clamp(44px, 12vw, 80px)",
                fontWeight: 300,
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {fmt(s.totalSeconds)}
            </div>
            <p className="text-[10px] uppercase tracking-widest text-[#444] mt-2">
              Total Time
            </p>

            <div
              className="mt-3 font-mono text-[#888] tabular-nums"
              style={{ fontSize: 22, fontWeight: 300 }}
            >
              {fmt(s.verifiedSeconds)}
            </div>
            <p className="text-[10px] uppercase tracking-widest text-[#444] mt-0.5">
              Verified Time
            </p>
          </div>

          {/* CAMERA PREVIEW */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="relative rounded-full overflow-hidden border-[3px] transition-colors duration-500"
              style={{ width: 140, height: 140, borderColor }}
            >
              {s.cameraGranted ? (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                    style={{ transform: s.cameraMode === "face" ? "scaleX(-1)" : "none" }}
                  />
                  {camStatus === "initializing" && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
                      <div className="w-5 h-5 border-2 border-[#3b7aff] border-t-transparent rounded-full animate-spin" />
                      <span className="text-[9px] uppercase tracking-widest text-[#d8d8d8]">
                        Loading AI
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full bg-[#111] flex flex-col items-center justify-center gap-2">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#444"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="m1 1 22 22" />
                    <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
                  </svg>
                  <span className="text-[9px] text-[#444] uppercase tracking-wide">
                    Manual mode
                  </span>
                </div>
              )}
            </div>

            {/* AI detection status label */}
            {s.cameraGranted && camStatus === "ready" && s.cameraMode === "face" && (
              <span
                className="text-[10px] uppercase tracking-widest"
                style={{
                  color: !aiCalibrated
                    ? "#444"
                    : s.focusState === "focused"
                      ? "#22c55e"
                      : s.focusState === "distracted"
                        ? "#EF9F27"
                        : "#ef4444",
                }}
              >
                {!aiCalibrated
                  ? "● Calibrating · look straight ahead"
                  : s.focusState === "focused"
                    ? "● AI tracking · looking straight"
                    : s.focusState === "distracted"
                      ? "● Looking away"
                      : "● Drowsy detected"}
              </span>
            )}
            {s.cameraGranted && camStatus === "ready" && s.cameraMode === "desk" && (
              <span
                className="text-[10px] uppercase tracking-widest"
                style={{ color: deskStatusLabel().color }}
              >
                {deskStatusLabel().text}
              </span>
            )}
            {s.cameraGranted && camStatus === "initializing" && (
              <span className="text-[10px] uppercase tracking-widest text-[#444]">
                Initializing camera AI...
              </span>
            )}
          </div>

          {/* FOCUS STATE CARD */}
          {!s.cameraGranted && (
            <div
              className="rounded-lg p-4"
              style={{ background: "#0e0e0e", border: "1px solid #181818", borderLeftWidth: 3 }}
            >
              <span className="text-xs uppercase tracking-widest font-semibold text-[#888]">
                Manual Mode
              </span>
              <p className="text-xs text-[#444] mt-1">
                Time tracked but not verified · No rank points
              </p>
            </div>
          )}

          {s.cameraGranted && s.focusState === "focused" && (
            <div
              className="rounded-lg p-4"
              style={{ background: "#0d1a0d", border: "1px solid #22c55e", borderLeftWidth: 3 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inset-0 rounded-full bg-[#22c55e] opacity-75" />
                  <span className="relative rounded-full h-2 w-2 bg-[#22c55e]" />
                </span>
                <span className="text-xs uppercase tracking-widest font-semibold text-[#22c55e]">
                  {s.cameraMode === "desk" ? "Writing Detected" : "Locked In"}
                </span>
              </div>
              <p className="text-xs text-[#444]">
                {s.cameraMode === "desk"
                  ? "Pen grip + motion detected · rank points accumulating"
                  : "Rank points accumulating"}
              </p>
            </div>
          )}

          {s.cameraGranted && s.focusState === "distracted" && (
            <div
              className="rounded-lg p-4 distracted-card"
              style={{ background: "#1a1000", border: "1px solid #EF9F27", borderLeftWidth: 3 }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs uppercase tracking-widest font-semibold text-[#EF9F27]">
                  {s.cameraMode === "desk"
                    ? deskFocusRef.current === "phone_on_desk"
                      ? "Phone Detected"
                      : deskFocusRef.current === "no_hand"
                        ? "Not at Desk"
                        : "Not Writing"
                    : "Look Away Detected"}
                </span>
                <span className="text-xs font-mono text-[#EF9F27]">
                  {fmtDistraction(s.currentDistractionSeconds)}
                </span>
              </div>
              <p className="text-xs text-[#444]">
                Timer paused · ELO deducting
              </p>
            </div>
          )}

          {s.cameraGranted && s.focusState === "drowsy" && (
            <div
              className="rounded-lg p-4 drowsy-card"
              style={{ background: "#1a0d0d", border: "1px solid #ef4444", borderLeftWidth: 3 }}
            >
              <span className="text-xs uppercase tracking-widest font-semibold text-[#ef4444]">
                Drowsy Detected
              </span>
              <p className="text-xs text-[#444] mt-1">
                Wake up · ELO deducting
              </p>
            </div>
          )}

          {/* STATS ROW */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Distractions", value: String(s.distractionCount), color: "#d8d8d8" },
              {
                label: "ELO Penalty",
                value: calcPenaltyRP(s.penaltySeconds) > 0
                  ? `-${calcPenaltyRP(s.penaltySeconds)} RP`
                  : "0 RP",
                color: calcPenaltyRP(s.penaltySeconds) > 0 ? "#EF9F27" : "#888",
              },
              { label: "Focus Rate", value: `${focusRate}%`, color: "#d8d8d8" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="bg-[#0e0e0e] border border-[#181818] rounded-lg p-3 text-center"
              >
                <div className="font-mono text-lg tabular-nums" style={{ color }}>
                  {value}
                </div>
                <div className="text-[9px] uppercase tracking-widest text-[#444] mt-0.5">
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* MANUAL MODE NOTICE */}
          {!s.cameraGranted && (
            <div className="flex items-center gap-2 bg-[#0e0e0e] border border-[#181818] rounded-lg p-3">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-xs text-[#444]">
                Manual mode · Allow camera to enable AI tracking
              </span>
            </div>
          )}

          {/* MINI LEADERBOARD */}
          {leaderboard.length > 0 && (
            <div className="bg-[#0e0e0e] border border-[#181818] rounded-lg p-4">
              <p className="text-[10px] uppercase tracking-widest text-[#444] mb-3">
                Ladder
              </p>
              <div className="space-y-2.5">
                {leaderboard.map((p, i) => {
                  const isYou = p.id === currentUserId;
                  const tier = getTier(p.rank_points ?? 0);
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className={`w-4 text-[10px] font-mono ${i < 3 ? "text-[#3b7aff]" : "text-[#444]"}`}>
                        #{i + 1}
                      </span>
                      <span className={`flex-1 text-[12px] truncate ${isYou ? "text-white font-medium" : "text-[#888]"}`}>
                        {isYou ? "You" : p.display_name || "Anonymous"}
                      </span>
                      <span className="font-mono text-[11px] text-[#555]">
                        {(p.rank_points ?? 0).toLocaleString()} RP
                      </span>
                      <span className="text-[9px] text-[#444] hidden sm:block">
                        {tier}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* END SESSION */}
          <button
            onClick={() => setShowEndModal(true)}
            className="w-full py-[11px] bg-[#0e0e0e] border border-[#2a1010] text-[#ef4444] rounded-md text-[13px] font-medium hover:bg-[#1a0d0d] transition-colors"
          >
            End session
          </button>
        </div>
      </div>

      {/* END MODAL */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#0e0e0e] border border-[#181818] rounded-xl p-6 w-full max-w-xs space-y-4">
            <div>
              <h2 className="text-[15px] font-medium text-white">End session?</h2>
              <p className="text-[11px] text-[#555] mt-1">Your progress will be saved and rank points applied.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndModal(false)}
                className="flex-1 py-[10px] border border-[#181818] rounded-md text-[13px] text-[#555] hover:text-[#d8d8d8] hover:border-[#333] transition-colors"
              >
                Keep going
              </button>
              <button
                onClick={handleEnd}
                disabled={saving}
                className="flex-1 py-[10px] bg-white text-[#0a0a0a] rounded-md text-[13px] font-medium disabled:opacity-40 hover:bg-[#e8e8e8] transition-colors"
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

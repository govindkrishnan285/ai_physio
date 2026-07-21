"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Webcam from "react-webcam";

import { usePoseDetection, PoseState } from "@/hooks/usePoseDetection";
import { useJointAngles } from "@/hooks/useJointAngles";
import { useRepCounter, RepCounterState } from "@/hooks/useRepCounter";
import { useLiveServerScoring } from "@/hooks/useLiveServerScoring";
import { exercises, ExerciseConfig } from "@/lib/exerciseConfig";
import { JointAngles, Landmark } from "@/types/pose";
import {
  api,
  AnalyzeRepResponse,
  FeedbackEntry,
  JointSample,
  SessionCreateInput,
} from "@/lib/api";
import { bumpSessions } from "@/lib/sessionStore";
import { FrameQuality, measureFrameQuality } from "@/lib/frameQuality";
import {
  analyzeCalibration,
  CalibrationReport,
  DEFAULT_QUALITY_THRESHOLD,
  shouldPauseForQuality,
} from "@/lib/calibration";

const JOINT_SAMPLE_INTERVAL_MS = 500;
const MAX_JOINT_SAMPLES = 600;
const MAX_FEEDBACK_ENTRIES = 200;
const FRAME_QUALITY_INTERVAL_MS = 300;
const READY_HOLD_MS = 1000; // hold a passing calibration this long before starting

export type SessionPhase = "idle" | "calibrating" | "active";

interface PoseContextValue {
  webcamRef: React.RefObject<Webcam | null>;
  exercises: ExerciseConfig[];
  selectedExercise: ExerciseConfig;
  setSelectedExercise: (exercise: ExerciseConfig) => void;
  // Selected camera (e.g. an iPhone-as-webcam); undefined = system default.
  cameraDeviceId: string | undefined;
  setCameraDeviceId: (id: string | undefined) => void;
  /** Camera + detection are running (calibrating or active). */
  running: boolean;
  sessionPhase: SessionPhase;
  startSession: () => void;
  startAnyway: () => void;
  pauseSession: () => void;
  resetSession: () => void;
  pose: PoseState;
  angles: JointAngles | null;
  repCounter: RepCounterState;
  elapsedSec: number;
  // Calibration + quality gating.
  calibration: CalibrationReport | null;
  qualityThreshold: number;
  degraded: boolean;
  frameQuality: FrameQuality | null;
  // Persistence status.
  saving: boolean;
  saveError: string | null;
  // Backend / trained-model scoring.
  serverAvailable: boolean;
  serverProfileReady: boolean;
  serverFeedback: AnalyzeRepResponse | null;
  serverAnalyzing: boolean;
  backendExerciseId: number | null;
}

const PoseContext = createContext<PoseContextValue | null>(null);

function mean(values: number[]): number | null {
  const nums = values.filter((v) => Number.isFinite(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export function PoseProvider({ children }: { children: React.ReactNode }) {
  const webcamRef = useRef<Webcam>(null);

  const [selectedExercise, setSelectedExerciseState] =
    useState<ExerciseConfig>(exercises[0]);
  const [cameraDeviceId, setCameraDeviceId] = useState<string | undefined>(undefined);
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("idle");
  const [degraded, setDegraded] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [frameQuality, setFrameQuality] = useState<FrameQuality | null>(null);
  const [stability, setStability] = useState(0);

  const qualityThreshold = DEFAULT_QUALITY_THRESHOLD;
  const cameraOn = sessionPhase !== "idle";

  const pose = usePoseDetection(webcamRef, cameraOn);
  const angles = useJointAngles(pose.landmarks, pose.worldLandmarks);

  // Calibration report (evaluated whenever the camera is on).
  const calibration = useMemo<CalibrationReport | null>(() => {
    if (!cameraOn) return null;
    return analyzeCalibration({
      landmarks: pose.landmarks,
      poseCount: pose.poseCount,
      confidence: pose.confidence,
      frame: frameQuality,
      stability,
      threshold: qualityThreshold,
    });
  }, [cameraOn, pose.landmarks, pose.poseCount, pose.confidence, frameQuality, stability, qualityThreshold]);

  // Exercise analysis is gated: active phase, quality OK, and actually tracking.
  const analysisActive = sessionPhase === "active" && !degraded;

  const repCounter = useRepCounter(
    angles,
    selectedExercise,
    analysisActive,
    resetToken
  );

  const server = useLiveServerScoring({
    landmarks: pose.landmarks,
    fps: pose.fps,
    reps: repCounter.reps,
    phase: repCounter.phase,
    running: analysisActive,
    exerciseName: selectedExercise.name,
  });

  // --- Session accumulation buffers ---
  const startMsRef = useRef<number>(0);
  const jointSamplesRef = useRef<JointSample[]>([]);
  const feedbackLogRef = useRef<FeedbackEntry[]>([]);
  const lastSampleMsRef = useRef<number>(0);
  const lastFeedbackTextRef = useRef<string>("");
  const prevRepsRef = useRef<number>(0);
  const prevLmRef = useRef<Landmark[] | null>(null);

  // Sample frame lighting quality while the camera is on.
  useEffect(() => {
    if (!cameraOn) {
      setFrameQuality(null);
      return;
    }
    const id = setInterval(() => {
      const video = webcamRef.current?.video;
      if (video) {
        const q = measureFrameQuality(video);
        if (q) setFrameQuality(q);
      }
    }, FRAME_QUALITY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [cameraOn]);

  // Camera stability from torso-landmark micro-motion (EMA-smoothed).
  useEffect(() => {
    if (!cameraOn || !pose.landmarks) {
      prevLmRef.current = null;
      return;
    }
    const cur = pose.landmarks;
    const prev = prevLmRef.current;
    prevLmRef.current = cur;
    if (!prev) return;
    let m = 0;
    for (const i of [11, 12, 23, 24]) {
      m += Math.hypot(cur[i].x - prev[i].x, cur[i].y - prev[i].y);
    }
    m /= 4;
    const inst = Math.max(0, 1 - m * 12);
    // An EMA in float never reaches an exact fixed point, so an unguarded
    // update changed `stability` on every frame -> new calibration memo ->
    // degraded effect, forever. Settle once the step is below display
    // resolution so React can bail out.
    setStability((s) => {
      const next = s * 0.7 + inst * 0.3;
      return Math.abs(next - s) < 0.005 ? s : next;
    });
  }, [pose.landmarks, cameraOn]);

  // Auto-advance calibrating -> active once quality holds above threshold.
  useEffect(() => {
    if (sessionPhase !== "calibrating" || !calibration?.ready) return;
    const id = setTimeout(() => setSessionPhase("active"), READY_HOLD_MS);
    return () => clearTimeout(id);
  }, [sessionPhase, calibration?.ready]);

  // Reset accumulators + timer when a session becomes active.
  useEffect(() => {
    if (sessionPhase !== "active") return;
    startMsRef.current = Date.now();
    jointSamplesRef.current = [];
    feedbackLogRef.current = [];
    lastSampleMsRef.current = 0;
    lastFeedbackTextRef.current = "";
    prevRepsRef.current = 0;
    setElapsedSec(0);
    setSaveError(null);
  }, [sessionPhase]);

  // Real-time monitoring: pause analysis when quality degrades.
  useEffect(() => {
    if (sessionPhase !== "active" || !calibration) {
      setDegraded(false);
      return;
    }
    const criticalOk = calibration.checks
      .filter((c) => c.severity === "critical")
      .every((c) => c.pass);
    setDegraded(
      shouldPauseForQuality(calibration.qualityScore, criticalOk, qualityThreshold)
    );
  }, [sessionPhase, calibration, qualityThreshold]);

  // Session timer (only while analysis is active).
  useEffect(() => {
    if (!analysisActive) return;
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [analysisActive]);

  // Throttled joint-angle sampling for averages + JointMeasurement rows.
  useEffect(() => {
    if (!analysisActive || !angles) return;
    const now = Date.now();
    if (now - lastSampleMsRef.current < JOINT_SAMPLE_INTERVAL_MS) return;
    lastSampleMsRef.current = now;
    if (jointSamplesRef.current.length >= MAX_JOINT_SAMPLES) return;
    jointSamplesRef.current.push({
      timestamp: (now - startMsRef.current) / 1000,
      knee_angle: (angles.leftKnee + angles.rightKnee) / 2,
      hip_angle: (angles.leftHip + angles.rightHip) / 2,
      shoulder_angle: (angles.leftShoulder + angles.rightShoulder) / 2,
      elbow_angle: (angles.leftElbow + angles.rightElbow) / 2,
    });
  }, [pose.landmarks, analysisActive, angles]);

  // Log DTW feedback cues as they arrive.
  useEffect(() => {
    if (!analysisActive || !server.serverFeedback) return;
    const ts = (Date.now() - startMsRef.current) / 1000;
    for (const cue of server.serverFeedback.feedback) {
      if (cue.text === lastFeedbackTextRef.current) continue;
      lastFeedbackTextRef.current = cue.text;
      if (feedbackLogRef.current.length < MAX_FEEDBACK_ENTRIES) {
        feedbackLogRef.current.push({
          timestamp: ts,
          feedback: cue.text,
          severity: cue.severity,
        });
      }
    }
  }, [server.serverFeedback, analysisActive]);

  // Client feedback fallback: one cue per completed rep when untrained.
  useEffect(() => {
    if (!analysisActive) return;
    if (repCounter.reps > prevRepsRef.current) {
      prevRepsRef.current = repCounter.reps;
      if (!server.profileReady) {
        const ts = (Date.now() - startMsRef.current) / 1000;
        feedbackLogRef.current.push(
          repCounter.lastRepInRange
            ? { timestamp: ts, feedback: "Rep completed within target range.", severity: "ok" }
            : { timestamp: ts, feedback: "Rep below target range — adjust your form.", severity: "minor" }
        );
      }
    } else if (repCounter.reps < prevRepsRef.current) {
      prevRepsRef.current = repCounter.reps;
    }
  }, [repCounter.reps, repCounter.lastRepInRange, analysisActive, server.profileReady]);

  function setSelectedExercise(exercise: ExerciseConfig) {
    setSelectedExerciseState(exercise);
    setSessionPhase("idle");
    setDegraded(false);
    setElapsedSec(0);
    setResetToken((t) => t + 1);
  }

  function startSession() {
    setDegraded(false);
    setSessionPhase("calibrating");
  }

  // Skip the calibration gate and start immediately.
  function startAnyway() {
    setDegraded(false);
    setSessionPhase("active");
  }

  function pauseSession() {
    setSessionPhase("idle");
  }

  function buildPayload(): SessionCreateInput {
    const serverReps = Array.from(server.serverRepRecords.current.values());
    const hasServer = serverReps.length > 0;
    const roms = serverReps.map((r) => r.rom).filter((v) => Number.isFinite(v));
    const accs = serverReps.map((r) => r.accuracy);

    const accuracy = hasServer
      ? Math.round(mean(accs) ?? repCounter.accuracy)
      : repCounter.accuracy;
    const averageRom = hasServer ? mean(roms) : repCounter.bestRom;
    const maximumRom = hasServer ? (roms.length ? Math.max(...roms) : null) : repCounter.bestRom;
    const minimumRom = hasServer && roms.length ? Math.min(...roms) : null;

    const mistakes = new Set<string>();
    for (const r of serverReps) {
      for (const e of r.errors) {
        const label = (e.joint ?? e.feature) as string | undefined;
        if (label) mistakes.add(label);
      }
    }

    return {
      exercise: selectedExercise.name,
      exercise_id: server.backendExerciseId,
      duration_seconds: elapsedSec,
      repetitions: repCounter.reps,
      accuracy,
      average_rom: averageRom,
      maximum_rom: maximumRom,
      minimum_rom: minimumRom,
      quality_score: hasServer ? mean(accs) : null,
      pain_score: null,
      average_knee_angle: mean(jointSamplesRef.current.map((s) => s.knee_angle ?? NaN)),
      average_hip_angle: mean(jointSamplesRef.current.map((s) => s.hip_angle ?? NaN)),
      average_shoulder_angle: mean(jointSamplesRef.current.map((s) => s.shoulder_angle ?? NaN)),
      average_elbow_angle: mean(jointSamplesRef.current.map((s) => s.elbow_angle ?? NaN)),
      posture_mistakes: Array.from(mistakes),
      fps: pose.fps || null,
      model_confidence: pose.confidence || null,
      start_time: new Date(startMsRef.current || Date.now()).toISOString(),
      end_time: new Date().toISOString(),
      joints: jointSamplesRef.current,
      feedback: feedbackLogRef.current,
    };
  }

  async function resetSession() {
    if (repCounter.reps > 0) {
      const payload = buildPayload();
      setSaving(true);
      setSaveError(null);
      try {
        await api.createSession(payload);
        bumpSessions();
      } catch (e) {
        setSaveError(
          e instanceof Error ? e.message : "Failed to save session to the server."
        );
      } finally {
        setSaving(false);
      }
    }

    jointSamplesRef.current = [];
    feedbackLogRef.current = [];
    setSessionPhase("idle");
    setDegraded(false);
    setElapsedSec(0);
    setResetToken((t) => t + 1);
  }

  const value = useMemo<PoseContextValue>(
    () => ({
      webcamRef,
      exercises,
      selectedExercise,
      setSelectedExercise,
      cameraDeviceId,
      setCameraDeviceId,
      running: cameraOn,
      sessionPhase,
      startSession,
      startAnyway,
      pauseSession,
      resetSession,
      pose,
      angles,
      repCounter,
      elapsedSec,
      calibration,
      qualityThreshold,
      degraded,
      frameQuality,
      saving,
      saveError,
      serverAvailable: server.serverAvailable,
      serverProfileReady: server.profileReady,
      serverFeedback: server.serverFeedback,
      serverAnalyzing: server.analyzing,
      backendExerciseId: server.backendExerciseId,
    }),
    [
      selectedExercise,
      cameraDeviceId,
      cameraOn,
      sessionPhase,
      pose,
      angles,
      repCounter,
      elapsedSec,
      calibration,
      qualityThreshold,
      degraded,
      frameQuality,
      saving,
      saveError,
      server.serverAvailable,
      server.profileReady,
      server.serverFeedback,
      server.analyzing,
      server.backendExerciseId,
    ]
  );

  return <PoseContext.Provider value={value}>{children}</PoseContext.Provider>;
}

export function usePose() {
  const ctx = useContext(PoseContext);
  if (!ctx) {
    throw new Error("usePose must be used within a PoseProvider");
  }
  return ctx;
}

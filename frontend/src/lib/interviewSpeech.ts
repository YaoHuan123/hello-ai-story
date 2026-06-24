import { SpeechRecognition } from "@capgo/capacitor-speech-recognition";
import type { PluginListenerHandle } from "@capacitor/core";
import { getLocale } from "../i18n";
import { isIosNative } from "./platform";

export type InterviewSpeechError =
  | "unavailable"
  | "permission_denied"
  | "timeout"
  | "failed";

const PERMISSION_TIMEOUT_MS = 12_000;
const START_TIMEOUT_MS = 12_000;

let partialListener: PluginListenerHandle | null = null;
let stateListener: PluginListenerHandle | null = null;
let listening = false;
let sessionId = 0;
let onNativeStopped: (() => void) | null = null;

function speechLocale(): string {
  return getLocale() === "zh" ? "zh-CN" : "en-US";
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err: unknown) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

async function teardownListeners(): Promise<void> {
  if (partialListener) {
    await partialListener.remove().catch(() => undefined);
    partialListener = null;
  }
  if (stateListener) {
    await stateListener.remove().catch(() => undefined);
    stateListener = null;
  }
}

async function forceNativeStop(): Promise<void> {
  try {
    await SpeechRecognition.stop();
  } catch {
    // ignore — stop is best-effort cleanup
  }
}

async function ensureSpeechPermissions(): Promise<InterviewSpeechError | null> {
  const checked = await withTimeout(
    SpeechRecognition.checkPermissions(),
    PERMISSION_TIMEOUT_MS,
    "checkPermissions",
  );
  if (checked.speechRecognition === "granted") return null;
  if (checked.speechRecognition === "denied") return "permission_denied";

  const requested = await withTimeout(
    SpeechRecognition.requestPermissions(),
    PERMISSION_TIMEOUT_MS,
    "requestPermissions",
  );
  if (requested.speechRecognition === "granted") return null;
  if (requested.speechRecognition === "denied") return "permission_denied";
  return "failed";
}

function classifySpeechError(err: unknown): InterviewSpeechError {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("timed out")) return "timeout";
  if (msg.includes("not implemented") || msg.includes("unavailable")) return "unavailable";
  if (msg.includes("permission") || msg.includes("denied")) return "permission_denied";
  return "failed";
}

export function isInterviewSpeechSupported(): boolean {
  return isIosNative();
}

export function setInterviewSpeechStopHandler(handler: (() => void) | null): void {
  onNativeStopped = handler;
}

export async function startInterviewSpeech(
  onTranscript: (text: string) => void,
): Promise<InterviewSpeechError | null> {
  if (!isIosNative()) return "unavailable";
  if (listening) return null;

  const locale = speechLocale();
  const mySession = ++sessionId;

  try {
    const { available } = await withTimeout(
      SpeechRecognition.available(),
      5_000,
      "available",
    );
    if (!available) return "unavailable";
    if (mySession !== sessionId) return "failed";

    const permErr = await ensureSpeechPermissions();
    if (permErr) return permErr;
    if (mySession !== sessionId) return "failed";

    await teardownListeners();

    partialListener = await SpeechRecognition.addListener("partialResults", (event) => {
      if (mySession !== sessionId) return;
      const text = event.matches?.[0]?.trim();
      if (text) onTranscript(text);
    });

    stateListener = await SpeechRecognition.addListener("listeningState", (event) => {
      if (mySession !== sessionId) return;
      if (event.status === "stopped") {
        listening = false;
        onNativeStopped?.();
      }
    });

    await withTimeout(
      SpeechRecognition.start({
        language: locale,
        partialResults: true,
        addPunctuation: true,
      }),
      START_TIMEOUT_MS,
      "start",
    );
    if (mySession !== sessionId) {
      await forceNativeStop();
      return "failed";
    }

    listening = true;
    return null;
  } catch (err) {
    if (mySession === sessionId) {
      sessionId += 1;
    }
    await forceNativeStop();
    await teardownListeners();
    listening = false;
    return classifySpeechError(err);
  }
}

export async function stopInterviewSpeech(): Promise<void> {
  if (!isIosNative()) return;

  sessionId += 1;
  await forceNativeStop();
  await teardownListeners();
  listening = false;
}

export function isInterviewSpeechListening(): boolean {
  return listening;
}

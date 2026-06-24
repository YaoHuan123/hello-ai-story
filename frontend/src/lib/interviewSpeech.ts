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
let listening = false;

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

export async function startInterviewSpeech(
  onTranscript: (text: string) => void,
): Promise<InterviewSpeechError | null> {
  if (!isIosNative()) return "unavailable";
  if (listening) return null;

  const locale = speechLocale();

  try {
    const { available } = await withTimeout(
      SpeechRecognition.available(),
      5_000,
      "available",
    );
    if (!available) return "unavailable";

    const permErr = await ensureSpeechPermissions();
    if (permErr) return permErr;

    if (partialListener) {
      await partialListener.remove().catch(() => undefined);
      partialListener = null;
    }

    partialListener = await SpeechRecognition.addListener("partialResults", (event) => {
      const text = event.matches?.[0]?.trim();
      if (text) onTranscript(text);
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
    listening = true;
    return null;
  } catch (err) {
    await stopInterviewSpeech();
    return classifySpeechError(err);
  }
}

export async function stopInterviewSpeech(): Promise<void> {
  if (!isIosNative()) return;

  try {
    if (listening) {
      await SpeechRecognition.stop();
    }
  } catch {
    // ignore teardown errors
  } finally {
    listening = false;
    if (partialListener) {
      await partialListener.remove().catch(() => undefined);
      partialListener = null;
    }
  }
}

export function isInterviewSpeechListening(): boolean {
  return listening;
}

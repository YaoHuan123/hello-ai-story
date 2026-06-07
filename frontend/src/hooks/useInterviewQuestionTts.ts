import { useCallback, useEffect, useRef, useState } from "react";
import { fetchInterviewQuestionTts } from "../api/interviews";
import type { InterviewQuestion } from "../types/interview";

function questionTtsKey(q: InterviewQuestion): string {
  return `${q.type}:${q.key}:${q.text}`;
}

export function useInterviewQuestionTts(
  interviewId: string,
  question: InterviewQuestion | null,
  options?: { autoPlay?: boolean; paused?: boolean },
) {
  const autoPlay = options?.autoPlay ?? true;
  const paused = options?.paused ?? false;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const lastAutoKeyRef = useRef<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [loadingTts, setLoadingTts] = useState(false);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audioRef.current = null;
    }
    const url = blobUrlRef.current;
    if (url) {
      URL.revokeObjectURL(url);
      blobUrlRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const play = useCallback(async () => {
    if (!question || paused) return;
    stop();
    setLoadingTts(true);
    try {
      const blob = await fetchInterviewQuestionTts(interviewId);
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      setSpeaking(true);
      await audio.play();
    } finally {
      setLoadingTts(false);
    }
  }, [interviewId, question, paused, stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  useEffect(() => {
    if (paused) stop();
  }, [paused, stop]);

  useEffect(() => {
    lastAutoKeyRef.current = null;
  }, [interviewId]);

  useEffect(() => {
    if (!autoPlay || !question || paused) return;
    const key = questionTtsKey(question);
    if (lastAutoKeyRef.current === key) return;
    lastAutoKeyRef.current = key;
    void play().catch(() => setSpeaking(false));
  }, [autoPlay, paused, question, play]);

  return { play, stop, speaking, loadingTts };
}

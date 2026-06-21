import { useRef, useState } from "react";
import { transcribeAudio } from "./ai";

/**
 * Dictado por voz. En navegadores con Web Speech API (Android/escritorio) usa
 * la transcripción nativa (gratis). En iPhone/Safari —que no la soporta— graba
 * un clip con MediaRecorder y lo transcribe en servidor (función `transcribe`).
 */
export function useSpeech(onText: (t: string) => void) {
  const recRef = useRef<any>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false); // transcribiendo (ruta de servidor)

  const SR =
    typeof window !== "undefined"
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;
  const canRecord =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof (window as any).MediaRecorder !== "undefined";
  const supported = !!SR || canRecord;

  // ---- Ruta 1: Web Speech API (nativa, sin servidor) ----
  function toggleNative() {
    if (listening) {
      try {
        recRef.current?.stop();
      } catch {}
      return;
    }
    try {
      const rec = new SR();
      rec.lang = "es-ES";
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (e: any) => {
        const txt = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join(" ");
        onText(txt);
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
    }
  }

  // ---- Ruta 2: grabar + transcribir en servidor (iPhone) ----
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (!blob.size) return;
        setBusy(true);
        try {
          const text = await transcribeAudio(blob);
          if (text) onText(text);
        } catch {
          // sin función desplegada / error → silencioso
        } finally {
          setBusy(false);
        }
      };
      mediaRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
    }
  }

  function toggleRecording() {
    if (listening) {
      try {
        mediaRef.current?.stop();
      } catch {}
      setListening(false);
      return;
    }
    startRecording();
  }

  function toggle() {
    if (!supported) return;
    if (SR) toggleNative();
    else toggleRecording();
  }

  return { listening, busy, supported, toggle };
}

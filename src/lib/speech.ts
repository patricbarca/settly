import { useRef, useState } from "react";
import { transcribeAudio } from "./ai";
import { isIOS } from "./pwa";

/**
 * Dictado por voz en el idioma indicado (sigue el selector ES/EN de la app).
 * En navegadores con Web Speech API (Android/escritorio) usa la transcripción
 * nativa; donde no existe (iPhone/Safari) graba y transcribe en el servidor
 * (Edge Function `transcribe` → Groq/Whisper). Requiere conexión: sin internet
 * el dictado no está disponible y el gasto se añade a mano.
 */
export function useSpeech(onText: (t: string) => void, lang: "es" | "en" = "es") {
  const recRef = useRef<any>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false); // transcribiendo (servidor)
  const [error, setError] = useState<"mic" | "stt" | null>(null);

  const SR =
    typeof window !== "undefined"
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;
  // En iOS, webkitSpeechRecognition puede existir pero NO funciona: forzamos la
  // ruta de grabación + transcripción en servidor.
  const useNative = !!SR && !isIOS();
  const canRecord =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof (window as any).MediaRecorder !== "undefined";
  const supported = useNative || canRecord;

  // ---- Ruta 1: Web Speech API (nativa, sin servidor) ----
  function toggleNative() {
    if (listening) {
      try {
        recRef.current?.stop();
      } catch {}
      return;
    }
    try {
      // Aborta cualquier reconocimiento previo que se haya quedado colgado
      // (si onend no llegó a dispararse, listening se quedaría en true).
      try { recRef.current?.abort?.(); } catch {}
      const rec = new SR();
      rec.lang = lang === "en" ? "en-US" : "es-ES";
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (e: any) => {
        const txt = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join(" ");
        onText(txt);
      };
      rec.onend = () => { recRef.current = null; setListening(false); };
      rec.onerror = () => { recRef.current = null; setListening(false); setError("mic"); };
      recRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
      setError("mic");
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
          // Transcripción en el servidor (Edge Function `transcribe` → Groq).
          // Necesita conexión; offline lanza y caemos al mensaje de error.
          const text = await transcribeAudio(blob, lang);
          if (text) onText(text);
          else setError("stt");
        } catch {
          setError("stt");
        } finally {
          setBusy(false);
        }
      };
      mediaRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
      setError("mic");
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
    setError(null);
    if (useNative) toggleNative();
    else toggleRecording();
  }

  return { listening, busy, supported, error, toggle };
}

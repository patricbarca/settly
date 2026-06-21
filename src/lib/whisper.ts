// Speech-to-text 100% local en el navegador con Whisper (transformers.js).
// Sin servidor, sin claves, privado. El modelo se descarga una vez (desde el
// CDN de Hugging Face) y queda cacheado por el navegador.
type ASR = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text?: string } | { text: string }[]>;

let asrPromise: Promise<ASR> | null = null;

// Modelo multilingüe pequeño (sirve para español). Cambia a "whisper-tiny" para
// menos descarga/menos precisión, o "whisper-small" para más precisión.
const MODEL = "onnx-community/whisper-base";

async function getASR(): Promise<ASR> {
  if (asrPromise) return asrPromise;
  asrPromise = (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    try {
      return (await pipeline("automatic-speech-recognition", MODEL, {
        device: "webgpu",
        dtype: "q8",
      })) as unknown as ASR;
    } catch {
      // Sin WebGPU → WASM (más lento pero compatible, p. ej. iPhone).
      return (await pipeline("automatic-speech-recognition", MODEL, {
        dtype: "q8",
      })) as unknown as ASR;
    }
  })();
  return asrPromise;
}

/** Lanza la descarga/carga del modelo por adelantado (opcional). */
export function preloadWhisper() {
  getASR().catch(() => {});
}

export async function transcribeLocal(blob: Blob, lang = "es"): Promise<string> {
  const audio = await blobToMono16k(blob);
  const asr = await getASR();
  const out = await asr(audio, { language: lang, task: "transcribe" });
  const text = Array.isArray(out) ? out.map((o) => o.text).join(" ") : out?.text;
  return (text || "").trim();
}

// Decodifica el clip grabado y lo convierte a mono 16 kHz (lo que espera Whisper).
async function blobToMono16k(blob: Blob): Promise<Float32Array> {
  const arrayBuf = await blob.arrayBuffer();
  const AC: typeof AudioContext =
    (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext: typeof AudioContext })
      .AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const decoded = await ctx.decodeAudioData(arrayBuf);
  ctx.close();
  const rate = 16000;
  const length = Math.max(1, Math.round(decoded.duration * rate));
  const offline = new OfflineAudioContext(1, length, rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

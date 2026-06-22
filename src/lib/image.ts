// Convierte una imagen elegida por el usuario en un data URL cuadrado y pequeño
// (recorte centrado + redimensionado), apto para guardarse en la tabla profiles.
export function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_error"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no_ctx"));
        ctx.drawImage(
          img,
          (img.width - side) / 2,
          (img.height - side) / 2,
          side,
          side,
          0,
          0,
          size,
          size
        );
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("img_error"));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

// Redimensiona y comprime una foto de ticket a un JPEG razonable para enviar a
// la IA de visión (lado máximo ~1600px). Evita subir fotos de varios MB que
// revientan el límite de la Edge Function, y reduce el coste en tokens.
// Devuelve el base64 (sin el prefijo data:) + mediaType.
export function fileToScanImage(
  file: File,
  maxSide = 1600,
  quality = 0.8
): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_error"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no_ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({ base64: dataUrl.split(",")[1] ?? "", mediaType: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("img_error"));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

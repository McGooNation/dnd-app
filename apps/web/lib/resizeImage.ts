// Resizes and compresses an image entirely in the browser before it's ever
// uploaded, using a canvas — deliberately avoiding a server-side image
// library (e.g. sharp), which tends to need native build tools that are
// exactly the kind of thing that's caused install trouble on Windows before.
// This also means the payload sent over the socket is already small.

const MAX_DIMENSION = 2000; // px, on the longer side
const JPEG_QUALITY = 0.82; // good visual quality at meaningfully smaller size

/** Resolves to a JPEG data URL, resized so its longer side is at most
 * MAX_DIMENSION and compressed for reasonable file size, while keeping
 * good visual quality — appropriate for a battle map background. */
export function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(objectUrl);

      if (!ctx) {
        reject(new Error("Couldn't process that image in this browser."));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image file."));
    };

    img.src = objectUrl;
  });
}

// Resizes and compresses an image entirely in the browser before it's ever
// uploaded, using a canvas — deliberately avoiding a server-side image
// library (e.g. sharp), which tends to need native build tools that are
// exactly the kind of thing that's caused install trouble on Windows before.
// This also means the payload sent over the socket is already small.

const MAX_DIMENSION = 2000; // px, on the longer side
const WEBP_QUALITY = 0.85; // WebP is more efficient than JPEG, so this can be a
// touch higher than the old JPEG quality while still ending up smaller overall.
const JPEG_QUALITY = 0.82; // used only as a fallback — see below.

// If the original file is already at or under this size AND already within
// MAX_DIMENSION, there's nothing meaningful to gain from resizing/recompressing
// it — doing so anyway would just be unnecessary processing (and a pointless
// generation loss if it's already a compressed format). It's used as-is.
const SKIP_PROCESSING_MAX_BYTES = 800 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read that image file."));
    reader.readAsDataURL(file);
  });
}

/** Resolves to a data URL suitable for use as a battle map background:
 * resized so its longer side is at most MAX_DIMENSION, and compressed for a
 * meaningfully smaller file size while keeping good visual quality —
 * WebP when the browser genuinely supports encoding it (verified, not
 * assumed — see below), JPEG otherwise. Already-small, already-appropriately
 * -sized images are returned as-is rather than needlessly reprocessed. */
export function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const { width: originalWidth, height: originalHeight } = img;
      URL.revokeObjectURL(objectUrl);

      if (file.size <= SKIP_PROCESSING_MAX_BYTES && originalWidth <= MAX_DIMENSION && originalHeight <= MAX_DIMENSION) {
        readFileAsDataUrl(file).then(resolve).catch(reject);
        return;
      }

      let width = originalWidth;
      let height = originalHeight;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Couldn't process that image in this browser."));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // Some browsers silently fall back to PNG if they don't actually
      // support encoding to the requested type, rather than erroring —
      // which would produce a much LARGER file than intended, defeating the
      // point. Checking the result's own declared type is how the browser
      // tells us whether it actually complied; if it didn't, re-encode as
      // JPEG (the previously proven-reliable choice) instead of silently
      // keeping an oversized, unintended PNG.
      const webpResult = canvas.toDataURL("image/webp", WEBP_QUALITY);
      if (webpResult.startsWith("data:image/webp")) {
        resolve(webpResult);
      } else {
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image file."));
    };

    img.src = objectUrl;
  });
}

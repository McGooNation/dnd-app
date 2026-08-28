// Resizes and compresses an image entirely in the browser before it's ever
// uploaded, using a canvas — deliberately avoiding a server-side image
// library (e.g. sharp), which tends to need native build tools that are
// exactly the kind of thing that's caused install trouble on Windows before.
// This also means the payload sent over the socket is already small.
//
// Used for two different things with two different size budgets: the map
// background (a full-screen image) and individual token portraits (a small
// visual element) — see resizeImageFile vs resizeTokenImageFile below. Both
// share the same underlying technique, just with different numbers, since
// a token image has no business being anywhere near as large as a map.

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read that image file."));
    reader.readAsDataURL(file);
  });
}

interface ResizeOptions {
  maxDimension: number;
  webpQuality: number;
  jpegQuality: number;
  skipProcessingMaxBytes: number;
}

/** Resolves to a data URL: resized so its longer side is at most
 * `maxDimension` (never upscaled — a smaller original is left at its own
 * size), and compressed for a meaningfully smaller file size while keeping
 * good visual quality — WebP when the browser genuinely supports encoding
 * it (verified, not assumed — see below), JPEG otherwise. Already-small,
 * already-appropriately-sized images are returned as-is rather than
 * needlessly reprocessed. */
function resizeImage(file: File, options: ResizeOptions): Promise<string> {
  const { maxDimension, webpQuality, jpegQuality, skipProcessingMaxBytes } = options;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const { width: originalWidth, height: originalHeight } = img;
      URL.revokeObjectURL(objectUrl);

      if (file.size <= skipProcessingMaxBytes && originalWidth <= maxDimension && originalHeight <= maxDimension) {
        readFileAsDataUrl(file).then(resolve).catch(reject);
        return;
      }

      let width = originalWidth;
      let height = originalHeight;
      if (width > maxDimension || height > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
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
      const webpResult = canvas.toDataURL("image/webp", webpQuality);
      if (webpResult.startsWith("data:image/webp")) {
        resolve(webpResult);
      } else {
        resolve(canvas.toDataURL("image/jpeg", jpegQuality));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image file."));
    };

    img.src = objectUrl;
  });
}

/** For the battle map's background image — unchanged numbers from before
 * this file was generalized. */
export function resizeImageFile(file: File): Promise<string> {
  return resizeImage(file, { maxDimension: 2000, webpQuality: 0.85, jpegQuality: 0.82, skipProcessingMaxBytes: 800 * 1024 });
}

/** For an individual token's portrait/image — a much smaller visual
 * element than the map, so it gets its own, much smaller budget. Matches
 * the server's own independent limits (512px, ~500KB) in
 * server/battleMap.js — this is what keeps a normal upload comfortably
 * under what the server will accept, though the server never trusts this
 * client-side step alone and verifies both independently. */
export function resizeTokenImageFile(file: File): Promise<string> {
  return resizeImage(file, { maxDimension: 512, webpQuality: 0.85, jpegQuality: 0.82, skipProcessingMaxBytes: 80 * 1024 });
}

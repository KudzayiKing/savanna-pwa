/**
 * Turning a user's photo into a wallpaper that the browser will actually paint.
 *
 * The wallpaper reaches the DOM as an inline CSS custom property holding a
 * `data:` URL:
 *
 *     root.style.setProperty("--savanna-wallpaper-image", 'url("data:...")')
 *
 * Chromium caps an inline style value at 2^21 = 2,097,152 characters and
 * **silently discards anything longer** — `setProperty` does not throw, no
 * console warning is emitted, the property simply never appears, and
 * `background-image: var(--savanna-wallpaper-image, none)` then resolves to
 * `none`. The user sees no wallpaper at all, immediately after a toast said the
 * wallpaper was updated.
 *
 * A base64 data URL is about 1.37x the byte size of the file, so a raw upload
 * larger than roughly 1.45 MB would cross that line. Phone photos are routinely
 * larger, which is why this failed for most real images.
 *
 * So we never store the raw file. Everything is decoded, downscaled to a sane
 * ceiling and re-encoded as JPEG until the resulting data URL fits with margin
 * to spare.
 */

/** Rejected outright before decoding — a memory guard, not a storage limit. */
export const MAX_CUSTOM_WALLPAPER_BYTES = 12 * 1024 * 1024;

/**
 * Ceiling for the *stored* data URL, well under the 2,097,152-char hard limit.
 * 1.4M chars leaves room for the property name, the `url("")` wrapper and any
 * browser-side accounting, while still holding a crisp full-screen photo.
 */
export const MAX_STORED_WALLPAPER_CHARS = 1_400_000;

export type WallpaperSlot = "portrait" | "landscape";

/**
 * Target pixel ceilings per slot. These match the shipped Savanna art
 * (portrait 941x1672, landscape 1672x941) closely enough that a downscaled
 * upload sits alongside the bundled wallpapers without looking soft.
 */
const SLOT_MAX: Record<WallpaperSlot, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
};

const JPEG_QUALITIES = [0.85, 0.72, 0.6];

type DecodedImage = ImageBitmap | HTMLImageElement;

function releaseSource(source: DecodedImage) {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
  }
}

/**
 * `createImageBitmap` with `imageOrientation: "from-image"` is the only path
 * that applies EXIF rotation for us. Safari only gained that option recently,
 * so a failure falls back to an `<img>`, which applies orientation itself.
 */
async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Older Safari rejects the options bag; try the plain decode below.
      try {
        return await createImageBitmap(file);
      } catch {
        // Fall through to the <img> path.
      }
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("That image could not be read."));
      element.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Decode, downscale and compress `file` until its data URL fits in the budget.
 *
 * Returns a `data:image/jpeg;base64,...` string guaranteed to be shorter than
 * `MAX_STORED_WALLPAPER_CHARS`, or throws with a message worth showing.
 */
export async function encodeWallpaperForSlot(
  file: File,
  slot: WallpaperSlot,
): Promise<string> {
  const source = await decodeImage(file);
  const sourceWidth = source.width;
  const sourceHeight = source.height;

  if (!sourceWidth || !sourceHeight) {
    releaseSource(source);
    throw new Error("That image could not be read.");
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    releaseSource(source);
    throw new Error("This browser cannot resize images.");
  }

  const limit = SLOT_MAX[slot];
  let scale = Math.min(1, limit.width / sourceWidth, limit.height / sourceHeight);

  try {
    // Each pass shrinks by 25%. Five passes is a 4x reduction from the first
    // attempt, which is far more than any realistic photo needs.
    for (let pass = 0; pass < 5; pass += 1) {
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));

      canvas.width = width;
      canvas.height = height;
      // JPEG has no alpha channel: a transparent PNG would otherwise composite
      // onto black. A white base keeps the result predictable.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(source, 0, 0, width, height);

      for (const quality of JPEG_QUALITIES) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length <= MAX_STORED_WALLPAPER_CHARS) return dataUrl;
      }

      scale *= 0.75;
    }
  } finally {
    releaseSource(source);
  }

  throw new Error("That image is too detailed to store. Try a smaller one.");
}

/**
 * Confirms the browser actually accepted a value for an inline custom property.
 *
 * This exists because the failure mode that caused the original bug was
 * completely silent. `setProperty` reports nothing when it refuses an
 * over-long value, so the only reliable check is to write it and read it back.
 */
export function inlineStyleAccepts(value: string): boolean {
  if (typeof document === "undefined") return true;
  const probe = document.createElement("div").style;
  probe.setProperty("--savanna-probe", value);
  return probe.getPropertyValue("--savanna-probe").length > 0;
}

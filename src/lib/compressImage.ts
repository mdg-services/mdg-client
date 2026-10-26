import { resolveFileType } from './uploadAttachment';

/**
 * Downscale + recompress a picked photo BEFORE the presigned S3 PUT, so a 6 MB
 * phone-camera JPEG uploads as a few hundred KB. This is the single biggest win
 * for image-heavy chat threads on a low-end Android phone over 2G: less to
 * upload, less to download later, less memory to decode.
 *
 * Deliberately conservative — it returns `null` (meaning "keep the original")
 * whenever compression is not worth it or could go wrong, so the caller NEVER
 * uploads a broken/empty blob:
 *   - not a raster image (uses resolveFileType to recover Android empty-MIME)
 *   - already small (< ~300 KB)
 *   - animated GIF (would flatten to a single frame)
 *   - the environment lacks createImageBitmap / <canvas>
 *   - decode/encode throws, or the result is empty or bigger than the original
 *
 * ONE EXCEPTION TO "KEEP THE ORIGINAL WHEN IT IS NOT WORTH IT": an iPhone's
 * HEIC/HEIF photo. It is small, so the size floor would leave it alone, and it
 * is smaller than the JPEG it becomes, so the "no saving" rule would too — and
 * then MDG's team, an Android phone and this app's own preview would receive a
 * file almost nothing can open. HEIC is always converted to JPEG when the phone
 * can decode it; when it cannot, the original is kept, as for any other failure.
 *
 * Uses a normal <canvas> (not OffscreenCanvas, which is missing on Android 8/9
 * System WebView). createImageBitmap IS available there and decodes off the main
 * layout path.
 */

/** Below this, the CPU + quality cost of recompressing isn't worth it. */
const MIN_COMPRESS_BYTES = 300 * 1024;
/** Longest edge of the output image, in CSS px. */
const MAX_EDGE = 1600;
/** JPEG quality for the re-encode. */
const JPEG_QUALITY = 0.7;

/** An iPhone's own photo format, by its type or, when the type is empty, its name. */
function isHeic(file: File, type: string): boolean {
  return /^image\/hei[cf]$/.test(type.split(';')[0]!.trim()) || /\.hei[cf]$/i.test(file.name);
}

export async function compressImage(
  file: File,
  opts?: { contentType?: string },
): Promise<File | null> {
  try {
    // Recover the real kind/type even when Android hands back an empty MIME.
    const resolved = resolveFileType(file);
    const type = (opts?.contentType || file.type || resolved.contentType).toLowerCase();
    if (resolved.kind !== 'image') return null;
    // Animated GIFs would be flattened to one frame — leave them alone.
    if (type.includes('gif')) return null;
    const heic = isHeic(file, type);
    if (file.size < MIN_COMPRESS_BYTES && !heic) return null;
    if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
      return null;
    }

    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (!width || !height) {
      bitmap.close?.();
      return null;
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY);
    });
    // Release the backing store promptly on memory-constrained devices.
    canvas.width = 0;
    canvas.height = 0;

    if (!blob || blob.size === 0) return null; // never upload an empty blob
    // No real saving — keep the original. Never for HEIC: the JPEG is the point.
    if (blob.size >= file.size && !heic) return null;

    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    // Any failure (unsupported HEIC decode, OOM, tainted canvas) → keep original.
    return null;
  }
}

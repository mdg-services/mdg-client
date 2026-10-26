import { detectPlatform } from './nativeBridge';

/**
 * What a photo picker's `accept` says.
 *
 * ON AN IPHONE, `image/*` HANDS BACK HEIC. That is the camera's own format, and
 * almost nothing else can open it — not MDG's team on a desktop, not an Android
 * phone, not this app's own preview. When the list names the formats the phone
 * should hand over (JPEG, PNG, WebP) and leaves HEIC out, iOS converts the photo
 * to JPEG at the moment it is picked. Everywhere else `image/*` is right: it
 * is what offers the camera and the gallery together.
 *
 * `withPdf` is for "Choose file" on a request, which takes a picture or a PDF.
 * The `capture` attribute on the camera input is the caller's, not decided here.
 */
export function imageAccept(withPdf = false): string {
  const images =
    detectPlatform() === 'ios' ? 'image/jpeg,image/png,image/webp' : 'image/*';
  return withPdf ? `${images},application/pdf` : images;
}

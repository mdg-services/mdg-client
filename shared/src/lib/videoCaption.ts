/**
 * The words a guide video goes out with on WhatsApp, under the video.
 *
 * WhatsApp plays a video from its first second: unlike the dealer app, it cannot
 * be sent "from 1:52". So a send that names a chapter says where to look, in the
 * caption: the title, then "1:52 से देखें: <chapter>". Hindi, as the videos are.
 *
 * Shared, so the admin's "Send a video" shows exactly the words the server sends.
 * Pure: no I/O, no clock.
 */

export interface CaptionableVideo {
  title: { hi: string; en: string };
  chapters: ReadonlyArray<{ startSec: number; label: { hi: string; en: string } }>;
}

/** `m:ss`. */
function clock(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * "🎬 <title>", and on a second line where the chapter starts when `startSec` is
 * one of the video's chapters other than the first. Any other start is the
 * beginning, and is not mentioned.
 */
export function whatsAppVideoCaption(video: CaptionableVideo, startSec?: number | null): string {
  const title = `🎬 ${video.title.hi}`;
  const chapter =
    startSec && startSec > 0 ? video.chapters.find((c) => c.startSec === startSec) : undefined;
  return chapter ? `${title}\n${clock(chapter.startSec)} से देखें: ${chapter.label.hi}` : title;
}

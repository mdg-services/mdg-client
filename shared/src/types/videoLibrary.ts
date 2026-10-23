/**
 * The guide video library: every short video MDG can send inside the chat or
 * list in the app's Help, described well enough for the chat assistant to
 * match a question to a video — and to the CHAPTER that answers it — by
 * meaning (docs/specs/onboarding-v2.md §6).
 *
 * Each video's source folder (`marketing/explainers/<slug>/`) carries a
 * `library.json` in the {@link GuideVideoLibraryFile} shape. The backend builds
 * its catalog from those files plus the uploaded object's key and length, so
 * adding a video is one folder and one upload — no code list to extend.
 */

export type GuideVideoLang = 'hi' | 'en';
export interface GuideVideoText {
  hi: string;
  en: string;
}

/** Who a video is for. `admin` videos play only in the admin's "How this works". */
export const GUIDE_VIDEO_AUDIENCES = ['owner', 'manager', 'both', 'admin'] as const;
export type GuideVideoAudience = (typeof GUIDE_VIDEO_AUDIENCES)[number];

export interface GuideVideoChapter {
  /** Where the chapter starts, in seconds from the beginning. */
  startSec: number;
  label: GuideVideoText;
  /** What is said in it (the voice line), in the video's language: what the matching reads. */
  text: string;
}

/** `marketing/explainers/<slug>/library.json`. */
export interface GuideVideoLibraryFile {
  /** Stable id, snake_case: `app_tour`, `svc_dsr`, `paying_bill`. Never reused for another video. */
  id: string;
  title: GuideVideoText;
  /** One line: what the viewer learns. */
  summary: GuideVideoText;
  /** Words people actually type for it, both scripts and romanised Hindi ("login", "लॉगिन", "password bhool gaya"). */
  aliases: string[];
  audience: GuideVideoAudience;
  /** The service it explains (a `SETUP_SERVICE_IDS` id), when it is a service video. */
  service: string | null;
  /**
   * True for a video that must never be sent or listed INSIDE the app (the
   * "paying your bill" video: Google Play forbids pointing at a way to pay in
   * the app). It goes on WhatsApp only.
   */
  outsideAppOnly: boolean;
  chapters: GuideVideoChapter[];
}

/** One catalog entry as the backend holds it: the file plus where the video is. */
export interface GuideVideoEntry extends GuideVideoLibraryFile {
  /** `guides/<slug>-hi-v<n>.mp4` in the bucket. */
  storageKey: string;
  filename: string;
  durationMs: number;
}

/** What the app's Help list shows (GET /me/guide-videos). */
export interface GuideVideoListItem {
  id: string;
  title: GuideVideoText;
  summary: GuideVideoText;
  durationMs: number;
  service: string | null;
  /** False until the video is uploaded: the list shows it greyed, or not at all. */
  available: boolean;
}

/** One video, ready to play (GET /me/guide-videos/:id), optionally from a chapter. */
export interface GuideVideoPlay {
  id: string;
  title: GuideVideoText;
  /** Signed, short-lived. */
  url: string;
  durationMs: number;
  startSec: number;
}

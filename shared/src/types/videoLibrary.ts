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
  /**
   * Which numbered cut is in the bucket: the key is `guides/<slug>-hi-v<n>.mp4`.
   * Absent = 1. A re-cut video gets the next number, so a message already in a
   * thread keeps playing the cut it was sent with.
   */
  storageVersion?: number;
  /** The name a phone saves it under (ASCII, `.mp4`). Absent = `<slug>.mp4`. */
  filename?: string;
  /** Length in ms when known. Absent = measured from the finished chat copy when the catalog is built. */
  durationMs?: number;
  /**
   * Offered only where it is true. A video about a register a pump keeps only
   * on one service is no use to a pump that is not on it; the login video
   * explains a box only an outlet that uses a portal login ever gets.
   */
  onlyFor?: {
    /** The outlet must be on this service (a `SERVICE_IDS` id). */
    service?: string;
    /** The outlet must use a portal login (SDMS or IRAS). */
    usesPortalLogin?: true;
  };
}

/** One catalog entry as the backend holds it: the file plus where the video is. */
export interface GuideVideoEntry extends GuideVideoLibraryFile {
  /** The video's folder name under `marketing/explainers/`. */
  slug: string;
  /** `guides/<slug>-hi-v<n>.mp4` in the bucket. */
  storageKey: string;
  filename: string;
  durationMs: number;
}

/** A chapter as a list shows it: where it starts and what it is called. */
export interface GuideVideoChapterLabel {
  startSec: number;
  label: GuideVideoText;
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

/** One row of the admin's library (GET /admin/guide-videos): every video, with who it is for. */
export interface GuideVideoAdminItem extends GuideVideoListItem {
  audience: GuideVideoAudience;
  /** True for a video that goes on WhatsApp only: never offered to send into the app's chat. */
  outsideAppOnly: boolean;
  chapters: GuideVideoChapterLabel[];
}

/** One video, ready to play (GET /me/guide-videos/:id), optionally from a chapter. */
export interface GuideVideoPlay {
  id: string;
  title: GuideVideoText;
  /** Signed, short-lived. */
  url: string;
  durationMs: number;
  /** Where to start, in seconds: the chapter asked for, else 0. */
  startSec: number;
  /** The chapters, so a player can offer "jump to". */
  chapters: GuideVideoChapterLabel[];
}

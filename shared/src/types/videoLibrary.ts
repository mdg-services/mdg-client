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
 *
 * TWO FAMILIES in one library (`family`):
 *  - `guide`: MDG's own videos — how the app works, what each service is, and the
 *    team's walkthroughs. Private: they live in the bucket and play in the apps.
 *  - `explainer`: the short pump-knowledge explainers published on
 *    mdgservices.in/videos (the water dip, the three-day deposit clock, …). They
 *    are public, in Hindi and English, and are built into the library from the
 *    website's own catalog, so the team can find them, send them into a chat and
 *    the Reply helper can suggest them. They are never listed in the dealer app's
 *    Help, which is about the app.
 */
import type { OilCompanyId } from './oilCompany';

export type GuideVideoLang = 'hi' | 'en';
export interface GuideVideoText {
  hi: string;
  en: string;
}

/** The phones a video can be limited to. */
export const GUIDE_VIDEO_PLATFORMS = ['android', 'ios'] as const;
export type GuideVideoPlatform = (typeof GUIDE_VIDEO_PLATFORMS)[number];

/** Which kind of video (see the top of this file). Absent on an entry = `guide`. */
export const GUIDE_VIDEO_FAMILIES = ['guide', 'explainer'] as const;
export type GuideVideoFamily = (typeof GUIDE_VIDEO_FAMILIES)[number];

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
   * Which kinds of phone this video may be listed on. Absent = every phone.
   * The install video says "Play Store", which the iPhone app must not show
   * (App Review guideline 2.3.10), so it is `['android']`. A request that names
   * no platform, or the web, is not filtered (`GET /me/guide-videos?platform=`).
   */
  platforms?: GuideVideoPlatform[];
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
  /**
   * The situations in which MDG's team should send this video (for a team video:
   * when an admin should watch it), in plain English: "A prospective dealer on
   * WhatsApp asks how to start." Read by the Reply helper to suggest a video beside
   * its draft, and searched by the admin's Videos page. Absent on older entries.
   */
  sendWhen?: string[];
  /**
   * The oil companies the video is for. Absent = every company. A video that shows
   * Indian Oil's full service set is `['iocl']`, so a BPCL or HPCL pump is never sent
   * it — on top of the rule that hides any video whose words name SDMS, IRAS or
   * IndianOil from them.
   */
  companies?: OilCompanyId[];
}

/** One catalog entry as the backend holds it: the file plus where the video is. */
export interface GuideVideoEntry extends GuideVideoLibraryFile {
  /** The video's folder name under `marketing/explainers/` (an explainer: `pk-<its website slug>`). */
  slug: string;
  /** `guides/<slug>-hi-v<n>.mp4` in the bucket (an explainer: `guides/<slug>-hi-<content hash>.mp4`). */
  storageKey: string;
  filename: string;
  durationMs: number;
  /** Absent = `guide`. */
  family?: GuideVideoFamily;
  /** A guide's poster frame in the bucket, next to the video: `guides/<slug>-hi-v<n>.webp`. */
  posterKey?: string;
  /** An explainer's public poster on mdgservices.in (Hindi). */
  posterUrl?: string;
  /** An explainer's public page, in each language. */
  publicUrl?: GuideVideoText;
  /** An explainer's public Hindi file: plays in the admin before its copy is in the bucket. */
  mediaUrl?: string;
  /**
   * Everything an explainer says, in each language. Its chapters carry labels and
   * no voice line, so this is what a search and the Reply helper read.
   */
  transcript?: GuideVideoText;
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

/** A chapter as the admin's library shows and searches it: also what is said in it. */
export interface GuideVideoAdminChapter extends GuideVideoChapterLabel {
  /** The voice line, in the video's language (an explainer's chapter repeats its label). */
  text: string;
}

/** One row of the admin's library (GET /admin/guide-videos): every video, with who it is for. */
export interface GuideVideoAdminItem extends GuideVideoListItem {
  audience: GuideVideoAudience;
  /** True for a video that goes on WhatsApp only: never offered to send into the app's chat. */
  outsideAppOnly: boolean;
  chapters: GuideVideoAdminChapter[];
  /** `guide` or `explainer` (a public pump-knowledge video). */
  family: GuideVideoFamily;
  /** The words people type for it, for the search. */
  aliases: string[];
  /** When to send it (when to watch it, for a team video). Empty when the library says nothing. */
  sendWhen: string[];
  /** May it be sent into a dealer's app chat: not a team video, not WhatsApp-only, and uploaded. */
  sendable: boolean;
  /** A picture to show for it: a signed link to the poster, the public poster, or null. */
  posterUrl: string | null;
  /** An explainer's public page in each language; null for MDG's own guides. */
  publicUrl: GuideVideoText | null;
  /** Everything an explainer says; null for a guide, whose chapters carry it. */
  transcript: GuideVideoText | null;
  /** Limited to these oil companies; null = every company. */
  companies: OilCompanyId[] | null;
  /** Offered only where it is true (`GuideVideoLibraryFile.onlyFor`); null = everywhere. */
  onlyFor: GuideVideoLibraryFile['onlyFor'] | null;
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

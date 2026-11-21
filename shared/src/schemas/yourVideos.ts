import { z } from 'zod';

import { SHARE_AUDIENCES } from '../types/share';

/**
 * Body for `POST /me/your-videos/watch`: "I played this video for this many
 * seconds". Only the SHAPE is checked here. Whether that many seconds count is
 * the server's call, against the video's real length (`watchedNeededSec`).
 *
 * The video is named by its library id (the player that opened it from a list knows it)
 * or by the file in a chat message (a video MDG sent into the chat carries only its
 * file); exactly one of the two.
 */
export const watchReportSchema = z
  .object({
    videoId: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/, 'Not a video id')
      .optional(),
    storageKey: z
      .string()
      .max(200)
      .regex(/^guides\/[a-z0-9-]+-hi-[a-z0-9]+\.mp4$/, 'Not a guide video file')
      .optional(),
    /** Seconds actually played, never jumped over. */
    playedSec: z.number().finite().min(0).max(36_000),
  })
  .strict()
  .refine((b) => (b.videoId === undefined) !== (b.storageKey === undefined), {
    message: 'Name the video by its id or by its file, one of the two',
  });
export type WatchReportInput = z.infer<typeof watchReportSchema>;

/** Body for `POST /dealers/:id/your-videos/send`: who the list goes to. Absent = both. */
export const sendYourVideosSchema = z
  .object({
    audience: z.enum(SHARE_AUDIENCES).optional(),
  })
  .strict();
export type SendYourVideosInput = z.infer<typeof sendYourVideosSchema>;

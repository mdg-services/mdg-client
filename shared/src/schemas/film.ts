/**
 * Validation for the film pages (docs/films/FILM_PAGES_SPEC.md, ADR 0015).
 *
 * The beacon arrives from an anonymous browser with no login, so the identifying
 * fields are strict — a `sid` that is not a uuid is not one of our pages — while
 * the descriptive ones are forgiving: a hand-edited `?r=` or an odd user agent
 * costs the view its label, never the view itself. Every number is finite and
 * bounded, every string and array is capped.
 */

import { z } from 'zod';

import {
  FILM_AUTOPLAY_OUTCOMES,
  FILM_BEACON_KINDS,
  FILM_CTAS,
  FILM_IDS,
  type FilmBeacon,
} from '../types/film';

export const filmIdSchema = z.enum(FILM_IDS);

/** A share-link code as it may appear in `?r=`. */
export const FILM_TAG_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/** A free-text descriptor: kept if it is a short string, dropped (not refused) otherwise. */
const soft = (max: number) => z.string().trim().min(1).max(max).optional().catch(undefined);
const softNumber = (min: number, max: number) =>
  z.number().finite().min(min).max(max).optional().catch(undefined);
const softBool = z.boolean().optional().catch(undefined);

const second = z.number().finite().min(-1e6).max(1e6);

export const filmBeaconContextSchema = z.object({
  tag: z.string().regex(FILM_TAG_PATTERN).optional().catch(undefined),
  from: z
    .string()
    .regex(/^[a-z-]{1,16}$/)
    .optional()
    .catch(undefined),
  ref: soft(253),
  lang: soft(35),
  os: soft(40),
  browser: soft(40),
  mobile: softBool,
  inApp: soft(24),
  screen: z
    .tuple([z.number().int().min(0).max(20000), z.number().int().min(0).max(20000)])
    .optional()
    .catch(undefined),
  net: z
    .object({
      type: soft(16),
      saveData: softBool,
      downlink: softNumber(0, 100000),
    })
    .optional()
    .catch(undefined),
  geo: z
    .object({
      country: soft(8),
      region: soft(80),
      city: soft(80),
    })
    .optional()
    .catch(undefined),
  autoplay: z.enum(FILM_AUTOPLAY_OUTCOMES),
});

export const filmBeaconSchema = z.object({
  v: z.literal(1),
  film: filmIdSchema,
  sid: z.string().uuid(),
  vid: z.string().uuid(),
  seq: z.number().int().min(0).max(100000),
  kind: z.enum(FILM_BEACON_KINDS),
  at: z.number().finite(),
  ctx: filmBeaconContextSchema.optional(),
  ranges: z
    .array(z.tuple([second, second]))
    .max(500)
    .optional(),
  pos: second.optional(),
  muted: z.boolean().optional(),
  unmutedAt: second.optional(),
  restarted: z.boolean().optional(),
  startupMs: z.number().finite().min(0).max(600000).optional(),
  rebuffers: z.number().int().min(0).max(10000).optional(),
  rebufferMs: z.number().finite().min(0).max(3600000).optional(),
  level: z.number().int().min(0).max(10000).optional(),
  ended: z.boolean().optional(),
  cta: z.array(z.enum(FILM_CTAS)).max(50).optional(),
  rate: z.number().finite().min(0.0625).max(16).optional(),
});
export type FilmBeaconInput = z.infer<typeof filmBeaconSchema>;

// The schema and the hand-written type must describe the same object. If either
// drifts, one of these two lines stops compiling.
const _beaconFitsType = (b: FilmBeaconInput): FilmBeacon => b;
const _typeFitsBeacon = (b: FilmBeacon): FilmBeaconInput => b;
void _beaconFitsType;
void _typeFitsBeacon;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const filmStatsQuerySchema = z.object({
  from: isoDay.optional(),
  to: isoDay.optional(),
  tag: z.string().regex(FILM_TAG_PATTERN).optional(),
});
export type FilmStatsQuery = z.infer<typeof filmStatsQuerySchema>;

export const filmSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().datetime({ offset: true }).optional(),
  tag: z.string().regex(FILM_TAG_PATTERN).optional(),
});
export type FilmSessionsQuery = z.infer<typeof filmSessionsQuerySchema>;

export const filmLinksQuerySchema = z.object({
  film: filmIdSchema.optional(),
  /** `1` to include archived links. */
  archived: z.enum(['0', '1']).optional(),
});
export type FilmLinksQuery = z.infer<typeof filmLinksQuerySchema>;

export const createFilmShareLinkSchema = z.object({
  film: filmIdSchema,
  label: z.string().trim().min(1, 'Say who or where this link is for').max(80),
});
export type CreateFilmShareLinkInput = z.infer<typeof createFilmShareLinkSchema>;

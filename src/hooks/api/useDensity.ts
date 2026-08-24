import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { type ApiError, api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { Lang } from '@/store/lang';
import type { TtRegisterPhotoInput } from '@dk/shared/schemas';
import {
  TT_REGISTER_DEALER_BACKDATE_DAYS,
  type TtDensityDayLog,
  type TtDensityMeView,
  type TtRegisterDayStatus,
  type TtRegisterDaySummary,
  type TtSignedFileUrls,
} from '@dk/shared/types';

/**
 * The dealer's own density register: the last tanker readings, and which of the
 * open days already carry a photo.
 *
 * The day maths lives here beside the query rather than in the components
 * because three separate screens ask the same question — the pinned card on the
 * chat list, the card on `/density`, and the week strip — and if any two of them
 * worked out "is anything due today?" independently they could disagree, which
 * on this feature means a dealer who has already sent today's photo still being
 * nagged for it on their home screen.
 */

const DAY_MS = 86_400_000;

/**
 * The calendar day `n` days after `key`, as `YYYY-MM-DD`.
 *
 * Anchored at midday UTC rather than midnight: these keys are IST calendar days
 * and the phone's own clock may be anywhere, so starting from midnight leaves
 * every arithmetic result half a day from a boundary it can fall over. From
 * midday no offset in use anywhere can move the date.
 */
function shiftDay(key: string, n: number): string {
  const t = Date.parse(`${key}T12:00:00Z`);
  if (Number.isNaN(t)) return key;
  return new Date(t + n * DAY_MS).toISOString().slice(0, 10);
}

/** One day of the register, as the strip and the card need it. */
export interface DensityDay {
  /** IST calendar day, `YYYY-MM-DD`. */
  businessDate: string;
  status: TtRegisterDayStatus;
  /** True when MDG filled this day in on the dealer's behalf. */
  byAdmin: boolean;
  isToday: boolean;
  /** False once the day has fallen out of the window the server will accept. */
  markable: boolean;
}

/**
 * The seven days the dealer can still act on — today and the six before it —
 * oldest first, one entry per day whether or not the server sent one.
 *
 * The window is built from `today` backwards and only then checked against
 * `earliestMarkableDate`, so a payload whose earliest date is missing or ahead
 * of today still renders seven honest cells; it narrows what may be tapped
 * instead of blanking the screen. `earliestMarkableDate` is the server's own
 * boundary, carried in the payload precisely so the screen never offers a day
 * the server is about to refuse.
 */
export function densityWindow(view: TtDensityMeView): DensityDay[] {
  const byDate = new Map<string, TtRegisterDaySummary>(
    view.days.map((d) => [d.businessDate, d]),
  );
  const earliest =
    view.earliestMarkableDate ||
    shiftDay(view.today, -(TT_REGISTER_DEALER_BACKDATE_DAYS - 1));

  const days: DensityDay[] = [];
  for (let back = TT_REGISTER_DEALER_BACKDATE_DAYS - 1; back >= 0; back -= 1) {
    const businessDate = shiftDay(view.today, -back);
    const summary = byDate.get(businessDate);
    days.push({
      businessDate,
      status: summary?.status ?? 'MISSING',
      byAdmin: summary?.uploadedBy?.kind === 'admin',
      isToday: businessDate === view.today,
      markable: businessDate >= earliest && businessDate <= view.today,
    });
  }
  return days;
}

/** What the dealer still owes, from the same window. */
export interface DensityDue {
  /** Today's day. Always present — the window always ends on today. */
  today: DensityDay;
  /** Earlier open days with no photo yet, oldest first. */
  missed: DensityDay[];
  /** True while there is anything at all to do. */
  anything: boolean;
}

export function densityDue(view: TtDensityMeView): DensityDue {
  const days = densityWindow(view);
  const today: DensityDay = days[days.length - 1] ?? {
    businessDate: view.today,
    status: 'MISSING',
    byAdmin: false,
    isToday: true,
    markable: true,
  };
  const missed = days
    .slice(0, -1)
    .filter((d) => d.status === 'MISSING' && d.markable);
  return {
    today,
    missed,
    anything: today.status === 'MISSING' || missed.length > 0,
  };
}

/**
 * How a register day is written on the dealer's screen.
 *
 * `full` is "Sun, 24 Aug" for a card heading, `chip` is "Sat 23" for a day
 * button, `date` is "22 Aug" for the line under a reading, and `initial` is the
 * single letter over a week-strip cell.
 *
 * Every one of them prints the number as well as the word, and that is not
 * decoration: Hindi's "कल" means yesterday and tomorrow both, so a day named
 * only in words is genuinely ambiguous to the person we are asking to
 * photograph the right page.
 *
 * Formatted in UTC against a midday anchor so the phone's own time zone cannot
 * shift the printed date off the day being marked, and wrapped in a try/catch
 * because a stripped-down Android WebView can throw on a locale its ICU data
 * does not carry — a date that prints as `2026-08-24` is survivable, a screen
 * that does not render is not.
 */
export function densityDayLabel(
  lang: Lang,
  businessDate: string,
  style: 'full' | 'chip' | 'date' | 'initial',
): string {
  const t = Date.parse(`${businessDate}T12:00:00Z`);
  if (Number.isNaN(t)) return businessDate;
  const options: Intl.DateTimeFormatOptions =
    style === 'full'
      ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }
      : style === 'chip'
        ? { weekday: 'short', day: 'numeric', timeZone: 'UTC' }
        : style === 'date'
          ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
          : { weekday: 'narrow', timeZone: 'UTC' };
  try {
    return new Intl.DateTimeFormat(
      lang === 'hi' ? 'hi-IN' : 'en-IN',
      options,
    ).format(new Date(t));
  } catch {
    return businessDate;
  }
}

/** Just the day number, for the face of a week-strip cell. */
export function densityDayNumber(businessDate: string): string {
  return String(Number(businessDate.slice(8, 10)) || businessDate.slice(8, 10));
}

export const densityMeQueryKey = ['tt-density', 'me'] as const;

/**
 * The dealer's own view of the service.
 *
 * There is deliberately no 404 branch here, unlike `useKavachMe`: this route
 * answers 200 with `attached: false` for a dealer who does not have the service,
 * so "not switched on for your pump yet" is a state in the payload rather than
 * an error the client has to translate back into calm.
 */
export function useDensityMe() {
  const token = useAuthStore((s) => s.token);
  return useQuery<TtDensityMeView>({
    queryKey: densityMeQueryKey,
    enabled: !!token,
    staleTime: 30_000,
    queryFn: () => api.get<TtDensityMeView>('/v1/tt-density/me'),
  });
}

export interface MarkDensityDayVars {
  /** IST calendar day, `YYYY-MM-DD`. */
  businessDate: string;
  photo: TtRegisterPhotoInput;
}

/**
 * Mark one day's register page as photographed.
 *
 * Optimistic, so the day turns green in the same gesture that sent the photo
 * and the pinned card on the chat list disappears immediately. On failure the
 * optimistic day is rolled back — the dealer must see the true state, because
 * the one thing they will do next is decide whether to send it again.
 *
 * No toast here. The sheet that owns the send is still on screen and says what
 * happened in place; a toast on top of it would be the same news twice.
 */
export function useMarkDensityDay() {
  const qc = useQueryClient();
  return useMutation<
    TtDensityDayLog,
    ApiError,
    MarkDensityDayVars,
    { previous?: TtDensityMeView }
  >({
    mutationFn: ({ businessDate, photo }) =>
      api.post<TtDensityDayLog>(
        `/v1/tt-density/me/days/${businessDate}/photo`,
        photo,
      ),
    onMutate: async ({ businessDate }) => {
      await qc.cancelQueries({ queryKey: densityMeQueryKey });
      const previous = qc.getQueryData<TtDensityMeView>(densityMeQueryKey);

      qc.setQueryData<TtDensityMeView>(densityMeQueryKey, (old) => {
        if (!old) return old;
        const existing = old.days.find((d) => d.businessDate === businessDate);
        const marked: TtRegisterDaySummary = {
          businessDate,
          status: 'MARKED',
          markedAt: new Date().toISOString(),
          uploadedBy: { kind: 'dealer', userId: null, name: null },
          photoCount: (existing?.photoCount ?? 0) + 1,
        };
        const days = existing
          ? old.days.map((d) => (d.businessDate === businessDate ? marked : d))
          : [marked, ...old.days].sort((a, b) =>
              b.businessDate.localeCompare(a.businessDate),
            );
        return {
          ...old,
          days,
          markedDays:
            existing?.status === 'MARKED' ? old.markedDays : old.markedDays + 1,
        };
      });

      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(densityMeQueryKey, ctx.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: densityMeQueryKey });
    },
  });
}

/**
 * A short-lived link to the photo already on file for one day.
 *
 * Cached only as long as the link itself is worth anything: a signed URL parked
 * in the cache outlives its signature and then serves the dealer a blank frame
 * where their own photo should be.
 */
export function useDensityDayPhotoUrl(businessDate: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery<TtSignedFileUrls>({
    queryKey: ['tt-density', 'me', 'photo-url', businessDate],
    enabled: !!token && !!businessDate,
    staleTime: 60_000,
    gcTime: 60_000,
    retry: false,
    queryFn: () =>
      api.get<TtSignedFileUrls>(
        `/v1/tt-density/me/days/${businessDate}/photo-url`,
      ),
  });
}

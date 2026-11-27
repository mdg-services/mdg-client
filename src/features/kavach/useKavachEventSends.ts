import * as React from 'react';

import { useKavachChecks } from '@/hooks/api/useKavach';
import { useAuthStore } from '@/store/auth';
import type { KavachDealerCheck, KavachDealerItem } from '@dk/shared/types';

import { istDay } from './kavachView';

/**
 * The photos this phone sent for when-it-happens points (spec 4.4, the vanishing photo).
 *
 * The server's Kavach view never lists a when-it-happens point's check: its rows are built with no check,
 * so a photo sent for one showed "Sent" for three seconds and then nothing, and a send-back had
 * nothing to open. The send itself answers with the check, so this phone keeps the check's id (in the
 * browser's storage, in try/catch, and in memory for as long as the page lives), asks the server
 * for each one with the existing `GET /v1/kavach/me/checks/:id`, and hands the page the rows as they
 * stand: With MDG while sent, Needs you when sent back, Done when accepted.
 *
 * It is a convenience, not a record: with the browser's storage blocked it still works until the
 * page is closed. A check the server lists in the view itself wins (`sectionsOf` drops the copy).
 */
export const EVENT_SENDS_KEY = 'mdg.client.kavachEventSends';

/** How long a sent photo is remembered, and how many. */
const KEEP_MS = 7 * 86_400_000;
const MAX = 20;

interface Remembered {
  dealerId: string;
  checkId: string;
  /** When it was sent from this phone. */
  at: string;
  /** The check as the send answered it (no signed photo link: those expire). */
  item: KavachDealerItem;
}

function valid(x: unknown): x is Remembered {
  if (!x || typeof x !== 'object') return false;
  const r = x as Partial<Remembered>;
  return (
    typeof r.dealerId === 'string' &&
    typeof r.checkId === 'string' &&
    typeof r.at === 'string' &&
    !!r.item &&
    typeof r.item === 'object'
  );
}

export function readEventSends(): Remembered[] {
  try {
    const raw = window.localStorage.getItem(EVENT_SENDS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(valid) : [];
  } catch {
    return [];
  }
}

function writeEventSends(list: readonly Remembered[]): void {
  try {
    window.localStorage.setItem(EVENT_SENDS_KEY, JSON.stringify(list));
  } catch {
    /* a convenience: the page keeps its own copy for as long as it lives */
  }
}

const fresh = (r: Remembered, at: Date) => at.getTime() - new Date(r.at).getTime() < KEEP_MS;

/**
 * One remembered send as a row, or null when it should not be shown. A photo with MDG or sent back is
 * always shown (it waits on someone); an accepted one only on the day it was sent, so Done does not
 * collect them for a week.
 */
export function eventRowOf(rec: Remembered, check: KavachDealerCheck | undefined, at: Date = new Date()): KavachDealerItem | null {
  const base = check?.item ?? rec.item;
  const photo = check?.submission?.files.find((f) => f.kind === 'image')?.url ?? null;
  const by = check?.submission?.by?.name ?? null;
  const item = { ...base, checkId: rec.checkId, thumbUrl: photo, sentByName: by } as KavachDealerItem;
  if (item.state === 'sent' || item.state === 'sent_back') return item;
  if (item.state === 'done') {
    const sentAt = item.sentAt ?? rec.at;
    return istDay(sentAt) === istDay(at.toISOString()) ? item : null;
  }
  return null;
}

export function useKavachEventSends(): {
  items: KavachDealerItem[];
  remember: (item: KavachDealerItem) => void;
} {
  const dealerId = useAuthStore((s) => s.user?.dealerId ?? null);
  const [all, setAll] = React.useState<Remembered[]>(readEventSends);
  const mine = React.useMemo(() => {
    const at = new Date();
    return all.filter((r) => r.dealerId === dealerId && fresh(r, at));
  }, [all, dealerId]);
  const checks = useKavachChecks(React.useMemo(() => mine.map((r) => r.checkId), [mine]));

  // `useQueries` hands back a new array every render; the rows only change when an answer does.
  const stamp = checks.map((c) => c.dataUpdatedAt).join(',');
  const items = React.useMemo(() => {
    const at = new Date();
    const rows: KavachDealerItem[] = [];
    mine.forEach((rec, i) => {
      const row = eventRowOf(rec, checks[i]?.data, at);
      if (row) rows.push(row);
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `stamp` stands for `checks`
  }, [mine, stamp]);

  const remember = React.useCallback(
    (item: KavachDealerItem) => {
      if (!dealerId || !item.checkId) return;
      const checkId = item.checkId;
      setAll((cur) => {
        const at = new Date();
        const rec: Remembered = { dealerId, checkId, at: at.toISOString(), item: { ...item, thumbUrl: null } };
        const next = [rec, ...cur.filter((r) => r.checkId !== checkId && fresh(r, at))].slice(0, MAX);
        writeEventSends(next);
        return next;
      });
    },
    [dealerId],
  );

  return { items, remember };
}

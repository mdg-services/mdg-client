import { Camera, ChevronRight, Clock3 } from 'lucide-react';
import * as React from 'react';
import { useMatch, useNavigate } from 'react-router-dom';

import { useAskListSocket, useMyAsks } from '@/hooks/api/useAsks';
import { useAskQueueSync } from '@/hooks/useAskQueueSync';
import { pick, useLang, useT } from '@/lib/i18n';
import { queuedKeysFor, useAskQueueStore } from '@/store/askQueue';
import { useAuthStore } from '@/store/auth';
import { documentPeriodLabel } from '@dk/shared/types';

import { askBarFace, askBarTap, EMPTY_ASK_LIST, outstandingRows } from './askRules';
import { useAskCapture } from './useAskCapture';

/**
 * The one line that says the dealer owes MDG a piece of paper.
 *
 * IT REPLACED THE DENSITY PIN, AND THE REPLACEMENT IS THE POINT
 * ------------------------------------------------------------
 * `DensityChatPin` used to sit above the chat list saying "send today's register
 * page". The register page is now one document kind among several, and two
 * things on one screen both saying "send today's photo" is a worse screen than
 * one — the dealer has to work out whether they are the same chore before they
 * can do either. So the pin's mount in `AppShell` is gone and this took its
 * place. `DensityTodayCard` is untouched and still owns `/density`, which is
 * where the week strip, the tanker readings and the photo viewer live.
 *
 * WHEN IT IS ON SCREEN
 * --------------------
 * ONLY while it is the dealer's turn. Never for "sent, waiting" — that is MDG's
 * backlog and a bar about it would be blaming them for our queue — and never
 * when nothing is owed, so on an ordinary day the app looks exactly as it did
 * before. A photograph already sitting in the offline queue counts as done: it
 * is subtracted in `outstandingRows`, because a bar telling a dealer to do a
 * thing they have just done gets answered by doing it twice.
 *
 * It also stays out of the way of the two screens that already show the same
 * chore in full — the ask list itself, and `/density`.
 *
 * IT DOES NOT HIDE WHEN THE KEYBOARD OPENS, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------
 * The TAB BAR hides (`AppShell.tsx`) because it is `fixed inset-x-0 bottom-0`
 * and would otherwise sit between the composer and the keyboard. A bar at the
 * TOP has no such conflict: it is in normal flow under the header, above a
 * `<main>` that clips and scrolls its own content. Hiding it would reflow the
 * message list on every keyboard open and close — the list would jump by 44px
 * each time the dealer tapped the composer.
 *
 * `shrink-0` IS LOAD-BEARING. In a conversation the frame is a fixed height
 * (`--vvh`) and a flex child that may shrink gets squeezed towards zero. This
 * repo has already shipped a sticky bar that crushed its neighbour to 0px and
 * broke its text one letter per line, so the rule in this column is that
 * anything added to it declares that it does not shrink.
 */
export function AskBar() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const dealerId = useAuthStore((s) => s.user?.dealerId);

  const { data } = useMyAsks();
  // Both of these must keep running even when this component draws nothing: the
  // socket is how a new ask reaches a phone that is already in a hand, and the
  // queue loop is the only thing that ever sends a photograph. A component that
  // returns null is still mounted and its hooks still run — which is exactly why
  // the bar decides its own visibility here rather than the shell deciding
  // whether to render it.
  useAskListSocket();
  useAskQueueSync();

  const items = useAskQueueStore((s) => s.items);
  const list = data ?? EMPTY_ASK_LIST;

  const queuedKeys = React.useMemo(() => queuedKeysFor(items, dealerId), [items, dealerId]);
  const outstanding = React.useMemo(
    () => outstandingRows(list.rows, queuedKeys),
    [list.rows, queuedKeys],
  );
  const face = askBarFace(outstanding);

  const capture = useAskCapture(list);

  // The two screens that already say all of this at full size. A bar pointing at
  // the page you are standing on is a tap that does nothing.
  const onAskList = Boolean(useMatch('/asks')) || Boolean(useMatch('/documents'));
  const onDensity = Boolean(useMatch('/density'));

  const onTap = () => {
    // Decided HERE, inside the tap, and not in a memo: when the answer is
    // "camera", `openCamera` clicks a file input, and a picker opened anywhere
    // but inside the gesture that asked for it is dropped by the Android System
    // WebView.
    const tap = askBarTap(outstanding, list.kinds);
    if (tap.action === 'camera') {
      capture.openCamera(tap.row);
      return;
    }
    navigate('/asks');
  };

  const show = face !== null && !onAskList && !onDensity;

  return (
    <>
      {show && face ? (
        <button
          type="button"
          onClick={onTap}
          // 44px exactly — the app's own minimum tap target, which
          // docs/STYLE_GUIDE_V2.md has always required.
          className="flex h-11 w-full shrink-0 items-center gap-2 bg-warning-strong px-4 text-left text-white active:bg-warning-strong/90"
        >
          {face.face === 'late' ? (
            <Clock3 width={18} strokeWidth={2} className="shrink-0" aria-hidden />
          ) : (
            <Camera width={18} strokeWidth={2} className="shrink-0" aria-hidden />
          )}
          {/* `truncate` rather than a wrap: the bar is one line by design, and
              Hindi runs about 35% longer than English — "आज के रजिस्टर का पन्ना
              भेजें" is 28 characters and only just fits a 360px screen. A
              second line here would push the message list down and reflow it. */}
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
            {barLabel(face, lang, list.today, t)}
          </span>
          <ChevronRight width={18} strokeWidth={2} className="shrink-0 opacity-80" aria-hidden />
        </button>
      ) : null}
      {/* Rendered even while the bar itself is hidden, so the confirm sheet does
          not vanish underneath the dealer at the exact moment their photograph
          is queued and the bar stops having anything to say. */}
      {capture.elements}
    </>
  );
}

/**
 * The bar's sentence, in the dealer's language.
 *
 * Pulled out of the component because it is the part worth reading twice: three
 * faces, one line each, and the LATE face has two spellings because a paper with
 * no period of its own (a fire NOC) has no day to name. Naming it by what it is
 * rather than printing an empty period is the difference between "फायर एनओसी
 * अभी बाकी है" and " का काग़ज़ बाकी है".
 */
function barLabel(
  face: NonNullable<ReturnType<typeof askBarFace>>,
  lang: 'en' | 'hi',
  today: string,
  t: ReturnType<typeof useT>,
): string {
  if (face.face === 'many') return t('asks.barMany', { n: face.count });

  const row = face.row;
  const name = pick(lang, row.titleEn, row.titleHi);
  if (face.face === 'one') return t('asks.barOne', { name });

  // Re-formatted here rather than printing the server's `periodLabel`, because
  // that string was built in the language stored on the ACCOUNT and the dealer
  // may have flipped the toggle on this device since. Same function, same IST
  // day — `documentPeriodLabel` from `shared` is the only thing in this app
  // allowed to turn a period into words.
  const period = documentPeriodLabel(row.periodKind, row.periodKey, lang, today);
  return period ? t('asks.barLatePeriod', { period }) : t('asks.barLateNamed', { name });
}

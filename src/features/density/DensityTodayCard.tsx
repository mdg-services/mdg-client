import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  ImageIcon,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, useToast } from '@/components/ui';
import {
  densityDayLabel,
  densityDue,
  densityWindow,
  useDensityMe,
} from '@/hooks/api/useDensity';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import { resolveFileType } from '@/lib/uploadAttachment';
import type { TtDensityMeView } from '@dk/shared/types';

import { DensityCaptureSheet } from './DensityCaptureSheet';

/**
 * The one thing the dealer owes today, as a card.
 *
 * It has three faces and never more than one primary button, because the whole
 * value of this screen is that a person under a canopy can see what to press
 * without reading: today's page is missing → take the photo; today is sent but
 * an earlier day is not → take that day's photo, with today's success stated
 * quietly; everything sent → say so and stop asking.
 *
 * The card also owns the camera, and that is deliberate. A file input must be
 * clicked inside the tap that opened it — a WebView drops a picker opened from
 * an effect — so the week strip reaches this same input through
 * {@link DensityTodayCardProps.captureRef} rather than mounting a second one.
 * Two inputs for two pickers, but only one pair in the tree.
 */
export interface DensityTodayCardProps {
  view: TtDensityMeView;
  /**
   * `pinned` is the copy that sits above the chat list: it renders nothing at
   * all once the dealer is up to date, and its "earlier days" line goes to the
   * full screen instead of assuming one is already open.
   */
  variant?: 'page' | 'pinned';
  /** Open a day's photo. Absent on the pinned copy, which has no viewer. */
  onViewPhoto?: (businessDate: string) => void;
  /**
   * Filled in by this card with "start the camera for this day", so the week
   * strip can call it synchronously from its own tap.
   */
  captureRef?: React.MutableRefObject<((businessDate: string) => void) | null>;
}

export function DensityTodayCard({
  view,
  variant = 'page',
  onViewPhoto,
  captureRef,
}: DensityTodayCardProps) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const navigate = useNavigate();

  const cameraRef = React.useRef<HTMLInputElement>(null);
  const galleryRef = React.useRef<HTMLInputElement>(null);
  const [pendingDate, setPendingDate] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);

  const days = React.useMemo(() => densityWindow(view), [view]);
  const due = React.useMemo(() => densityDue(view), [view]);

  const goToChat = React.useCallback(() => navigate('/chat'), [navigate]);

  const openPicker = React.useCallback(
    (businessDate: string, source: 'camera' | 'gallery') => {
      const day = days.find((d) => d.businessDate === businessDate);
      if (day && !day.markable) {
        // Reachable from a stale screen or an old notification, never from a
        // control this render offered. Say the rule and offer a person.
        toast.error(t('density.tooOld'), {
          action: { label: t('kavach.messageUs'), onClick: goToChat },
        });
        return;
      }
      setPendingDate(businessDate);
      const input = source === 'camera' ? cameraRef.current : galleryRef.current;
      input?.click();
    },
    [days, goToChat, t, toast],
  );

  // Hand the camera to the week strip. An effect rather than a render-time
  // assignment so a re-render of the page cannot leave the strip holding a
  // callback from a previous view.
  React.useEffect(() => {
    if (!captureRef) return;
    captureRef.current = (businessDate: string) =>
      openPicker(businessDate, 'camera');
    return () => {
      captureRef.current = null;
    };
  }, [captureRef, openPicker]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    // Reset first, or picking the same file twice never fires onChange again and
    // the dealer's second attempt does nothing at all.
    e.target.value = '';
    if (!picked) return;
    // Android camera captures arrive with an empty MIME, so the kind has to be
    // recovered before it can be judged; a genuine PDF or video is refused here
    // rather than by the presign.
    if (resolveFileType(picked, { assumeImage: true }).kind !== 'image') {
      toast.error(t('density.notAPhoto'));
      return;
    }
    setFile(picked);
  };

  const closeSheet = React.useCallback(() => {
    setFile(null);
    setPendingDate(null);
  }, []);

  // "Take again" drops the photo and reopens the camera for the SAME day, in
  // the same tap — closing the sheet and making the dealer find the button
  // again is the version that gets abandoned.
  const retake = React.useCallback(() => {
    setFile(null);
    cameraRef.current?.click();
  }, []);

  const inputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
    </>
  );

  const sheet =
    file && pendingDate ? (
      <DensityCaptureSheet
        file={file}
        businessDate={pendingDate}
        onClose={closeSheet}
        onRetake={retake}
        onSent={closeSheet}
      />
    ) : null;

  // Up to date. The pinned copy leaves the dealer's home screen alone; the page
  // says so plainly and offers the photo back.
  if (!due.anything) {
    if (variant === 'pinned') return null;
    return (
      <>
        <Shell tone="done">
          <Head
            tone="done"
            icon={<CheckCircle2 width={20} strokeWidth={2} />}
            title={t('density.doneTitle')}
            subtitle={densityDayLabel(lang, due.today.businessDate, 'full')}
          />
          <p className="mt-3 text-sm text-text-muted">{t('density.doneDesc')}</p>
          {onViewPhoto ? (
            <div className="mt-3">
              <Button
                variant="ghost"
                size="lg"
                fullWidth
                onClick={() => onViewPhoto(due.today.businessDate)}
              >
                {t('density.seePhoto')}
              </Button>
            </div>
          ) : null}
        </Shell>
        {inputs}
        {sheet}
      </>
    );
  }

  // Today first, always. Earlier days wait their turn as one quiet line — two
  // primary buttons on one card is how a dealer taps the wrong one.
  if (due.today.status === 'MISSING') {
    return (
      <>
        <Shell tone="todo">
          <Head
            tone="todo"
            icon={<Camera width={20} strokeWidth={1.75} />}
            title={t('density.todayTitle')}
            subtitle={densityDayLabel(lang, due.today.businessDate, 'full')}
          />
          <p className="mt-3 text-sm text-text-muted">{t('density.todayHint')}</p>
          <div className="mt-3 flex flex-col gap-2">
            <Button
              size="lg"
              fullWidth
              leftIcon={<Camera width={16} strokeWidth={2} />}
              onClick={() => openPicker(due.today.businessDate, 'camera')}
            >
              {t('density.takePhoto')}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              leftIcon={<ImageIcon width={16} strokeWidth={1.75} />}
              onClick={() => openPicker(due.today.businessDate, 'gallery')}
            >
              {t('density.chooseFromPhone')}
            </Button>
          </div>
          {due.missed.length > 0 ? (
            <EarlierDaysLine
              count={due.missed.length}
              onOpen={variant === 'pinned' ? () => navigate('/density') : null}
            />
          ) : null}
        </Shell>
        {inputs}
        {sheet}
      </>
    );
  }

  // Today is done and something older is not.
  const oldest = due.missed[0];
  if (!oldest) return null;
  return (
    <>
      <Shell tone="missed">
        <Head
          tone="missed"
          icon={<AlertTriangle width={20} strokeWidth={2} />}
          title={
            due.missed.length === 1
              ? t('density.missedOne')
              : t('density.missedMany', { n: due.missed.length })
          }
        />
        <p className="mt-3 text-sm text-text-muted">{t('density.missedDesc')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {due.missed.map((day) => (
            <button
              key={day.businessDate}
              type="button"
              onClick={() => openPicker(day.businessDate, 'camera')}
              className="inline-flex min-h-[44px] items-center rounded-full bg-warning-soft px-4 text-sm font-medium text-warning active:bg-warning-soft/70"
            >
              {densityDayLabel(lang, day.businessDate, 'chip')}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Button
            size="lg"
            fullWidth
            leftIcon={<Camera width={16} strokeWidth={2} />}
            onClick={() => openPicker(oldest.businessDate, 'camera')}
          >
            {t('density.takePhotoFor', {
              day: densityDayLabel(lang, oldest.businessDate, 'chip'),
            })}
          </Button>
        </div>
      </Shell>
      {inputs}
      {sheet}
    </>
  );
}

type Tone = 'todo' | 'done' | 'missed';

const TILE: Record<Tone, string> = {
  todo: 'bg-surface-2 text-text-muted',
  done: 'bg-success-soft text-success',
  missed: 'bg-warning-soft text-warning',
};

function Shell({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface p-4 shadow-sm',
        tone === 'missed' ? 'border-warning/40' : 'border-border',
      )}
    >
      {children}
    </div>
  );
}

function Head({
  tone,
  icon,
  title,
  subtitle,
}: {
  tone: Tone;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
          TILE[tone],
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-snug text-text">
          {title}
        </p>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The same card, pinned above the chat list.
 *
 * NOT MOUNTED ANY MORE. `AppShell` used to render this above the chat screens;
 * it now renders `features/asks/AskBar` in the same place, because the register
 * page has stopped being the only paper MDG asks a dealer for and two lines on
 * one screen both saying "send today's photo" is a worse screen than one — the
 * dealer has to work out whether they are the same chore before they can do
 * either. The bar covers the register page as one document kind among several.
 *
 * It is kept, rather than deleted, so `DensityTodayCard`'s two variants stay as
 * they shipped and `/density` is untouched. DO NOT RE-MOUNT IT app-wide: that
 * would put the register-page reminder back on the same screen as the ask bar,
 * which is the thing the swap was for.
 *
 * Chat was the right shelf for it while it existed — it is where the dealer
 * lands when they open the app, and the Reports shelf is where MDG puts things
 * it sends TO the dealer, not things the dealer does. It rendered nothing while
 * the payload was loading, nothing if the service was not on for this pump, and
 * nothing once the register was up to date.
 */
export function DensityChatPin() {
  const { data } = useDensityMe();
  // The gate is repeated here rather than left to the card: the card returning
  // null inside a padded wrapper would leave a strip of empty space at the top
  // of every dealer's chat list on every day they are up to date.
  if (!data?.attached || !densityDue(data).anything) return null;
  return (
    <div className="px-4 pt-3">
      <DensityTodayCard view={data} variant="pinned" />
    </div>
  );
}

/** The quiet second job, never a second primary button. */
function EarlierDaysLine({
  count,
  onOpen,
}: {
  count: number;
  onOpen: (() => void) | null;
}) {
  const t = useT();
  const label = t('density.earlierDays', { n: count });
  if (!onOpen) {
    return <p className="mt-3 px-1 text-xs text-text-muted">{label}</p>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-3 flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-1 text-left text-xs text-text-muted active:bg-surface-2"
    >
      {label}
      <ChevronRight width={16} strokeWidth={1.75} className="shrink-0" />
    </button>
  );
}

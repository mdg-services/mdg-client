import { Camera, Check, ChevronDown, ChevronUp, Image as ImageIcon, Send } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import type { MockDrillAnswer } from '@dk/shared/schemas';
import type {
  MockDrillPhotoView,
  MockDrillScenarioOption,
  MockDrillStep,
  MockDrillView,
} from '@dk/shared/types';

import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../DuOtpSteps';

import { dependentOf, drillDay, photoInSlot, scenarioName, splitScenarios } from './mockDrillView';

/**
 * The one input the Mock Drill box asks for at a time (ADR 0034). Each step is its
 * own small component; the box picks the one the open submission's `step` names and
 * gives it two ways to answer: `onAnswer` for a plain answer and `onPhoto` for a
 * file. Neither returns anything: the box owns the request, the busy flag and the
 * error words, and the server's reply (the whole fresh view) is what moves the box
 * to the next step.
 */

export interface StepProps {
  view: MockDrillView;
  /** An answer or an upload is on its way: every control is off. */
  busy: boolean;
  /** The slot whose file is on its way, if one is. */
  uploadingSlot: 1 | 2 | null;
  onAnswer: (body: MockDrillAnswer) => void;
  onPhoto: (slot: 1 | 2, file: File) => void;
}

export const STEP_TITLE_KEY = {
  scenario: 'chat.mockDrillStepScenario',
  photos: 'chat.mockDrillStepPhotos',
  when: 'chat.mockDrillStepWhen',
  review: 'chat.mockDrillStepReview',
  choose: 'chat.mockDrillChooseTitle',
} as const satisfies Record<MockDrillStep, string>;

/** A scenario's name: the portal's own English words, and the Hindi gloss under them when there is one. */
function ScenarioText({
  id,
  label,
  scenarios,
  strong = false,
}: {
  id: string;
  label: string;
  scenarios: readonly MockDrillScenarioOption[];
  strong?: boolean;
}) {
  const lang = useLang();
  const name = scenarioName(id, label, scenarios);
  return (
    <span className="min-w-0 break-words">
      <span className={cn('block text-[14px] leading-snug', strong && 'font-medium')}>
        {name.label}
      </span>
      {lang === 'hi' && name.gloss ? (
        <span className="block text-[12px] leading-snug text-wa-meta">{name.gloss}</span>
      ) : null}
    </span>
  );
}

/** One row of the open dropdown. */
function ScenarioOption({
  option,
  selected,
  busy,
  scenarios,
  onPick,
}: {
  option: MockDrillScenarioOption;
  selected: boolean;
  busy: boolean;
  scenarios: readonly MockDrillScenarioOption[];
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={busy}
      onClick={() => onPick(option.id)}
      className={cn(
        'flex min-h-11 w-full items-center gap-2 border-b border-wa-divider px-2.5 py-1.5 text-left last:border-b-0 active:bg-wa-row-active disabled:opacity-60',
        selected && 'bg-wa-row-active',
      )}
    >
      <ScenarioText id={option.id} label={option.label} scenarios={scenarios} />
      {selected ? (
        <Check width={16} strokeWidth={2.5} className="ml-auto shrink-0 text-success" aria-hidden />
      ) : null}
    </button>
  );
}

/**
 * The scenario: a dropdown opened inside the chat. The ones an outlet really
 * practises are listed first; a small "और विकल्प" opens the rest. Picking one
 * answers at once.
 */
function ScenarioStep({ view, busy, onAnswer }: StepProps) {
  const t = useT();
  const { common, more } = splitScenarios(view.scenarios);
  const dependent = dependentOf(view);
  const current = view.open?.dependent?.scenarioId ?? null;
  const [listOpen, setListOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(() => more.some((s) => s.id === current));

  const pick = (scenarioId: string) => {
    setListOpen(false);
    onAnswer({ step: 'scenario', scenarioId });
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={listOpen}
        disabled={busy}
        onClick={() => setListOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-wa-divider bg-wa-in px-2.5 py-1.5 text-left text-[15px] disabled:opacity-60"
      >
        {current && dependent ? (
          <ScenarioText id={current} label={dependent.scenarioLabel} scenarios={view.scenarios} />
        ) : (
          <span className="min-w-0 break-words text-wa-meta">{t('chat.mockDrillPick')}</span>
        )}
        {busy ? (
          <Spinner size={16} />
        ) : listOpen ? (
          <ChevronUp width={18} strokeWidth={2} className="shrink-0 text-wa-meta" aria-hidden />
        ) : (
          <ChevronDown width={18} strokeWidth={2} className="shrink-0 text-wa-meta" aria-hidden />
        )}
      </button>

      {listOpen ? (
        <div className="max-h-72 overflow-y-auto overscroll-contain rounded-md border border-wa-divider bg-wa-in">
          <div role="listbox" aria-label={t('chat.mockDrillListLabel')}>
            {common.map((s) => (
              <ScenarioOption
                key={s.id}
                option={s}
                selected={s.id === current}
                busy={busy}
                scenarios={view.scenarios}
                onPick={pick}
              />
            ))}
          </div>
          {more.length > 0 ? (
            <>
              <button
                type="button"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
                className="flex min-h-11 w-full items-center justify-between gap-2 border-t border-wa-divider px-2.5 py-1.5 text-left text-[14px] font-medium text-wa-accent-strong active:bg-wa-row-active"
              >
                {moreOpen ? t('chat.mockDrillFewer') : t('chat.mockDrillMore')}
                {moreOpen ? (
                  <ChevronUp width={16} strokeWidth={2} aria-hidden />
                ) : (
                  <ChevronDown width={16} strokeWidth={2} aria-hidden />
                )}
              </button>
              {moreOpen ? (
                <div role="listbox" aria-label={t('chat.mockDrillMore')}>
                  {more.map((s) => (
                    <ScenarioOption
                      key={s.id}
                      option={s}
                      selected={s.id === current}
                      busy={busy}
                      scenarios={view.scenarios}
                      onPick={pick}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A photo's thumbnail, openable full size through its short-lived link. */
function PhotoThumb({ photo, label }: { photo: MockDrillPhotoView | null; label: string }) {
  const box =
    'flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-wa-chip';
  if (photo?.url) {
    return (
      <a href={photo.url} target="_blank" rel="noopener noreferrer" className={box}>
        <img src={photo.url} alt={label} loading="lazy" className="h-full w-full object-cover" />
      </a>
    );
  }
  return (
    <span className={box} role="img" aria-label={label}>
      <ImageIcon width={22} strokeWidth={1.5} className="text-wa-meta" aria-hidden />
    </span>
  );
}

/**
 * One photo slot. The file input sits inside its label, so the phone's own chooser
 * (camera, gallery) opens from the owner's tap on the label, which an Android
 * WebView allows; it is cleared after each pick so the same file can be chosen
 * again after a refusal.
 */
function PhotoSlot({
  slot,
  photo,
  disabled,
  uploading,
  hint,
  onPhoto,
}: {
  slot: 1 | 2;
  photo: MockDrillPhotoView | null;
  disabled: boolean;
  uploading: boolean;
  hint: string | null;
  onPhoto: (slot: 1 | 2, file: File) => void;
}) {
  const t = useT();
  const label = t('chat.mockDrillPhotoN', { n: slot });
  return (
    <div data-photo-slot={slot} className="flex items-center gap-2.5">
      <PhotoThumb photo={photo} label={label} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-1.5 text-[14px] font-medium leading-snug">
          {label}
          {photo && !uploading ? (
            <span className="flex items-center gap-1 text-[12px] font-normal text-wa-meta">
              <Check width={13} strokeWidth={2.5} className="text-success" aria-hidden />
              {t('chat.mockDrillPhotoAdded')}
            </span>
          ) : null}
        </p>
        <label
          className={cn(
            SECONDARY_BUTTON,
            'cursor-pointer focus-within:ring-2 focus-within:ring-focus-ring',
            disabled && 'pointer-events-none opacity-60',
          )}
        >
          {uploading ? (
            <Spinner size={16} />
          ) : (
            <Camera width={16} strokeWidth={2} className="shrink-0" aria-hidden />
          )}
          <span className="min-w-0 break-words">
            {uploading
              ? t('chat.mockDrillUploading')
              : photo
                ? t('chat.mockDrillPhotoReplace')
                : t('chat.mockDrillPhotoTake')}
          </span>
          <input
            type="file"
            accept="image/*"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // So choosing the same file again (after a refusal) fires a change.
              e.target.value = '';
              if (file) onPhoto(slot, file);
            }}
            className="sr-only"
          />
        </label>
        {hint ? <p className="text-[12px] leading-snug text-wa-meta">{hint}</p> : null}
      </div>
    </div>
  );
}

/**
 * The two photos. The second is asked for after the first: the server keeps the
 * photos in the order they came, so slot 2 never lands where slot 1 should be.
 */
function PhotosStep({ view, busy, uploadingSlot, onPhoto }: StepProps) {
  const t = useT();
  const dependent = dependentOf(view);
  const first = photoInSlot(dependent, 1);
  const second = photoInSlot(dependent, 2);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-snug text-wa-meta">{t('chat.mockDrillPhotosHint')}</p>
      <PhotoSlot
        slot={1}
        photo={first}
        disabled={busy}
        uploading={uploadingSlot === 1}
        hint={null}
        onPhoto={onPhoto}
      />
      <PhotoSlot
        slot={2}
        photo={second}
        disabled={busy || !first}
        uploading={uploadingSlot === 2}
        hint={first ? null : t('chat.mockDrillPhotoFirst')}
        onPhoto={onPhoto}
      />
    </div>
  );
}

/**
 * Which day the drill was. The tap is the owner's word that the drill really
 * happened (the server refuses to file without it), so the line above the buttons
 * says so in plain words.
 */
function WhenStep({ busy, onAnswer }: StepProps) {
  const t = useT();
  const say = (day: 'today' | 'yesterday') => onAnswer({ step: 'when', day, confirmDone: true });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] leading-snug text-wa-meta">{t('chat.mockDrillWhenHint')}</p>
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => say('today')}
        className={PRIMARY_BUTTON}
      >
        {t('chat.mockDrillToday')}
      </button>
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => say('yesterday')}
        className={PRIMARY_BUTTON}
      >
        {t('chat.mockDrillYesterday')}
      </button>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-wa-divider py-1.5 last:border-b-0">
      <p className="text-[12px] leading-tight text-wa-meta">{label}</p>
      <div className="mt-0.5 break-words text-[14px] leading-snug">{children}</div>
    </div>
  );
}

/** The review: what was given, and the one button that sends it. */
function ReviewStep({ view, busy, onAnswer }: StepProps) {
  const t = useT();
  const dependent = dependentOf(view);
  const day = drillDay(view);
  const checked = view.open?.mode !== 'same';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <ReviewRow label={t('chat.mockDrillLblScenario')}>
          {dependent ? (
            <ScenarioText
              id={dependent.scenarioId}
              label={dependent.scenarioLabel}
              scenarios={view.scenarios}
            />
          ) : (
            '—'
          )}
        </ReviewRow>
        <ReviewRow label={t('chat.mockDrillLblPhotos')}>
          <div className="flex gap-2">
            {([1, 2] as const).map((slot) => (
              <PhotoThumb
                key={slot}
                photo={photoInSlot(dependent, slot)}
                label={t('chat.mockDrillPhotoN', { n: slot })}
              />
            ))}
          </div>
        </ReviewRow>
        <ReviewRow label={t('chat.mockDrillLblDay')}>{day ?? '—'}</ReviewRow>
      </div>
      <p className="text-[13px] leading-snug text-wa-meta">
        {checked ? t('chat.mockDrillSendChecked') : t('chat.mockDrillSendDirect')}
      </p>
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => onAnswer({ step: 'submit' })}
        className={PRIMARY_BUTTON}
      >
        {busy ? (
          <Spinner size={16} />
        ) : (
          <Send width={16} strokeWidth={2} className="shrink-0" aria-hidden />
        )}
        {t('chat.mockDrillSend')}
      </button>
    </div>
  );
}

/** The step an open submission is on: its header and its one input. */
export function CollectingStep(props: StepProps & { step: MockDrillStep }) {
  const t = useT();
  const { step } = props;
  return (
    <div data-mock-step={step} className="mt-2 flex flex-col gap-2">
      <p className="text-[15px] font-medium leading-snug">{t(STEP_TITLE_KEY[step])}</p>
      {step === 'scenario' ? <ScenarioStep {...props} /> : null}
      {step === 'photos' ? <PhotosStep {...props} /> : null}
      {step === 'when' ? <WhenStep {...props} /> : null}
      {step === 'review' ? <ReviewStep {...props} /> : null}
    </div>
  );
}

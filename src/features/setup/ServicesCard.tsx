import { Play } from 'lucide-react';
import * as React from 'react';

import { ApiError } from '@/lib/api';
import { pick, useLang, useT } from '@/lib/i18n';
import { SERVICE_ABOUT, SERVICE_LABELS } from '@dk/shared';
import type { OutletSetupView, SetupServiceId } from '@dk/shared/types';

import { Alert, Block, CardBox, LinkButton, Note, SaveButton } from './CardParts';
import { dependentsOf, toggleService } from './cardView';
import { SERVICE_VIDEO } from './serviceVideos';
import { useSaveSetupServices } from './useOutletSetup';

/** A service's name in the reader's language. */
function useServiceName() {
  const lang = useLang();
  return React.useCallback(
    (id: string): string => {
      const label = SERVICE_LABELS[id];
      return label ? pick(lang, label.en, label.hi) : id;
    },
    [lang],
  );
}

/**
 * The services card: "which services would you like?"
 *
 * One checkbox row per service, in the order the server lists them, each with
 * its one-line description and — once a video exists for it — a ▶ beside it.
 * Ticking a service ticks what it needs too, and says so on the row that was
 * brought along; that row cannot be unticked while the service that needs it is
 * ticked. Saving shows the chosen list with "Change" until the bill is sent, after
 * which a change goes through the chat.
 *
 * It draws from the live view, never from the message that carries it, and a
 * manager sees the same card read-only.
 */
export function ServicesCard({
  view,
  videos = SERVICE_VIDEO,
}: {
  view: OutletSetupView;
  /** Service id → where its video plays from. Only a service with one gets a ▶. */
  videos?: Readonly<Partial<Record<SetupServiceId, string>>>;
}) {
  const t = useT();
  const nameOf = useServiceName();
  const lang = useLang();
  const save = useSaveSetupServices();
  const { options, chosen, locked } = view.services;
  const chosenKey = chosen.join(',');

  const [ticked, setTicked] = React.useState<SetupServiceId[]>(chosen);
  // Set by "Change". With nothing chosen yet the form is simply what there is.
  const [editing, setEditing] = React.useState(false);
  const [playing, setPlaying] = React.useState<SetupServiceId | null>(null);
  const [lockedByServer, setLockedByServer] = React.useState(false);

  // What is saved follows the server (another phone, MDG's team) — unless the
  // owner is in the middle of ticking, whose work is not thrown away.
  React.useEffect(() => {
    if (!editing) setTicked(chosen);
    // `chosenKey` stands for `chosen`: the array itself is new on every fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenKey, editing]);

  const canChange = view.canEdit && !locked;
  const showForm = canChange && (editing || chosen.length === 0);

  if (!showForm) {
    // Nothing chosen and nobody here may choose (a manager): say who does.
    if (chosen.length === 0) {
      return (
        <CardBox kind="services">
          <Note>{t('setup.ownerFills')}</Note>
        </CardBox>
      );
    }
    return (
      <CardBox kind="services">
        <Block>
          <p className="text-[14px] font-medium leading-snug">{t('setup.servicesChosen')}</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[14px] leading-snug">
            {chosen.map((id) => (
              <li key={id}>{nameOf(id)}</li>
            ))}
          </ul>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            {locked ? <Note>{t('setup.servicesLocked')}</Note> : <span />}
            {canChange ? (
              <LinkButton
                onClick={() => {
                  setLockedByServer(false);
                  save.reset();
                  setEditing(true);
                }}
              >
                {t('setup.change')}
              </LinkButton>
            ) : null}
          </div>
        </Block>
      </CardBox>
    );
  }

  const busy = save.isPending;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || ticked.length === 0) return;
    setLockedByServer(false);
    try {
      await save.mutateAsync(ticked);
      setEditing(false);
    } catch (err) {
      // 409: the bill was sent while this was open, so it is locked now.
      if (err instanceof ApiError && err.status === 409) setLockedByServer(true);
    }
  };

  return (
    <CardBox kind="services">
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-1.5">
        <ul className="flex flex-col gap-1.5">
          {options.map((o) => {
            const on = ticked.includes(o.id);
            const needers = dependentsOf(options, ticked, o.id);
            const about = SERVICE_ABOUT[o.id];
            const video = videos[o.id];
            return (
              <li key={o.id} data-service={o.id}>
                <Block className="flex items-start gap-1">
                  <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-2.5 py-1">
                    <input
                      type="checkbox"
                      checked={on}
                      // Needed by a ticked service: it stays until that one is unticked.
                      disabled={busy || needers.length > 0}
                      onChange={() => setTicked((cur) => toggleService(options, cur, o.id))}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-wa-accent"
                    />
                    <span className="min-w-0">
                      <span className="block break-words text-[14px] font-medium leading-snug">
                        {nameOf(o.id)}
                      </span>
                      {about ? (
                        <span className="block text-[13px] leading-snug text-wa-meta">
                          {pick(lang, about.en, about.hi)}
                        </span>
                      ) : null}
                      {needers.length > 0 ? (
                        <span className="mt-0.5 block text-[12px] font-medium leading-snug text-wa-bubble-text">
                          {t('setup.requiredWith', { name: needers.map(nameOf).join(', ') })}
                        </span>
                      ) : null}
                    </span>
                  </label>
                  {video ? (
                    <button
                      type="button"
                      onClick={() => setPlaying((cur) => (cur === o.id ? null : o.id))}
                      aria-label={t('setup.playVideo', { name: nameOf(o.id) })}
                      aria-pressed={playing === o.id}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-wa-accent-strong active:bg-black/10"
                    >
                      <Play width={18} strokeWidth={2} aria-hidden />
                    </button>
                  ) : null}
                </Block>
                {video && playing === o.id ? (
                  <video
                    src={video}
                    controls
                    autoPlay
                    playsInline
                    preload="none"
                    className="mt-1 w-full rounded-md bg-black"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>

        {lockedByServer ? (
          <Alert>{t('setup.servicesLocked')}</Alert>
        ) : save.isError ? (
          <Alert>{t('setup.saveFailed')}</Alert>
        ) : null}

        <SaveButton busy={busy} disabled={ticked.length === 0}>
          {t('setup.servicesSave')}
        </SaveButton>
        {ticked.length === 0 ? <Note>{t('setup.servicesPickOne')}</Note> : null}
        {chosen.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setTicked(chosen);
              setEditing(false);
            }}
            className="flex h-11 w-full items-center justify-center rounded-lg text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
          >
            {t('common.cancel')}
          </button>
        ) : null}
      </form>
    </CardBox>
  );
}

import { Camera, FileText, Image as ImageIcon } from 'lucide-react';
import * as React from 'react';

import { useT, type MessageKey } from '@/lib/i18n';
import { useBackToClose } from '@/lib/useBackToClose';

export type AttachChoice = 'document' | 'camera' | 'gallery';

/**
 * Three round coloured buttons on a card over the composer — WhatsApp's attach
 * menu, so "the paperclip" means to a dealer here what it means in the app they
 * already use all day. Colours are the app's own tokens (blue, red, green), one
 * per choice, so the three read apart at a glance.
 *
 * It only CHOOSES. The file inputs live in the composer, which stays mounted
 * when this goes away: a picker opened from an element that is unmounted in the
 * same tap can lose its result on an Android WebView.
 */
const CHOICES: {
  choice: AttachChoice;
  labelKey: MessageKey;
  tone: string;
  Icon: typeof Camera;
}[] = [
  { choice: 'document', labelKey: 'composer.attachDocument', tone: 'bg-info', Icon: FileText },
  { choice: 'camera', labelKey: 'composer.attachCamera', tone: 'bg-danger', Icon: Camera },
  { choice: 'gallery', labelKey: 'composer.attachGallery', tone: 'bg-wa-accent', Icon: ImageIcon },
];

export function AttachSheet({
  onClose,
  onChoose,
}: {
  onClose: () => void;
  onChoose: (choice: AttachChoice) => void;
}) {
  const t = useT();
  // The phone's Back button closes the card, not the chat behind it.
  useBackToClose(onClose);

  return (
    <div
      role="dialog"
      aria-label={t('composer.attach')}
      data-no-swipe
      className="fixed inset-0 z-50 flex flex-col justify-end"
    >
      <button
        type="button"
        aria-label={t('common.dismiss')}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-wa-viewer opacity-25"
      />
      <div className="safe-bottom relative mx-auto w-full max-w-md px-3">
        <div className="grid grid-cols-3 gap-y-4 rounded-2xl bg-wa-chip px-4 py-5 shadow-lg animate-in">
          {CHOICES.map(({ choice, labelKey, tone, Icon }) => (
            <button
              key={choice}
              type="button"
              onClick={() => onChoose(choice)}
              className="flex flex-col items-center gap-2 active:opacity-70"
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full text-text-inverse ${tone}`}
              >
                <Icon width={26} strokeWidth={1.75} />
              </span>
              <span className="text-[13px] text-wa-chip-text">{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

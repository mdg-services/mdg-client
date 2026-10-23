import { Check } from 'lucide-react';

import { useT } from '@/lib/i18n';

import { Block, CardBox } from './CardParts';

/** "Your services have started": a small done note, nothing to press. */
export function StartedCard() {
  const t = useT();
  return (
    <CardBox kind="started">
      <Block>
        <p className="flex items-center gap-1.5 text-[14px] font-medium leading-snug">
          <Check width={14} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
          {t('setup.started')}
        </p>
      </Block>
    </CardBox>
  );
}

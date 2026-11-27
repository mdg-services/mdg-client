import { Copy } from 'lucide-react';
import type { ReactElement } from 'react';

import { cn } from '@/lib/cn';
import type { Lang } from '@/store/lang';
import type { TankerDensityData } from '@dk/shared/types';

import type { KindView, OverlayProps, ReportAction, ReportActionContext, Words } from '../types';

import { clockWords, dayWords, fill, fuelName, leadingFor, num, say, shareLines, spokenDigits } from './_fmtTankerMoney';
import { CopyButton, FactPill, FuelTitle, IconNote, Lead, NumberPlate, PLATE_INK, PLATE_YELLOW } from './_partsTankerMoney';

/**
 * Tanker density (ADR 0056): a yellow number plate and ENORMOUS digits.
 *
 * The dealer's only job here is to write the density into the statutory register, so the
 * screen is nearly empty except the number. Digits are shown exactly as IndianOil printed
 * them ("820.500" stays "820.500"), no unit is added (the invoice states none) and no
 * verdict colour ever appears: the app has no allowed range to judge by.
 */

const T = {
  lead: {
    hi: 'टैंकर {v} आया है। नीचे की डेंसिटी अपने रजिस्टर में लिख लें।',
    hl: 'Tanker {v} aaya hai. Neeche ki density apne register mein likh lein.',
    en: 'Tanker {v} has come. Write the density below in your register.',
  },
  leadNoVehicle: {
    hi: 'टैंकर आया है। नीचे की डेंसिटी अपने रजिस्टर में लिख लें।',
    hl: 'Tanker aaya hai. Neeche ki density apne register mein likh lein.',
    en: 'A tanker has come. Write the density below in your register.',
  },
  leadNone: {
    hi: 'इस बिल पर डेंसिटी पढ़ी नहीं जा सकी। IndianOil का बिल देख लें।',
    hl: 'Is bill par density padhi nahi ja saki. IndianOil ka bill dekh lein.',
    en: 'We could not read a density on this invoice. Please look at the IndianOil invoice.',
  },
  plateLabel: { hi: 'टैंकर नंबर', hl: 'Tanker number', en: 'Tanker number' },
  plateEmpty: {
    hi: 'बिल पर टैंकर नंबर नहीं है',
    hl: 'Bill par tanker number nahi hai',
    en: 'Tanker number is not on the invoice',
  },
  register: { hi: 'अपने रजिस्टर में यह लिखें', hl: 'Apne register mein yeh likhein', en: 'Write this in your register' },
  density: { hi: 'डेंसिटी', hl: 'Density', en: 'Density' },
  quantity: { hi: 'मात्रा', hl: 'Matra', en: 'Quantity' },
  tank: { hi: 'टंकी', hl: 'Tanki', en: 'Tank' },
  copyAll: { hi: 'सब कॉपी करें', hl: 'Sab copy karein', en: 'Copy all' },
  copyDensity: { hi: 'डेंसिटी कॉपी करें', hl: 'Density copy karein', en: 'Copy density' },
  copied: { hi: 'कॉपी हो गया', hl: 'Copy ho gaya', en: 'Copied' },
  copyFailed: {
    hi: 'कॉपी नहीं हुआ। नंबर को दबाकर रखें और कॉपी करें।',
    hl: 'Copy nahi hua. Number ko dabaakar rakhein aur copy karein.',
    en: 'Could not copy. Press and hold the number to copy it.',
  },
  invoice: { hi: 'IndianOil बिल', hl: 'IndianOil bill', en: 'IndianOil invoice' },
  invoiceNo: { hi: 'बिल नंबर', hl: 'Bill number', en: 'Invoice number' },
  footer: {
    hi: 'यह IndianOil के बिल से लिया गया है। हम यहाँ कुछ जाँचते नहीं।',
    hl: 'Yeh IndianOil ke bill se liya gaya hai. Hum yahan kuch jaanchte nahi.',
    en: 'From the IndianOil invoice. We check nothing here.',
  },
  more: {
    hi: '{n} और लाइन बिल पर हैं',
    hl: '{n} aur line bill par hain',
    en: '{n} more lines on the invoice',
  },
  moreOne: {
    hi: '1 और लाइन बिल पर है',
    hl: '1 aur line bill par hai',
    en: '1 more line on the invoice',
  },
  title: { hi: 'टैंकर डेंसिटी', hl: 'Tanker density', en: 'Tanker density' },
  fromInvoice: { hi: 'IndianOil बिल से।', hl: 'IndianOil bill se.', en: 'From the IndianOil invoice.' },
} satisfies Record<string, Words>;

const QTY_UNIT_FALLBACK = 'KL';

/** The lines that have a readable density: a line with none is never drawn. */
export function readableLines(data: TankerDensityData): TankerDensityData['lines'] {
  return data.lines.filter((l) => (l.density15Raw ?? '').trim() !== '');
}

function vehicleOf(data: TankerDensityData): string {
  return (data.vehicleNo ?? '').trim();
}

function lineLabel(line: TankerDensityData['lines'][number], lang: Lang): string {
  return fuelName(line.productKey, lang) || line.productKey || '';
}

function quantityText(line: TankerDensityData['lines'][number]): string | null {
  if (line.quantity === null || line.quantity === undefined) return null;
  return `${num(line.quantity, 3)} ${line.unit?.trim() || QTY_UNIT_FALLBACK}`;
}

/** The text one Copy button puts on the clipboard for a set of lines: label then digits as printed. */
export function copyAllText(data: TankerDensityData, lang: Lang): string {
  return readableLines(data)
    .map((l) => `${lineLabel(l, lang)} ${l.density15Raw.trim()}`)
    .join('\n');
}

function invoiceStamp(data: TankerDensityData, lang: Lang): string {
  const day = dayWords(data.invoiceDate, lang);
  const time = clockWords(data.invoiceTime, lang);
  return [day, time].filter(Boolean).join(', ');
}

function DensityBlock({ line, lang }: { line: TankerDensityData['lines'][number]; lang: Lang }): ReactElement {
  const raw = line.density15Raw.trim();
  const qty = quantityText(line);
  return (
    <section
      data-testid="density-block"
      data-product={line.productKey}
      className="rounded-xl border border-border-strong bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FuelTitle productKey={line.productKey} lang={lang} fallback={line.family === 'UNKNOWN' ? undefined : line.family} />
      </div>
      {qty || line.tankNo ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {qty ? (
            <FactPill>
              {say(T.quantity, lang)} {qty}
            </FactPill>
          ) : null}
          {line.tankNo ? (
            <FactPill>
              {say(T.tank, lang)} {line.tankNo}
            </FactPill>
          ) : null}
        </div>
      ) : null}
      <p className={cn('mt-3 text-subheading text-text-muted', leadingFor(lang))}>{say(T.density, lang)}</p>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <p className="min-w-0">
          <span
            data-testid="density-digits"
            aria-hidden="true"
            className="block select-all break-all font-mono text-[clamp(2.5rem,15vw,3.5rem)] font-semibold leading-none tracking-tight text-text"
          >
            {raw}
          </span>
          <span className="sr-only">{spokenDigits(raw, lang)}</span>
        </p>
        <CopyButton text={raw} lang={lang} describe={`${say({ hi: 'कॉपी करें', hl: 'Copy karein', en: 'Copy' }, lang)} ${lineLabel(line, lang)} ${spokenDigits(raw, lang)}`} />
      </div>
    </section>
  );
}

export function Overlay({ data, lang }: OverlayProps<'tanker_density'>): ReactElement {
  const lines = readableLines(data);
  const v = vehicleOf(data);
  const lead = lines.length === 0 ? say(T.leadNone, lang) : v ? fill(T.lead, lang, { v }) : say(T.leadNoVehicle, lang);
  const hidden = Math.max(0, data.droppedLines ?? 0);
  const stamp = invoiceStamp(data, lang);
  return (
    <div data-kind-view="tanker_density" className="space-y-4 p-4">
      <Lead lang={lang}>{lead}</Lead>
      <NumberPlate text={v} lang={lang} emptyWords={T.plateEmpty} label={T.plateLabel} />
      {lines.length > 0 ? (
        <>
          <p className={cn('text-heading text-text', leadingFor(lang))}>{say(T.register, lang)}</p>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <DensityBlock key={`${line.productKey}-${line.tankNo ?? ''}-${i}`} line={line} lang={lang} />
            ))}
          </div>
          {lines.length > 1 ? (
            <CopyButton
              text={copyAllText(data, lang)}
              lang={lang}
              idleWords={T.copyAll}
              className="w-full"
            />
          ) : null}
        </>
      ) : null}
      {hidden > 0 ? (
        <p className={cn('text-body text-text-muted', leadingFor(lang))}>
          {hidden === 1 ? say(T.moreOne, lang) : fill(T.more, lang, { n: String(hidden) })}
        </p>
      ) : null}
      <ul className="space-y-2 border-t border-border pt-3">
        <IconNote lang={lang} icon={<span className="inline-block h-4 w-6 rounded-sm border-2" style={{ backgroundColor: PLATE_YELLOW, borderColor: PLATE_INK }} />}>
          {say(T.invoice, lang)}
          {stamp ? `: ${stamp}` : ''}
          {data.invoiceNo ? (
            <>
              <br />
              <span className="text-text-muted">{say(T.invoiceNo, lang)} </span>
              <span className="select-all break-all font-mono font-semibold">{data.invoiceNo}</span>
            </>
          ) : null}
        </IconNote>
      </ul>
      <p className={cn('text-body text-text-muted', leadingFor(lang))}>{say(T.footer, lang)}</p>
    </div>
  );
}

/** 40 x 28 mini: a yellow plate with five characters, the same shape the overlay opens with. */
export function Glyph({ size = 28 }: { size?: number }): ReactElement {
  const width = Math.round((size * 40) / 28);
  return (
    <svg width={width} height={size} viewBox="0 0 40 28" aria-hidden="true" focusable="false">
      <rect x="2.5" y="6.5" width="35" height="15" rx="3.5" fill={PLATE_YELLOW} stroke={PLATE_INK} strokeWidth="2" />
      <circle cx="6.5" cy="14" r="1" fill={PLATE_INK} fillOpacity="0.6" />
      <circle cx="33.5" cy="14" r="1" fill={PLATE_INK} fillOpacity="0.6" />
      {[11, 15.5, 20, 24.5, 29].map((x) => (
        <rect key={x} x={x - 1.4} y="10" width="2.8" height="8" rx="0.8" fill={PLATE_INK} />
      ))}
    </svg>
  );
}

function headline(data: TankerDensityData, lang: Lang): string {
  const lines = readableLines(data);
  const v = vehicleOf(data);
  const name = say(T.title, lang);
  if (lines.length === 0) return v ? `${name}: ${v}` : name;
  const first = lines[0]!.density15Raw.trim();
  const more = lines.length > 1 ? ` (+${lines.length - 1})` : '';
  const who = v ? `${say({ hi: 'टैंकर', hl: 'Tanker', en: 'Tanker' }, lang)} ${v}: ` : '';
  return `${who}${say(T.density, lang)} ${first}${more}`;
}

/**
 * The pinned button: copy the density of EVERY fuel on the invoice as plain text, to paste in the
 * register or an IndianOil form. One fuel reads "Copy density", several read "Copy all".
 */
function actions(data: TankerDensityData, _report: unknown, ctx: ReportActionContext): ReportAction[] {
  const lines = readableLines(data);
  if (lines.length === 0) return [];
  return [
    {
      id: 'copy-density',
      icon: Copy,
      label: lines.length > 1 ? T.copyAll : T.copyDensity,
      run: async () => {
        if (await ctx.copy(copyAllText(data, ctx.lang))) ctx.toast.success(say(T.copied, ctx.lang));
        else ctx.toast.error(say(T.copyFailed, ctx.lang));
      },
    },
  ];
}

function share(data: TankerDensityData, lang: Lang): string {
  const lines = readableLines(data);
  const v = vehicleOf(data);
  const stamp = invoiceStamp(data, lang);
  return shareLines([
    say(T.title, lang),
    v && `${say(T.plateLabel, lang)}: ${v}`,
    (stamp || data.invoiceNo) && `${say(T.invoice, lang)}${data.invoiceNo ? ` ${data.invoiceNo}` : ''}${stamp ? `, ${stamp}` : ''}`,
    ...lines.map((l) => {
      const facts = [quantityText(l), l.tankNo ? `${say(T.tank, lang)} ${l.tankNo}` : null].filter(Boolean).join(', ');
      const name = lineLabel(l, lang);
      const key = l.productKey && name !== l.productKey ? ` (${l.productKey})` : '';
      return `${name}${key}: ${l.density15Raw.trim()}${facts ? ` (${facts})` : ''}`;
    }),
    say(T.fromInvoice, lang),
  ]);
}

export const view: KindView<'tanker_density'> = {
  kind: 'tanker_density',
  Overlay,
  Glyph,
  // Not a Today tile and nothing to flag: a density judges nothing (it is "info", copied by hand).
  tile: () => null,
  alert: () => null,
  headline,
  share,
  actions,
};

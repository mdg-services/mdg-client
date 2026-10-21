/**
 * WhatsApp links we can count — a link in a promotion that goes through our
 * own address first, so every tap on it is known.
 *
 * WhatsApp never tells a business that somebody tapped a link. So a link the
 * inbox sends is not the address the admin typed: it is
 * `https://api.mdgservices.in/go/<code>`, where the code is made for that one
 * message to that one person. A tap reaches our server, which writes down the
 * moment and sends the phone straight on to the address that was typed. The
 * Message results page counts those moments: who tapped, and who came back and
 * tapped again.
 *
 * What a tap keeps, and what it does not (the same stance as the film views,
 * ADR 0015): the time, and nothing else. No IP address, no browser string, no
 * place. The code already says whose message it was.
 *
 * The link rides in its own approved template (`WHATSAPP_LINK_TEMPLATE`): the
 * same greeting, words and sign-off as the simple message, and under it a
 * button whose address ends in the code. A link typed into the words of an
 * ordinary message is still not counted.
 */

import { toTemplateParam } from './whatsappInbox';

/**
 * `mdg_message_link` (en, MARKETING). Its body is exactly
 * `${greeting}\n\n{{1}}\n\n${closing}`, as in the simple message, and it has
 * one URL button whose address is `${urlBase}{{1}}` — the code.
 *
 * Change nothing here without changing the template at Meta: a send whose
 * shape differs from the approved one is refused.
 */
export const WHATSAPP_LINK_TEMPLATE = {
  name: 'mdg_message_link',
  language: 'en',
  greeting: 'Namaste,',
  closing: 'Thank you,\nTeam MDG Services',
  /** The button's label, as WhatsApp draws it under the message. 25 characters at most. */
  button: 'Open link',
  /** The button's address up to the code. Fixed at Meta when the template is approved. */
  urlBase: 'https://api.mdgservices.in/go/',
  /** As the simple message: Meta caps a body at 1,024 characters including the fixed words. */
  maxLength: 900,
} as const;

/** The longest address the admin may give a link. */
export const WHATSAPP_LINK_MAX_LENGTH = 1000;

/**
 * A link's code: sixteen characters of letters, digits, `-` and `_`, from 96
 * random bits. Nobody can reach somebody else's link by guessing one.
 */
export const WHATSAPP_LINK_CODE_PATTERN = /^[A-Za-z0-9_-]{16}$/;

/** The address the person's button opens, for a code. */
export function trackedLinkUrl(code: string): string {
  return `${WHATSAPP_LINK_TEMPLATE.urlBase}${code}`;
}

/**
 * The address a link should send people to, from what the admin typed — or
 * null when it is not one.
 *
 * Forgiving about what a person types (`mdgservices.in/film` becomes
 * `https://mdgservices.in/film`), strict about what comes out: a web address
 * (http or https) with a real host name, no password in it, and not one of our
 * own counted links (which would count every tap twice, or loop).
 */
export function toLinkTarget(typed: string): string | null {
  const raw = typed.trim();
  if (!raw || raw.length > WHATSAPP_LINK_MAX_LENGTH || /\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  // A host with a dot in it and no empty label: `mdgservices.in`, not `localhost` or `mdg.`.
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host.split('.').some((label) => label === '')) return null;
  const href = url.href;
  if (href.length > WHATSAPP_LINK_MAX_LENGTH) return null;
  if (href.toLowerCase().startsWith(WHATSAPP_LINK_TEMPLATE.urlBase)) return null;
  return href;
}

/** The whole message as the person sees it, above its button. */
export function renderLinkTemplate(text: string): string {
  const t = WHATSAPP_LINK_TEMPLATE;
  return `${t.greeting}\n\n${toTemplateParam(text)}\n\n${t.closing}`;
}

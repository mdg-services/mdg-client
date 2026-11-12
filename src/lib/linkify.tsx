import * as React from 'react';

/**
 * Conservative URL matcher (mirrors the server's gallery extractor): plain
 * http/https only, stopping at whitespace and common trailing delimiters, so a
 * URL inside quotes/brackets doesn't swallow the closing character.
 */
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** A search term as a literal pattern: the dealer types "(", not a group. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface LinkifyOptions {
  /**
   * Words to paint in the search-hit colour, case-insensitively. Used while the
   * dealer searches inside a chat, so the match is visible in the bubble the
   * search just jumped to. Links keep their own look and are never marked.
   */
  highlight?: string;
}

/**
 * Cut `text` around every occurrence of `term`, wrapping each in a <mark>.
 * Nothing but React text nodes and <mark>s comes out, so a body is still inert.
 */
function markMatches(text: string, term: string, keyPrefix: string): React.ReactNode[] {
  const re = new RegExp(escapeRegExp(term), 'gi');
  const out: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(
      <mark
        key={`${keyPrefix}-${match.index}`}
        className="rounded-sm bg-wa-search-hit text-inherit"
      >
        {match[0]}
      </mark>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Split a message body into React nodes, turning bare http/https URLs into
 * external links. Everything else stays plain text (React escapes it), so no
 * HTML injection surface. Non-http(s) schemes are never linked.
 */
export function linkify(text: string, opts?: LinkifyOptions): React.ReactNode {
  const term = opts?.highlight?.trim();
  URL_RE.lastIndex = 0;
  const hasUrl = URL_RE.test(text);
  URL_RE.lastIndex = 0;

  if (!hasUrl) return term ? markMatches(text, term, 't') : text;

  const nodes: React.ReactNode[] = [];
  const pushText = (chunk: string, at: number) => {
    if (!chunk) return;
    if (term) nodes.push(...markMatches(chunk, term, `t${at}`));
    else nodes.push(chunk);
  };
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(text)) !== null) {
    const url = match[0];
    pushText(text.slice(last, match.index), last);
    nodes.push(
      <a
        key={`${match.index}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 break-all"
      >
        {url}
      </a>,
    );
    last = match.index + url.length;
  }
  pushText(text.slice(last), last);
  return nodes;
}

/**
 * WhatsApp's own bold: `*word*` where the stars hug the words (`* not bold *`
 * and `2 * 3 * 4` stay as typed) and sit at the edge of a word, not inside one.
 * No look-behind: older iPhones' WebViews do not have it, so the character before
 * the opening star is part of the match and put back.
 */
const BOLD_RE = /(^|[\s(])\*(\S(?:[^*\n]*?\S)?)\*(?=$|[\s.,!?;:)])/g;

/**
 * `linkify`, plus `*bold*`. Used for an announcement's words, which an admin
 * writes by hand and may want to stress. Still nothing but React text, `<strong>`
 * and links comes out, so a body stays inert.
 */
export function richText(text: string, opts?: LinkifyOptions): React.ReactNode {
  BOLD_RE.lastIndex = 0;
  const out: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = BOLD_RE.exec(text)) !== null) {
    const star = match.index + (match[1] ?? '').length;
    if (star > last) {
      out.push(
        <React.Fragment key={`t${last}`}>{linkify(text.slice(last, star), opts)}</React.Fragment>,
      );
    }
    out.push(
      <strong key={`b${star}`} className="font-bold">
        {linkify(match[2] ?? '', opts)}
      </strong>,
    );
    last = match.index + match[0].length;
  }
  if (last === 0) return linkify(text, opts);
  if (last < text.length) {
    out.push(<React.Fragment key={`t${last}`}>{linkify(text.slice(last), opts)}</React.Fragment>);
  }
  return out;
}

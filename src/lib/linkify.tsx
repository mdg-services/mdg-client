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

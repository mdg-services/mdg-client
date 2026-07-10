import * as React from 'react';

/**
 * Conservative URL matcher (mirrors the server's gallery extractor): plain
 * http/https only, stopping at whitespace and common trailing delimiters, so a
 * URL inside quotes/brackets doesn't swallow the closing character.
 */
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/**
 * Split a message body into React nodes, turning bare http/https URLs into
 * external links. Everything else stays plain text (React escapes it), so no
 * HTML injection surface. Non-http(s) schemes are never linked.
 */
export function linkify(text: string): React.ReactNode {
  URL_RE.lastIndex = 0;
  if (!URL_RE.test(text)) return text;
  URL_RE.lastIndex = 0;

  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(text)) !== null) {
    const url = match[0];
    if (match.index > last) nodes.push(text.slice(last, match.index));
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
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

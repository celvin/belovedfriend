import React from "react";

// Matches http(s):// URLs and bare www. URLs, stopping before trailing
// sentence punctuation so "see https://x.com/a." doesn't swallow the period.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]}'"])/gi;

function ensureHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/**
 * A short, human-friendly label for a URL: the last path segment (e.g.
 * "luis-tribute" from ".../articles/luis-tribute"), falling back to the bare
 * hostname. Titles can't be fetched client-side, so the last path part is the
 * most meaningful label we can derive locally.
 */
function shortLabel(raw: string): string {
  try {
    const u = new URL(ensureHref(raw));
    const host = u.hostname.replace(/^www\./, "");
    const segs = u.pathname.split("/").filter(Boolean);
    let label = segs.length ? decodeURIComponent(segs[segs.length - 1]) : host;
    label = label.replace(/\.(html?|php|aspx?)$/i, "");
    if (!label) label = host;
    if (label.length > 40) label = `${label.slice(0, 37)}…`;
    return label;
  } catch {
    return raw.length > 40 ? `${raw.slice(0, 37)}…` : raw;
  }
}

/**
 * Render plain text, turning any URLs into clickable links shown with a short
 * label (see {@link shortLabel}). Inline-safe — drop it inside a <p>.
 */
export function Linkify({
  text,
  linkClassName = "text-primary underline underline-offset-2 hover:no-underline break-words",
}: {
  text?: string | null;
  linkClassName?: string;
}): React.ReactElement | null {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    const url = m[0];
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a
        key={`lnk-${key++}`}
        href={ensureHref(url)}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
        title={url}
      >
        {shortLabel(url)}
      </a>,
    );
    last = m.index + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

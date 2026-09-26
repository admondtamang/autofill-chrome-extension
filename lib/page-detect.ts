import type { MappingIndexEntry } from '@/lib/schema';

const norm = (s: string) => s.trim().toLowerCase();

/** CONTRACTS §4: host is a hard gate, url is +2, heading is +1, first best wins. */
export function detectFormKey(
  index: MappingIndexEntry[],
  ctx: { host: string; url: string; headings: string[] },
): string | null {
  let best: { formKey: string; score: number } | null = null;

  for (const entry of index) {
    const { host, urlIncludes, headingText } = entry.pageMatch;
    if (ctx.host !== host) continue;

    let score = 0;
    if (urlIncludes && ctx.url.includes(urlIncludes)) score += 2;
    if (headingText && ctx.headings.some((h) => norm(h).includes(norm(headingText)))) score += 1;

    // A 0 score only counts when the entry asked for nothing beyond the host.
    if (score === 0 && (urlIncludes !== '' || headingText !== '')) continue;
    if (!best || score > best.score) best = { formKey: entry.formKey, score }; // ties keep the earlier entry
  }

  return best?.formKey ?? null;
}

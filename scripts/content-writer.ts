// TASK 24 — Content Writer: Claude API wrapper
// TASK 30 — Hash-Check vor Generierung (MD5-ähnlicher Hash via crypto)
// TASK 31 — Rate Limiting: max 50 calls/min

import Anthropic from '@anthropic-ai/sdk';
import { createHash }              from 'node:crypto';
import { getCityServicePrompt, type CityServiceContext } from './prompts/city-service.js';
import { getDozentinBioPrompt,  type DozentinBioContext } from './prompts/dozentin-bio.js';
import { getBlogPrompt,         type BlogContext }        from './prompts/blog.js';

// ─── types ───────────────────────────────────────────────────────────────────

export type ContentType = 'city_service' | 'dozentin_bio' | 'longtail' | 'blog';

export interface ContentContext {
  type:       ContentType;
  cityService?: CityServiceContext;
  dozentinBio?: DozentinBioContext;
  blog?:        BlogContext;
  longtail?: { keyword: string; city: string; service: string };
}

// ─── rate limiter (TASK 31) ──────────────────────────────────────────────────

let callsThisMinute = 0;
let windowStart     = Date.now();
const CALLS_PER_MIN = 50;

async function acquireRateLimit(): Promise<void> {
  const now     = Date.now();
  const elapsed = now - windowStart;

  if (elapsed >= 60_000) {
    callsThisMinute = 0;
    windowStart     = now;
  }

  if (callsThisMinute >= CALLS_PER_MIN) {
    const wait = 60_000 - elapsed;
    console.log(`[rate-limit] ${CALLS_PER_MIN} calls/min reached — waiting ${Math.ceil(wait / 1000)}s`);
    await new Promise(r => setTimeout(r, wait + 200));
    callsThisMinute = 0;
    windowStart     = Date.now();
  }

  callsThisMinute++;
}

// ─── hash helper (TASK 30) ───────────────────────────────────────────────────

export function buildContentHash(ctx: ContentContext): string {
  const key = JSON.stringify({ type: ctx.type, ...ctx[ctx.type as keyof ContentContext] });
  return createHash('md5').update(key).digest('hex');
}

// ─── prompt resolver ─────────────────────────────────────────────────────────

function resolvePrompt(ctx: ContentContext): string {
  switch (ctx.type) {
    case 'city_service':
      if (!ctx.cityService) throw new Error('cityService context required');
      return getCityServicePrompt(ctx.cityService);

    case 'dozentin_bio':
      if (!ctx.dozentinBio) throw new Error('dozentinBio context required');
      return getDozentinBioPrompt(ctx.dozentinBio);

    case 'blog':
      if (!ctx.blog) throw new Error('blog context required');
      return getBlogPrompt(ctx.blog);

    case 'longtail': {
      const lt = ctx.longtail;
      if (!lt) throw new Error('longtail context required');
      return `Schreibe einen 150–200 Wörter SEO-Text auf Deutsch für das Keyword "${lt.keyword}" in ${lt.city} zum Thema ${lt.service}. Kein Markdown, kein HTML. Ein Fließtext-Absatz.`;
    }

    default:
      throw new Error(`Unknown content type: ${ctx.type}`);
  }
}

// ─── main function ───────────────────────────────────────────────────────────

const client = new Anthropic();

/**
 * Generate content via Claude API.
 * Returns null on permanent failure (after 3 retries).
 */
export async function generateContent(ctx: ContentContext): Promise<string | null> {
  const prompt = resolvePrompt(ctx);
  const RETRIES = 3;
  const RETRY_DELAY_MS = 5_000;

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      await acquireRateLimit(); // TASK 31

      const msg = await client.messages.create({
        model:      'claude-sonnet-4-5',
        max_tokens: 400,
        system:     'Du bist ein professioneller SEO-Texter für die deutsche Beauty-Weiterbildungsbranche. Antworte präzise und im angegebenen Format.',
        messages: [
          { role: 'user', content: prompt },
        ],
      });

      const text = msg.content
        .filter(b => b.type === 'text')
        .map(b  => (b as { type: 'text'; text: string }).text)
        .join('');

      return text.trim();

    } catch (err) {
      const isLast = attempt === RETRIES;
      console.error(`[content-writer] attempt ${attempt}/${RETRIES} failed:`, err instanceof Error ? err.message : err);
      if (isLast) {
        // TASK 24 — bei dauerhaftem Fehler: null zurückgeben (kein Crash)
        return null;
      }
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  return null;
}

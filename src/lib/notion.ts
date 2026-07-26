import type { CollectionEntry } from 'astro:content';
import { fileToImageAsset, fileToUrl } from 'notion-astro-loader';

export type BookEntry = CollectionEntry<'books'>;
export type PostEntry = CollectionEntry<'posts'>;

/**
 * Slugify a title into the same shape the old Go generator used for filenames:
 * lowercase, apostrophes dropped (not hyphenated), everything else collapsed to
 * single hyphens. e.g. "I'm Glad My Mom Died" -> "im-glad-my-mom-died".
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Render an integer 0–5 rating as filled/empty dots (Go `ratingDots`). */
export function ratingDots(r: number | null | undefined): string {
  if (!r) return '';
  return '●'.repeat(r) + '○'.repeat(5 - r);
}

type NotionDate = { start: Date | string; end: Date | string | null; time_zone: string | null } | null;

/** Pull the start date out of a transformed Notion date property. */
export function dateStart(d: NotionDate): Date | null {
  if (!d || !d.start) return null;
  return d.start instanceof Date ? d.start : new Date(d.start);
}

/** "2026-06-10" style — matches the old post/list `Date` display. */
export function isoDate(d: Date | null): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

/** "January 2006" style — matches the old Go `fmtDate`. */
export function monthYear(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Legacy images live in public/assets and were referenced by absolute URL so
 * Notion would accept them. Strip the host back to a root-relative path so they
 * resolve on any domain (local preview, custom domain) and are served straight
 * from the build output. Notion-hosted images (downloaded to _astro) are
 * untouched.
 */
export function localizeAssets(html: string): string {
  return html.replace(/https?:\/\/[^/"']+(\/assets\/)/g, '$1');
}

/** Word count + read time (~200 wpm, min 1) from rendered HTML. */
export function readingStats(html: string): { words: number; minutes: number } {
  const text = html.replace(/<[^>]+>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return { words, minutes };
}

/**
 * Resolve a book cover URL. Prefer the stable OpenLibrary cover derived from the
 * ISBN (as the Go build did); fall back to the Notion page cover (downloaded and
 * optimized through astro:assets); otherwise none.
 */
export async function bookCover(entry: BookEntry): Promise<string | null> {
  const isbn = entry.data.properties.ISBN?.trim();
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
  }
  const cover = entry.data.cover;
  if (cover) {
    try {
      return (await fileToImageAsset(cover)).src;
    } catch {
      return fileToUrl(cover) ?? null;
    }
  }
  return null;
}

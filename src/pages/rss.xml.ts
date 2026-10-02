import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { POST_SECTIONS, dateStart, excerpt, hrefFor } from '../lib/notion';

export async function GET(context: APIContext) {
  const posts = (await getCollection('posts')).filter((p) =>
    (POST_SECTIONS as readonly string[]).includes(p.data.properties.Section ?? ''),
  );
  const items = await Promise.all(
    posts.map(async (entry) => ({
      title: entry.data.properties.Name,
      link: await hrefFor(entry),
      pubDate: dateStart(entry.data.properties.Date) ?? undefined,
      description: excerpt(entry.rendered?.html ?? '', 300),
      categories: [entry.data.properties.Section ?? '', ...(entry.data.properties.Tags ?? [])].filter(Boolean),
    })),
  );
  items.sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0));

  return rss({
    title: 'khamiruf',
    description: 'Projects, learnings and travel notes.',
    site: context.site!,
    items,
  });
}

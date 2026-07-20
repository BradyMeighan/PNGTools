export type FetchRoute = 'direct' | 'relay' | 'pasted';

export interface IconCandidate {
  url: string;
  rel: string;
  sizes: string | null;
  type: string | null;
  source: 'html' | 'manifest' | 'conventional' | 'google';
}

export interface SiteMetadata {
  url: string;
  title: string;
  description: string;
  canonical: string;
  robots: string;
  viewport: string;
  charset: string;
  themeColor: string;
  language: string;
  manifestUrl: string;
  og: Record<string, string>;
  twitter: Record<string, string>;
  icons: IconCandidate[];
  route: FetchRoute;
}

const FETCH_TIMEOUT = 15_000;
const RELAY_BUILDERS = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

export function normalizeSiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Enter a website URL first.');
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Use an http:// or https:// website URL.');
  return url.toString();
}

async function fetchWithTimeout(url: string, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed with ${response.status}.`);
    return response;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchPublicResource(url: string) {
  try {
    return { response: await fetchWithTimeout(url), route: 'direct' as const };
  } catch {
    for (const makeRelayUrl of RELAY_BUILDERS) {
      try {
        return { response: await fetchWithTimeout(makeRelayUrl(url), 10_000), route: 'relay' as const };
      } catch {
        // Try the next independent relay.
      }
    }
    throw new Error(
      'That site blocked browser access and the fallback relays could not reach it. You can still paste its page source into the checker.',
    );
  }
}

function metaValue(document: Document, selector: string) {
  return document.querySelector<HTMLMetaElement>(selector)?.content.trim() ?? '';
}

function absoluteUrl(value: string | null | undefined, baseUrl: string) {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function collectPrefixedMeta(document: Document, attribute: 'property' | 'name', prefix: string) {
  const output: Record<string, string> = {};
  document.querySelectorAll<HTMLMetaElement>(`meta[${attribute}]`).forEach((element) => {
    const key = element.getAttribute(attribute)?.toLowerCase();
    if (!key?.startsWith(prefix) || !element.content.trim()) return;
    output[key.slice(prefix.length)] = element.content.trim();
  });
  return output;
}

function parseIcons(document: Document, baseUrl: string): IconCandidate[] {
  return [...document.querySelectorAll<HTMLLinkElement>('link[rel]')]
    .filter((link) => /(^|\s)(icon|apple-touch-icon|mask-icon)(\s|$)/i.test(link.getAttribute('rel') ?? ''))
    .map((link) => ({
      // DOMParser does not load the inspected page, so its .href property can
      // inherit PNGTools' document URL. Always resolve the literal declaration
      // against the inspected site's own URL instead.
      url: absoluteUrl(link.getAttribute('href'), baseUrl),
      rel: link.getAttribute('rel') ?? '',
      sizes: link.getAttribute('sizes'),
      type: link.getAttribute('type'),
      source: 'html' as const,
    }))
    .filter((icon) => Boolean(icon.url));
}

export function analyzeSiteHtml(html: string, baseUrl: string, route: FetchRoute = 'pasted'): SiteMetadata {
  const url = normalizeSiteUrl(baseUrl);
  const document = new DOMParser().parseFromString(html, 'text/html');
  const documentBase = absoluteUrl(document.querySelector('base[href]')?.getAttribute('href'), url) || url;
  const og = {
    ...collectPrefixedMeta(document, 'name', 'og:'),
    ...collectPrefixedMeta(document, 'property', 'og:'),
  };
  const twitter = {
    ...collectPrefixedMeta(document, 'property', 'twitter:'),
    ...collectPrefixedMeta(document, 'name', 'twitter:'),
  };
  if (og.image) og.image = absoluteUrl(og.image, url);
  if (og.url) og.url = absoluteUrl(og.url, url);
  if (twitter.image) twitter.image = absoluteUrl(twitter.image, url);

  return {
    url,
    title: document.title.trim() || metaValue(document, 'meta[property="og:title"]'),
    description: metaValue(document, 'meta[name="description"]'),
    canonical: absoluteUrl(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href'), documentBase),
    robots: metaValue(document, 'meta[name="robots"]'),
    viewport: metaValue(document, 'meta[name="viewport"]'),
    charset: document.querySelector<HTMLMetaElement>('meta[charset]')?.getAttribute('charset')?.trim() || metaValue(document, 'meta[http-equiv="content-type"]'),
    themeColor: metaValue(document, 'meta[name="theme-color"]'),
    language: document.documentElement.lang.trim(),
    manifestUrl: absoluteUrl(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href'), documentBase),
    og,
    twitter,
    icons: parseIcons(document, documentBase),
    route,
  };
}

export async function inspectSite(value: string) {
  const url = normalizeSiteUrl(value);
  const { response, route } = await fetchPublicResource(url);
  return analyzeSiteHtml(await response.text(), url, route);
}

export async function discoverSiteIcons(metadata: SiteMetadata): Promise<IconCandidate[]> {
  const icons = [...metadata.icons];
  if (metadata.manifestUrl) {
    try {
      const { response } = await fetchPublicResource(metadata.manifestUrl);
      const manifest = await response.json() as { icons?: Array<{ src?: string; sizes?: string; type?: string }> };
      for (const icon of manifest.icons ?? []) {
        const url = absoluteUrl(icon.src, metadata.manifestUrl);
        if (url) icons.push({ url, rel: 'manifest icon', sizes: icon.sizes ?? null, type: icon.type ?? null, source: 'manifest' });
      }
    } catch {
      // A broken manifest should not hide icons already found in the page.
    }
  }

  const origin = new URL(metadata.url).origin;
  icons.push(
    { url: `${origin}/favicon.ico`, rel: 'conventional favicon', sizes: null, type: 'image/x-icon', source: 'conventional' },
    { url: `${origin}/apple-touch-icon.png`, rel: 'conventional Apple icon', sizes: '180x180', type: 'image/png', source: 'conventional' },
    {
      url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(metadata.url).hostname)}&sz=256`,
      rel: 'Google favicon fallback',
      sizes: '256x256',
      type: 'image/png',
      source: 'google',
    },
  );

  const seen = new Set<string>();
  return icons.filter((icon) => {
    if (!icon.url || seen.has(icon.url)) return false;
    seen.add(icon.url);
    return true;
  });
}

export async function downloadPublicAsset(url: string) {
  const { response } = await fetchPublicResource(url);
  return response.blob();
}

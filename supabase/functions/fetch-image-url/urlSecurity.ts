/** Security policy for URLs retrieved by the public image proxy.
 *
 * This is deliberately an allowlist: blocking obvious local/private IP literals
 * alone does not prevent DNS rebinding or redirects to cloud metadata services.
 * Add trusted hosts using the Edge Function secret IMAGE_PROXY_ALLOWED_HOSTS.
 */
export const DEFAULT_IMAGE_HOSTS = [
  'images.unsplash.com',
  'images.pexels.com',
  'cdn.pixabay.com',
  'images.pixabay.com',
  'upload.wikimedia.org',
  'i.imgur.com',
  '*.staticflickr.com',
  'images.ctfassets.net',
  'images.prismic.io',
  'cdn.shopify.com',
  'pbs.twimg.com',
  'media.githubusercontent.com',
  'images.squarespace-cdn.com',
] as const;

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX_URL_LENGTH = 2048;

export function getAllowedImageHosts(extraHosts = ''): string[] {
  const additional = extraHosts.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  // A typo or wildcard '*' must never silently turn the proxy into an open proxy.
  for (const entry of additional) {
    const name = entry.startsWith('*.') ? entry.slice(2) : entry;
    if (name.length > 253 || !name.includes('.') ||
        !name.split('.').every(part => DNS_LABEL.test(part)) ||
        /^\d+(?:\.\d+)*$/.test(name) || name.endsWith('.local') ||
        name.endsWith('.localhost') || name.endsWith('.internal') ||
        name.endsWith('.lan') || name.endsWith('.test') ||
        name.endsWith('.example') || name.endsWith('.invalid') ||
        name.endsWith('.arpa')) {
      throw new Error('Configuration IMAGE_PROXY_ALLOWED_HOSTS invalide.');
    }
  }
  return [...new Set([...DEFAULT_IMAGE_HOSTS, ...additional])];
}

function trustedHost(hostname: string, allowedHosts: readonly string[]): boolean {
  return allowedHosts.some(host => {
    if (host.startsWith('*.')) {
      const suffix = host.slice(2);
      return hostname.endsWith('.' + suffix) && hostname !== suffix;
    }
    return hostname === host;
  });
}

export function parseTrustedImageUrl(input: unknown, allowedHosts: readonly string[]): URL {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_URL_LENGTH) {
    throw new Error('URL invalide (2 048 caractères maximum).');
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('URL invalide.');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Seules les URL HTTPS sont autorisées pour cet import.');
  }
  if (url.username || url.password || url.port) {
    throw new Error('URL avec identifiants ou port personnalisé interdite.');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!trustedHost(host, allowedHosts)) {
    throw new Error('Hôte non autorisé pour l’importation distante. Téléchargez cette image puis importez le fichier local.');
  }
  url.hash = '';
  return url;
}

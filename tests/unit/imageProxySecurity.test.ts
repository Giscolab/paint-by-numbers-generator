import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_IMAGE_HOSTS,
  getAllowedImageHosts,
  parseTrustedImageUrl,
} from '../../supabase/functions/fetch-image-url/urlSecurity';
import {
  handleImageProxy,
  MAX_IMAGE_BYTES,
} from '../../supabase/functions/fetch-image-url/imageProxy';

const endpoint = 'https://example.org/functions/v1/fetch-image-url';
const makeRequest = (url: string) =>
  new Request(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const imageResponse = (bytes: Uint8Array, type = 'image/png') =>
  new Response(new Uint8Array(bytes).buffer, {
    status: 200,
    headers: { 'content-type': type },
  });

describe('sÃ©curitÃ© des URLs dâ€™image distantes', () => {
  it('autorise uniquement des hÃ´tes explicitement connus en HTTPS', () => {
    expect(parseTrustedImageUrl('https://images.unsplash.com/photo-123?width=300#anchor', DEFAULT_IMAGE_HOSTS).href)
      .toBe('https://images.unsplash.com/photo-123?width=300');
    expect(parseTrustedImageUrl('https://live.staticflickr.com/123/abc.jpg', DEFAULT_IMAGE_HOSTS).hostname)
      .toBe('live.staticflickr.com');
  });

  it.each([
    'http://images.unsplash.com/a.png',
    'https://localhost/a.png',
    'https://127.0.0.1/a.png',
    'https://0x7f000001/a.png',
    'https://2130706433/a.png',
    'https://[::1]/a.png',
    'https://169.254.169.254/latest/meta-data',
    'https://metadata.google.internal/computeMetadata/v1',
    'https://images.unsplash.com.attacker.com/a.png',
    'https://images.unsplash.com@localhost/a.png',
    'https://user:password@images.unsplash.com/a.png',
    'https://images.unsplash.com:8443/a.png',
    'file:///etc/passwd',
    'https://evil.com/a.png',
  ])('refuse les destinations internes ou non autorisÃ©es : %s', url => {
    expect(() => parseTrustedImageUrl(url, DEFAULT_IMAGE_HOSTS)).toThrow();
  });

  it('refuse les domaines sauvages ou rÃ©servÃ©s dans la configuration', () => {
    for (const bad of ['*', '*.local', 'localhost', '*.internal', '127.0.0.1', 'example.test']) {
      expect(() => getAllowedImageHosts(bad)).toThrow();
    }
    expect(getAllowedImageHosts('img.monsite.fr,*.cdn.monsite.fr'))
      .toContain('img.monsite.fr');
  });

  it('refuse avant tout fetch une destination non approuvÃ©e', async () => {
    const mock = vi.fn();
    const response = await handleImageProxy(makeRequest('https://localhost/private'), {
      fetcher: mock,
    });
    expect(response.status).toBe(400);
    expect(mock).not.toHaveBeenCalled();
  });

  it('refuse les redirections sans suivre la nouvelle destination', async () => {
    const mock = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.redirect).toBe('manual');
      return new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
      });
    });
    const response = await handleImageProxy(makeRequest('https://images.unsplash.com/test'), {
      fetcher: mock as unknown as typeof fetch,
    });
    expect(response.status).toBe(400);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('sert un PNG valide avec protections HTTP et sans divulguer de donnÃ©es privÃ©es', async () => {
    const response = await handleImageProxy(makeRequest('https://images.unsplash.com/a.png'), {
      fetcher: vi.fn(async () => imageResponse(png)) as unknown as typeof fetch,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
  });

  it('rejette des contenus arbitraires mÃªme si le Content-Type prÃ©tend Ãªtre une image', async () => {
    const response = await handleImageProxy(makeRequest('https://images.unsplash.com/a.png'), {
      fetcher: vi.fn(async () => imageResponse(new TextEncoder().encode('<html>no</html>'))) as unknown as typeof fetch,
    });
    expect(response.status).toBe(415);
  });

  it('refuse les SVG distants et les rÃ©ponses sans longueur annoncÃ©e trop volumineuses', async () => {
    const svg = await handleImageProxy(makeRequest('https://images.unsplash.com/a.svg'), {
      fetcher: vi.fn(async () => imageResponse(new TextEncoder().encode('<svg/>'), 'image/svg+xml')) as unknown as typeof fetch,
    });
    expect(svg.status).toBe(415);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES + 1));
        controller.close();
      },
    });
    const oversized = await handleImageProxy(makeRequest('https://images.unsplash.com/b.png'), {
      fetcher: vi.fn(async () => new Response(stream, {
        headers: { 'content-type': 'image/png' },
      })) as unknown as typeof fetch,
    });
    expect(oversized.status).toBe(413);
  });

  it('refuse les requÃªtes malformÃ©es et le trafic non prÃ©vu', async () => {
    expect((await handleImageProxy(new Request(endpoint, { method: 'GET' }))).status).toBe(405);
    expect((await handleImageProxy(new Request(endpoint, { method: 'OPTIONS' }))).status).toBe(200);
    expect((await handleImageProxy(new Request(endpoint, { method: 'POST', body: '{"url":' }))).status).toBe(400);
    expect((await handleImageProxy(new Request(endpoint, {
      method: 'POST', body: JSON.stringify({ url: 'https://images.unsplash.com/a.png', junk: 'x'.repeat(4500) }),
    }))).status).toBe(413);
  });
});


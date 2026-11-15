import { getAllowedImageHosts, parseTrustedImageUrl } from './urlSecurity.ts';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4096;
const FETCH_TIMEOUT_MS = 10000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

class ProxyError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Read untrusted HTTP bodies with a hard byte limit, even without Content-Length. */
async function readBounded(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<Blob> {
  if (!stream) return new Blob();
  const reader = stream.getReader();
  const chunks: ArrayBuffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        throw new ProxyError('Contenu trop volumineux.', 413);
      }
      // Copy only bounded bytes. Never buffer the entire remote body first.
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      chunks.push(chunk.buffer);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks);
}

function validImageSignature(mime: string, data: Uint8Array): boolean {
  if (mime === 'image/png') {
    return data.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => data[i] === b);
  }
  if (mime === 'image/jpeg') {
    return data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
  }
  if (mime === 'image/webp') {
    return data.length >= 12 && String.fromCharCode(...data.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...data.slice(8, 12)) === 'WEBP';
  }
  return false;
}

export interface ImageProxyOptions {
  allowedHosts?: readonly string[];
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

/** Testable request handler; the Deno entry point only provides configuration. */
export async function handleImageProxy(
  req: Request,
  options: ImageProxyOptions = {},
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('Méthode non autorisée.', 405);
  }

  let url: URL;
  try {
    const len = Number(req.headers.get('content-length') || 0);
    if (len > MAX_REQUEST_BYTES) throw new ProxyError('Requête trop volumineuse.', 413);
    const requestBody = await readBounded(req.body, MAX_REQUEST_BYTES);
    let payload: unknown;
    try {
      payload = JSON.parse(await requestBody.text());
    } catch {
      throw new ProxyError('Corps JSON invalide.', 400);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ProxyError('Corps JSON invalide.', 400);
    }
    url = parseTrustedImageUrl(
      (payload as { url?: unknown }).url,
      options.allowedHosts ?? getAllowedImageHosts(),
    );
  } catch (err) {
    if (err instanceof ProxyError) return errorResponse(err.message, err.status);
    return errorResponse(err instanceof Error ? err.message : 'URL invalide.', 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const response = await (options.fetcher ?? fetch)(url.toString(), {
      method: 'GET',
      redirect: 'manual',  // A CDN redirect can target a private address.
      signal: controller.signal,
      headers: {
        'Accept': 'image/png, image/jpeg, image/webp',
        'User-Agent': 'PaintByNumbers/1.0',
      },
    });
    if (response.status >= 300 && response.status < 400) {
      return errorResponse('Redirection distante refusée par sécurité.', 400);
    }
    if (!response.ok) return errorResponse('Serveur d’images indisponible.', 502);
    const mime = (response.headers.get('content-type') ?? '')
      .split(';', 1)[0].trim().toLowerCase();
    const canonicalMime = mime === 'image/jpg' ? 'image/jpeg' : mime;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(canonicalMime)) {
      // Remote SVG is intentionally excluded: it may embed active content.
      return errorResponse('Format distant non autorisé. Utilisez PNG, JPEG ou WebP.', 415);
    }
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > MAX_IMAGE_BYTES) {
      return errorResponse('Image trop volumineuse (20 Mio maximum).', 413);
    }
    const blob = await readBounded(response.body, MAX_IMAGE_BYTES);
    if (!blob.size) return errorResponse('Le fichier distant est vide.', 422);
    const signature = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (!validImageSignature(canonicalMime, signature)) {
      return errorResponse('Signature du fichier image invalide.', 415);
    }
    return new Response(blob, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': canonicalMime,
        'Content-Length': String(blob.size),
      },
    });
  } catch (err) {
    if (err instanceof ProxyError) return errorResponse(err.message, err.status);
    if (controller.signal.aborted) return errorResponse('Le téléchargement a expiré.', 504);
    // Do not expose private network or provider error details to the caller.
    return errorResponse('Le téléchargement de cette image a échoué.', 502);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

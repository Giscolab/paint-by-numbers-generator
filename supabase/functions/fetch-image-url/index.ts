import { getAllowedImageHosts } from './urlSecurity.ts';
import { handleImageProxy } from './imageProxy.ts';

const allowedHosts = getAllowedImageHosts(Deno.env.get('IMAGE_PROXY_ALLOWED_HOSTS') ?? '');
Deno.serve(req => handleImageProxy(req, { allowedHosts }));

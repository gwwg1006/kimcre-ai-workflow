import { env } from "cloudflare:workers";

export async function GET(_: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await context.params;
    if (!/^[a-f0-9-]{36}$/.test(key)) return new Response("Not found", { status: 404 });
    const object = await env.BUCKET.get(`screenshots/${key}`);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "image/png", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400" } });
  } catch { return new Response("Image unavailable", { status: 503 }); }
}

import { env } from "cloudflare:workers";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > 12 * 1024 * 1024) return Response.json({ error: "10MB 이하 이미지를 선택해 주세요." }, { status: 413 });
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) return Response.json({ error: "10MB 이하 이미지를 선택해 주세요." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png = bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71;
    const jpeg = bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
    const webp = new TextDecoder().decode(bytes.slice(0,4))==="RIFF" && new TextDecoder().decode(bytes.slice(8,12))==="WEBP";
    if (!png && !jpeg && !webp) return Response.json({ error: "PNG, JPG, WebP 이미지만 등록할 수 있습니다." }, { status: 400 });
    const key = crypto.randomUUID();
    await env.BUCKET.put(`screenshots/${key}`, bytes, { httpMetadata: { contentType: png ? "image/png" : jpeg ? "image/jpeg" : "image/webp" } });
    return Response.json({ url: `/api/screenshots/${key}` });
  } catch { return Response.json({ error: "이미지를 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 500 }); }
}

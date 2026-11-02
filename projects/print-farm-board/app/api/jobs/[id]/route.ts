import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { jobs } from "../../../../db/schema";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    delete body.id; delete body.createdAt;
    const [job] = await getDb().update(jobs).set({ ...body, updatedAt: new Date().toISOString() }).where(eq(jobs.id, Number(id))).returning();
    return job ? Response.json({ job }) : Response.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "작업을 수정하지 못했습니다." }, { status: 500 }); }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await getDb().delete(jobs).where(eq(jobs.id, Number(id))); return new Response(null, { status: 204 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "작업을 삭제하지 못했습니다." }, { status: 500 }); }
}

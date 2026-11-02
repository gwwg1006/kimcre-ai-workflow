import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { jobs } from "../../../db/schema";

export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(jobs).orderBy(asc(jobs.sortOrder), asc(jobs.id));
    return Response.json({ jobs: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "작업을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.modelName?.trim() || !body.printer) return Response.json({ error: "모델명과 프린터는 필수입니다." }, { status: 400 });
    const [job] = await getDb().insert(jobs).values({ ...body, modelName: body.modelName.trim(), updatedAt: new Date().toISOString() }).returning();
    return Response.json({ job }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "작업을 추가하지 못했습니다." }, { status: 500 });
  }
}

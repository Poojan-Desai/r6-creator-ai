import { apiError } from "@/lib/errors";
import { createStudioProject, listStudioProjects } from "@/lib/studio-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ projects: await listStudioProjects() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const project = await createStudioProject(await request.json());
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

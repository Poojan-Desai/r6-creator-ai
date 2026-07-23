import { apiError, AppError } from "@/lib/errors";
import { getBenchmarkExport } from "@/lib/phase3b2-benchmark";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    if (format !== "json" && format !== "markdown") {
      throw new AppError(
        "Choose JSON or Markdown for the benchmark export.",
        400,
        "BENCHMARK_EXPORT_FORMAT_INVALID",
      );
    }
    const body = await getBenchmarkExport(id, format);
    return new Response(body, {
      headers: {
        "content-type":
          format === "json"
            ? "application/json; charset=utf-8"
            : "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="r6-phase3b2-benchmark-${id}.${format === "json" ? "json" : "md"}"`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

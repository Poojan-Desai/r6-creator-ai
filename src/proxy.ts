import { NextResponse, type NextRequest } from "next/server";
import { isAllowedLocalRequest } from "@/lib/local-request-guard";
export function proxy(request: NextRequest) {
  if (!isAllowedLocalRequest(request.headers, request.nextUrl.protocol)) {
    return NextResponse.json(
      {
        error: {
          message:
            "This private studio accepts same-origin requests on this Mac only.",
          code: "LOCAL_ACCESS_ONLY",
        },
      },
      { status: 403 },
    );
  }
  return NextResponse.next();
}

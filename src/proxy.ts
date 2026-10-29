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

// Next Proxy clones non-GET bodies and truncates its default clone at 10 MB.
// Only these exact streaming ingestion routes bypass that buffering. Every
// exported handler in each excluded route must call localRequestRejection first.
// Other APIs, nested routes, UI pages and media reads retain the Proxy guard.
export const config = {
  matcher: [
    "/((?!api/projects/?$|api/references/?$|api/replays/?$|api/map-versions/[^/]+/blueprints/?$|api/studio-projects/[^/]+/(?:media-assets|voiceover/takes)/?$).*)",
  ],
};

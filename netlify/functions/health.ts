export default async function handler(request: Request) {
  if (request.method !== "GET")
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  return Response.json(
    {
      status: "ok",
      service: "r6-browser-studio",
      version: "1.0.0",
      inference: "browser-local",
      acceptsUploads: false,
      storesUserData: false,
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
export const config = { path: "/api/health" };

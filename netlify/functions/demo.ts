import { DEMO_NOTES, MODEL_ID } from "../../browser-lab/core";
export default async function handler(request: Request) {
  if (request.method !== "GET")
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  return Response.json(
    {
      notes: DEMO_NOTES,
      provenance: "illustrative-synthetic",
      model: MODEL_ID,
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
export const config = { path: "/api/demo" };

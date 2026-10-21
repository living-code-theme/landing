import { finderHash, finderPayload } from "../../lib/port-finder-data.mjs";

export function getStaticPaths() { return [{ params: { hash: finderHash } }]; }
export function GET() {
  return new Response(finderPayload, { headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=31536000, immutable",
  } });
}

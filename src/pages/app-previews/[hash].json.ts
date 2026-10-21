import { showcaseData } from "../../lib/showcase-data";
export async function getStaticPaths() {
  const { assets } = await showcaseData;
  return [...assets].map(([hash, body]) => ({ params: { hash }, props: { body } }));
}
export function GET({ props }: { props: { body: string } }) {
  return new Response(props.body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable" } });
}

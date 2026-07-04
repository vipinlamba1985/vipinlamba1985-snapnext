export async function POST() {
  return Response.json({ caption: 'Caption service is being prepared. Please try again shortly.', meta: { fallback: true } });
}

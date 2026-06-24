export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { task } = await request.json();

    if (!task || typeof task !== 'string') {
      return Response.json({ error: 'Task prompt is required.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          error: 'Gemini API key is not configured in this deployment. Please redeploy after adding GEMINI_API_KEY.',
          setupRequired: true,
        },
        { status: 500 }
      );
    }

    const prompt = `You are SnapNext AI, a memory and social posting assistant. Create a useful ready-to-review result for this user task: "${task}".

Return only valid JSON with this shape:
{
  "title": "short title",
  "summary": "what SnapNext did",
  "caption": "ready-to-post caption",
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "steps": ["step 1", "step 2", "step 3"],
  "draftType": "Marketplace / Reel / Caption / Collage / Social Post"
}`;

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        {
          error: data?.error?.message || 'Gemini request failed.',
        },
        { status: response.status }
      );
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = text.replace(/```json|```/g, '').trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      result = {
        title: 'SnapNext AI Draft',
        summary: 'Gemini generated a draft, but it was returned as plain text.',
        caption: cleaned,
        hashtags: ['#snapnext', '#readytopost'],
        steps: ['Review generated text', 'Adjust photos', 'Post when ready'],
        draftType: 'Social Post',
      };
    }

    return Response.json({ result });
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Unexpected AI agent error.' },
      { status: 500 }
    );
  }
}

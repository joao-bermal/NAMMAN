import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { toneId, token } = await req.json();
    
    // We proxy this request through the backend to avoid CORS preflight (OPTIONS)
    // errors that occur when the browser sends custom headers like Authorization
    // to Tone3000's public API wrapper.
    await fetch(`https://tone3000.com/api/v1/tones/${toneId}/download`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}` 
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Track download failed:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

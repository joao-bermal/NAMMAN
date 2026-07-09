import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { toneId, token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    // Decode user_id (sub) from JWT token payload
    const parts = token.split('.');
    if (parts.length < 2) {
      return NextResponse.json({ error: 'Invalid token format' }, { status: 400 });
    }
    
    const payloadB64 = parts[1];
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8'));
    const userId = payload.sub;

    if (!userId) {
      return NextResponse.json({ error: 'User ID not found in token' }, { status: 400 });
    }

    // Construct Supabase cookie format required by Tone3000's backend
    const cookieObj = {
      access_token: token,
      refresh_token: '',
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: userId }
    };
    const cookieValue = 'base64-' + Buffer.from(JSON.stringify(cookieObj)).toString('base64');
    const cookieHeader = `sb-api-auth-token=${cookieValue}`;

    // Request to Tone3000's actual downloads tracking API
    const res = await fetch('https://www.tone3000.com/api/downloads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      },
      body: JSON.stringify({
        tone_id: Number(toneId),
        user_id: userId
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Tone3000 API responded with status ${res.status}: ${text}`);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Track download failed:', err);
    return NextResponse.json({ error: `Track download failed: ${err.message}` }, { status: 500 });
  }
}

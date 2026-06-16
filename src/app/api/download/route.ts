import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserData } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const username = cookieStore.get('token')?.value;

  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getUserData(username);
  if (!user || !user.tone3000AccessToken) {
    return NextResponse.json({ error: 'Tone3000 account not connected' }, { status: 403 });
  }

  try {
    const tone3000Res = await fetch(targetUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Authorization': `Bearer ${user.tone3000AccessToken}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ToneManager/3.0'
      }
    });

    if (!tone3000Res.ok) {
      return NextResponse.json({ error: 'Failed to fetch from Tone3000' }, { status: tone3000Res.status });
    }

    // Stream the response back to the client
    return new NextResponse(tone3000Res.body, {
      headers: {
        'Content-Type': tone3000Res.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Disposition': tone3000Res.headers.get('Content-Disposition') || 'attachment'
      }
    });
  } catch (err) {
    console.error('Proxy download error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

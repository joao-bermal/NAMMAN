import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const downloadUrl = searchParams.get('url');
    const token = req.headers.get('Authorization') || '';

    if (!downloadUrl) {
      return new NextResponse('Missing URL', { status: 400 });
    }

    // Proxy the fetch via the Next.js backend to bypass browser CORS preflight
    // blocks from Vercel Edge security.
    const res = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Authorization': token,
        // Mock a standard browser to avoid WAF blocks
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) {
      return new NextResponse(`Failed to fetch from Tone3000: ${res.status}`, { status: res.status });
    }

    // Return the file stream to the client
    const headers = new Headers();
    headers.set('Content-Type', res.headers.get('Content-Type') || 'application/octet-stream');
    const disposition = res.headers.get('Content-Disposition');
    if (disposition) {
      headers.set('Content-Disposition', disposition);
    }

    return new NextResponse(res.body, {
      status: 200,
      headers
    });
  } catch (err) {
    console.error('Proxy download failed:', err);
    return new NextResponse('Proxy failed', { status: 500 });
  }
}

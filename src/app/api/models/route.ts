import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserData } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const toneId = searchParams.get('tone_id');

  if (!toneId) {
    return NextResponse.json({ success: false, error: 'tone_id required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const username = cookieStore.get('token')?.value;

  if (!username) {
    return NextResponse.json({ success: false, error: 'Unauthorized: Please login first' }, { status: 401 });
  }

  const user = await getUserData(username);
  if (!user || !user.tone3000AccessToken) {
    return NextResponse.json({ success: false, error: 'Tone3000 account not connected' }, { status: 403 });
  }
  
  try {
    const headers = {
      'Authorization': `Bearer ${user.tone3000AccessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ToneManager/3.0'
    };

    // Fetch A1 (legacy) and A2 models concurrently
    const [resA1, resA2] = await Promise.all([
      fetch(`https://www.tone3000.com/api/v1/models?tone_id=${toneId}&page_size=100`, { headers, cache: 'no-store' }),
      fetch(`https://www.tone3000.com/api/v1/models?tone_id=${toneId}&architecture=2&page_size=100`, { headers, cache: 'no-store' })
    ]);

    if (!resA1.ok || !resA2.ok) {
      if (resA1.status === 401 || resA2.status === 401) {
        return NextResponse.json({ success: false, error: 'Tone3000 token expired, please reconnect' }, { status: 401 });
      }
      return NextResponse.json({ success: false, error: 'Tone3000 API error' }, { status: resA1.ok ? resA2.status : resA1.status });
    }

    const [dataA1, dataA2] = await Promise.all([resA1.json(), resA2.json()]);
    
    const modelsA1 = Array.isArray(dataA1) ? dataA1 : (dataA1.items || dataA1.data || []);
    const modelsA2 = Array.isArray(dataA2) ? dataA2 : (dataA2.items || dataA2.data || []);
    
    // Merge both arrays
    const models = [...modelsA1, ...modelsA2];

    return NextResponse.json({ success: true, models });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

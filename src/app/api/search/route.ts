import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserData } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const username = cookieStore.get('token')?.value;

    if (!username) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Please login first' }, { status: 401 });
    }

    const user = await getUserData(username);
    if (!user || !user.tone3000AccessToken) {
      return NextResponse.json({ success: false, error: 'Tone3000 account not connected' }, { status: 403 });
    }

    const body = await request.json();
    
    // Map the old RPC body to the new V1 API query parameters
    const queryObj = new URLSearchParams();
    if (body.query_term) queryObj.append('query', body.query_term);
    if (body.page_number) queryObj.append('page', body.page_number.toString());
    if (body.page_size) queryObj.append('page_size', body.page_size.toString());
    if (body.order_by) {
      // Revert mapping if needed, Tone3000 API v1 handles standard sorts like newest, trending
      const sort = body.order_by === 'downloads-all-time' ? 'downloads' : body.order_by;
      queryObj.append('sort', sort);
    }
    if (body.gear_filters && body.gear_filters.length > 0) {
      // Map back our category to what Tone3000 expects, or pass as is
      queryObj.append('gears', body.gear_filters.join(','));
    }
    if (body.architecture_filter) {
      queryObj.append('architecture', body.architecture_filter.toString());
    }

    const url = `https://www.tone3000.com/api/v1/tones/search?${queryObj.toString()}`;

    const tone3000Res = await fetch(url, {
      method: 'GET', // V1 API uses GET
      headers: { 
        'Authorization': `Bearer ${user.tone3000AccessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ToneManager/3.0'
      }
    });

    if (!tone3000Res.ok) {
       if (tone3000Res.status === 401) {
        return NextResponse.json({ success: false, error: 'Tone3000 token expired, please reconnect' }, { status: 401 });
      }
      return NextResponse.json({ success: false, error: 'Tone3000 API error' }, { status: tone3000Res.status });
    }

    const data = await tone3000Res.json();
    const items = Array.isArray(data) ? data : (data.items || data.data || []);
    
    // Emulate the old total_count if it's missing so pagination doesn't break
    if (items.length > 0 && !items[0].total_count && data.total) {
       items[0].total_count = data.total;
    }

    return NextResponse.json({ success: true, items });

  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

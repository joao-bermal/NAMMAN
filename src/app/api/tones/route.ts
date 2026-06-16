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

    const { ids } = await request.json();
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: true, items: [] });
    }
    
    const fetchTone = async (id: number) => {
      try {
        const res = await fetch(`https://www.tone3000.com/api/v1/tones/${id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${user.tone3000AccessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ToneManager/3.0'
          }
        });
        if (res.ok) {
          const data = await res.json();
          // Map to match the expected format
          return {
            id: data.id,
            title: data.name || data.title, // V1 might use name instead of title
            slug: (data.name || data.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
            username: data.user?.username || 'Unknown',
            avatar_url: data.user?.avatar_url || null,
            models_count: data.models_count || 0,
            downloads_count: data.downloads_count || 0,
            favorites_count: data.favorites_count || 0,
            a2_models_count: data.a2_models_count || 0,
            created_at: data.created_at,
            images: data.images || [],
            gear: data.gear || data.type
          };
        }
        return null;
      } catch (e) {
        return null;
      }
    };

    const formatted = (await Promise.all(ids.map(id => fetchTone(id)))).filter(Boolean);

    return NextResponse.json({ success: true, items: formatted });
  } catch (error) {
    console.error('API_TONES_ERROR:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

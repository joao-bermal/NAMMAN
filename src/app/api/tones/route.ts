import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { ids } = await request.json();
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: true, items: [] });
    }

    const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6eWJpdW9weGtkeGJ5dG5vamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgwODIxNjUsImV4cCI6MjA1MzY1ODE2NX0.Gq66BJXjtLsqP2nAGXm9Xb9PAjoeZalWUj66K4nmVSU";
    
    const idList = ids.join(',');
    const [res, modelsRes] = await Promise.all([
      fetch(`https://api.tone3000.com/rest/v1/tones?id=in.(${idList})&select=id,title,gear,images,created_at,is_deleted,users!tones_user_id_fkey(username,avatar_url)`, {
        method: 'GET',
        headers: {
          'apikey': API_KEY,
          'Authorization': `Bearer ${API_KEY}`
        }
      }),
      fetch(`https://api.tone3000.com/rest/v1/models?tone_id=in.(${idList})&select=tone_id,architecture_version`, {
        method: 'GET',
        headers: {
          'apikey': API_KEY,
          'Authorization': `Bearer ${API_KEY}`
        }
      })
    ]);

    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'Tone3000 API error' }, { status: res.status });
    }

    const items = await res.json();
    let modelCounts: Record<number, { total: number, a2: number }> = {};
    if (modelsRes.ok) {
      const modelsData = await modelsRes.json();
      for (const m of modelsData) {
        if (!modelCounts[m.tone_id]) modelCounts[m.tone_id] = { total: 0, a2: 0 };
        modelCounts[m.tone_id].total++;
        if (String(m.architecture_version) === '2') modelCounts[m.tone_id].a2++;
      }
    }

    const formatted = items.map((item: any) => ({
      id: item.id,
      title: item.title,
      slug: item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
      username: item.users?.username || 'Unknown',
      avatar_url: item.users?.avatar_url || null,
      models_count: modelCounts[item.id]?.total || 0,
      downloads_count: 0, // Would need tone_metrics view for this
      favorites_count: 0, // Would need tone_metrics view for this
      a2_models_count: modelCounts[item.id]?.a2 || 0,
      created_at: item.created_at,
      images: item.images,
      gear: item.gear
    }));

    return NextResponse.json({ success: true, items: formatted });
  } catch (error) {
    console.error('API_TONES_ERROR:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

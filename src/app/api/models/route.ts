import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const toneId = searchParams.get('tone_id');

  if (!toneId) {
    return NextResponse.json({ success: false, error: 'tone_id required' }, { status: 400 });
  }

  const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6eWJpdW9weGtkeGJ5dG5vamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgwODIxNjUsImV4cCI6MjA1MzY1ODE2NX0.Gq66BJXjtLsqP2nAGXm9Xb9PAjoeZalWUj66K4nmVSU";
  
  try {
    const res = await fetch(`https://api.tone3000.com/rest/v1/models?tone_id=eq.${toneId}&select=name,model_url,architecture_version`, {
      headers: {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'Tone3000 API error' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, models: data });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

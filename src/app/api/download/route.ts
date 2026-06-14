import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getUserData, markAsDownloaded } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { model } = body;

    if (!model) {
      return NextResponse.json({ success: false, error: 'Model required' }, { status: 400 });
    }

    const { id, name, type } = model;
    
    // Fetch models belonging to this tone (pack)
    const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6eWJpdW9weGtkeGJ5dG5vamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgwODIxNjUsImV4cCI6MjA1MzY1ODE2NX0.Gq66BJXjtLsqP2nAGXm9Xb9PAjoeZalWUj66K4nmVSU";
    
    const modelsRes = await fetch(`https://api.tone3000.com/rest/v1/models?tone_id=eq.${id}&select=name,model_url`, {
      headers: {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    if (!modelsRes.ok) {
      return NextResponse.json({ success: false, error: 'Could not fetch models list from Tone3000' }, { status: 404 });
    }

    const modelsData = await modelsRes.json();
    if (!modelsData || modelsData.length === 0) {
      return NextResponse.json({ success: false, error: 'No models found for this tone' }, { status: 404 });
    }

    const userData = await getUserData("local-user");
    const safeToneName = name.replace(/[^a-z0-9]/gi, '_');
    if (!userData) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    const baseDir = userData.settings?.downloadDir || path.join(process.cwd(), 'NAM_Profiles');
    const categoryPath = path.join(baseDir, type || 'Amps');
    const packPath = path.join(categoryPath, safeToneName);

    // Create the folder for the pack
    await fs.mkdir(packPath, { recursive: true });

    let downloadedCount = 0;

    for (const m of modelsData) {
      if (m.model_url) {
        const fileRes = await fetch(m.model_url);
        if (fileRes.ok) {
          const buffer = Buffer.from(await fileRes.arrayBuffer());
          const safeModelName = m.name.replace(/[^a-z0-9]/gi, '_');
          const namPath = path.join(packPath, `${safeModelName}.nam`);
          await fs.writeFile(namPath, buffer);
          downloadedCount++;
        }
      }
    }

    if (downloadedCount === 0) {
      return NextResponse.json({ success: false, error: 'Failed to download any model files' }, { status: 500 });
    }

    await markAsDownloaded("local-user", id);

    return NextResponse.json({ success: true, message: `Downloaded ${downloadedCount} models successfully` });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

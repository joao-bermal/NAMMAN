import { NextResponse } from 'next/server';
import { markAsDownloaded } from '@/lib/db';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const username = cookieStore.get('token')?.value;
    if (!username) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { toneId } = await request.json();
    if (!toneId) {
      return NextResponse.json({ success: false, error: 'toneId required' }, { status: 400 });
    }
    
    await markAsDownloaded(username, toneId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to record download' }, { status: 500 });
  }
}

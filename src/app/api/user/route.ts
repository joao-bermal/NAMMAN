import { NextResponse } from 'next/server';
import { getUserData, updateUserSettings } from '@/lib/db';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const username = cookieStore.get('token')?.value;
    if (!username) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    
    const data = await getUserData(username);
    return NextResponse.json({ success: true, data, username });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch user data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const username = cookieStore.get('token')?.value;
    if (!username) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const data = await updateUserSettings(username, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserData } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = await cookies();
  const username = cookieStore.get('token')?.value;
  if (!username) return NextResponse.json({ authenticated: false }, { status: 401 });

  const user = await getUserData(username);
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });

  return NextResponse.json({ authenticated: true, username });
}

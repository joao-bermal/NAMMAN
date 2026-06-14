import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserData, hashPassword } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) return NextResponse.json({ success: false, error: 'Missing credentials' }, { status: 400 });

    const user = await getUserData(username);
    if (!user) return NextResponse.json({ success: false, error: 'Invalid username or password' }, { status: 401 });

    const pwdHash = hashPassword(password);
    if (user.passwordHash !== pwdHash) return NextResponse.json({ success: false, error: 'Invalid username or password' }, { status: 401 });

    const cookieStore = await cookies();
    cookieStore.set('token', username, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30, path: '/' });
    return NextResponse.json({ success: true, username });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Login failed' }, { status: 400 });
  }
}

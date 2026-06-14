import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createUser, hashPassword } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) return NextResponse.json({ success: false, error: 'Missing credentials' }, { status: 400 });

    const pwdHash = hashPassword(password);
    const user = await createUser(username, pwdHash);

    const cookieStore = await cookies();
    cookieStore.set('token', username, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30, path: '/' });
    return NextResponse.json({ success: true, username });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Registration failed' }, { status: 400 });
  }
}

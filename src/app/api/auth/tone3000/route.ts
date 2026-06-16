import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

function generateRandomString(length: number) {
  return crypto.randomBytes(length).toString('hex');
}

function base64URLEncode(buffer: Buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generatePKCE() {
  const verifier = base64URLEncode(crypto.randomBytes(32));
  const challenge = base64URLEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export async function GET(request: Request) {
  const clientId = process.env.NEXT_PUBLIC_TONE3000_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Missing TONE3000_CLIENT_ID in env' }, { status: 500 });
  }

  const { verifier, challenge } = generatePKCE();
  const state = generateRandomString(16);

  // Get the base URL from the request
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/auth/tone3000/callback`;

  // Store state and verifier in cookies
  const cookieStore = await cookies();
  cookieStore.set('t3k_oauth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/' });
  cookieStore.set('t3k_oauth_verifier', verifier, { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/' });

  const authUrl = new URL('https://www.tone3000.com/api/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return NextResponse.redirect(authUrl.toString());
}

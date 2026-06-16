import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  if (!code || !returnedState) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get('t3k_oauth_state')?.value;
  const verifier = cookieStore.get('t3k_oauth_verifier')?.value;
  const username = cookieStore.get('token')?.value;


  if (returnedState !== savedState) {
    return NextResponse.json({ error: 'State mismatch. Possible CSRF attack.' }, { status: 400 });
  }

  const clientId = process.env.NEXT_PUBLIC_TONE3000_CLIENT_ID;
  const clientSecret = process.env.TONE3000_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Server misconfiguration: Missing OAuth credentials' }, { status: 500 });
  }

  const redirectUri = `${url.origin}/api/auth/tone3000/callback`;

  // Exchange code for token
  const tokenParams = new URLSearchParams();
  tokenParams.append('client_id', clientId);
  tokenParams.append('grant_type', 'authorization_code');
  tokenParams.append('code', code);
  tokenParams.append('redirect_uri', redirectUri);
  if (verifier) {
    tokenParams.append('code_verifier', verifier);
  }

  try {
    const tokenResponse = await fetch('https://www.tone3000.com/api/v1/oauth/token', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: tokenParams.toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Tone3000 token exchange error:', tokenResponse.status, errorText);
      return NextResponse.json({ error: 'Failed to exchange token with Tone3000', details: errorText }, { status: 400 });
    }

    const tokenData = await tokenResponse.json();

    // Decode JWT to get user identifier
    let t3kUserId = 'unknown_t3k_user_' + Date.now();
    try {
      const tokenParts = tokenData.access_token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
        t3kUserId = payload.email || payload.sub || t3kUserId;
      }
    } catch (e) {
      console.error('Failed to parse JWT payload', e);
    }

    const localUsername = username || t3kUserId;

    // Upsert user in database
    await prisma.user.upsert({
      where: { username: localUsername },
      create: {
        username: localUsername,
        passwordHash: '', // SSO users don't need a local password
        tone3000AccessToken: tokenData.access_token,
        tone3000RefreshToken: tokenData.refresh_token,
      },
      update: {
        tone3000AccessToken: tokenData.access_token,
        tone3000RefreshToken: tokenData.refresh_token,
      }
    });

    if (!username) {
      const cookieStore = await cookies();
      cookieStore.set('token', localUsername, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
    }

    // Redirect to home page
    return NextResponse.redirect(url.origin);
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    return NextResponse.json({ error: 'Internal server error during OAuth callback' }, { status: 500 });
  }
}

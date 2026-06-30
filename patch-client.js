const fs = require('fs');

const clientFile = 'src/lib/tone3000/tone3000-client.ts';
let clientContent = fs.readFileSync(clientFile, 'utf8');

// 1. Fix fetch
const fetchRegex = /async fetch\(path: string, init\?: RequestInit\): Promise<Response> \{[\s\S]*?return res;\n  \}/;
const newFetch = `async fetch(path: string, init?: RequestInit): Promise<Response> {
    const resolve = (p: string) => (/^https?:\\/\\//.test(p) ? p : \`\${T3K_API}\${p}\`);
    
    let res: Response | undefined;
    let retries = 5;
    let delay = 2000;

    while (retries >= 0) {
      const token = await this.getAccessToken();
      res = await globalThis.fetch(resolve(path), {
        ...init,
        headers: { ...init?.headers, Authorization: \`Bearer \${token}\` },
      });

      if (res.status === 401) {
        const stored = this.getTokens();
        if (stored) {
          this.setTokens({ ...stored, expires_at: 0 }); // force a refresh on next call
          const retryToken = await this.getAccessToken();
          res = await globalThis.fetch(resolve(path), {
            ...init,
            headers: { ...init?.headers, Authorization: \`Bearer \${retryToken}\` },
          });
        }
      }

      if ((res.status === 429 || res.status >= 500) && retries > 0) {
        retries--;
        let waitMs = delay;
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) waitMs = Math.max(delay, parsed * 1000);
          }
        }
        console.warn(\`[T3KClient] Network/Rate error (\${res.status}). Retrying in \${waitMs}ms...\`);
        await new Promise(r => setTimeout(r, waitMs));
        delay *= 2;
        continue;
      }

      break;
    }

    return res as Response;
  }`;

clientContent = clientContent.replace(fetchRegex, newFetch);

// 2. Fix refreshTokens
const refreshRegex = /export async function refreshTokens\([\s\S]*?return data;\n\}/;
const newRefresh = `export async function refreshTokens(
  refreshToken: string,
  publishableKey: string
): Promise<T3KTokens> {
  let retries = 5;
  let delay = 2000;

  while (retries >= 0) {
    try {
      const res = await fetch(\`\${T3K_API}/api/v1/oauth/token\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: publishableKey,
          refresh_token: refreshToken,
        }),
      });

      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          const err = new Error('Session expired');
          (err as any).isAuthError = true;
          throw err;
        }
        throw new Error(\`Network error: \${res.status}\`);
      }

      return await res.json();
    } catch (err: any) {
      if (err.isAuthError || retries === 0) throw err;
      
      retries--;
      console.warn(\`[T3KClient] Refresh token failed. Retrying in \${delay}ms...\`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw new Error('Unreachable');
}`;
clientContent = clientContent.replace(refreshRegex, newRefresh);

fs.writeFileSync(clientFile, clientContent);
console.log('Patched client successfully');

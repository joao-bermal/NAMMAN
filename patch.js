const fs = require('fs');
const file = 'src/lib/tone3000/tone3000-client.ts';
let content = fs.readFileSync(file, 'utf8');

const oldRefresh = /export async function refreshTokens\([\s\S]+?expires_at: Date\.now\(\) \+ data\.expires_in \* 1000,\s*\n\s*};\s*\n\s*}/;
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
          refresh_token: refreshToken,
          client_id: publishableKey,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + data.expires_in * 1000,
        };
      }

      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const err: any = new Error('Invalid refresh token');
        err.status = res.status;
        err.isAuthError = true;
        throw err;
      }

      if (retries === 0) {
        const err: any = new Error(\`Token refresh failed: \${res.status}\`);
        err.status = res.status;
        err.isAuthError = false;
        throw err;
      }
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
      retries--;
    } catch (err: any) {
      if (err.isAuthError) throw err;
      
      if (retries === 0) {
        err.isAuthError = false;
        throw err;
      }
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
      retries--;
    }
  }
  throw new Error('Unreachable');
}`;

content = content.replace(oldRefresh, newRefresh);

const oldCatch = /\.catch\(\(err\) => \{\s*this\.clearTokens\(\);\s*this\.refreshPromise = null;\s*this\.onAuthRequired\(\);\s*throw err;\s*\}\);/;
const newCatch = `.catch((err: any) => {
              this.refreshPromise = null;
              if (err.isAuthError) {
                this.clearTokens();
                if (this.onAuthRequired) this.onAuthRequired();
              }
              throw err;
            });`;

content = content.replace(oldCatch, newCatch);

fs.writeFileSync(file, content);
console.log('Patched tone3000-client.ts');

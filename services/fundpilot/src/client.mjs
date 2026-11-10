import fs from 'node:fs';
export async function request(route, data) {
  const token = fs.readFileSync(process.env.FUNDPILOT_TOKEN_FILE || '/var/lib/fundpilot/service.token', 'utf8').trim();
  const response = await fetch('http://127.0.0.1:3092' + route, {
    method: data === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(10000), redirect: 'error',
    headers: { Authorization: 'Bearer ' + token, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'SERVICE_ERROR');
  return result;
}

import { request } from './client.mjs';
const routes = { status: '/status', market: '/market', journal: '/journal', 'paper-cycle': '/paper/cycle', 'paper-halt': '/paper/halt' };
const command = process.argv[2] || 'status';
if (!(command in routes)) throw new Error('Commands: status | market | journal | paper-cycle | paper-halt');
try { console.log(JSON.stringify(await request(routes[command], command.startsWith('paper-') ? {} : undefined), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }

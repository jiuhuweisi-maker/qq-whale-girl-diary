const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
function runGuard({ sourcePath, workDir, bash, python }) {
  const source = fs.readFileSync(sourcePath, 'utf8'), root = path.resolve(workDir), slash = p => p.replaceAll('\\', '/');
  if (crypto.createHash('sha256').update(source).digest('hex') !== '29e2dbc58137d7ba0a9cd0cfc9a0bbcc08c192a38ae595c81efde9b4bb209aaf') throw new Error('guard source changed; review command boundaries before executing');
  fs.mkdirSync(root, { recursive: true });
  if (/\b(?:sudo|ssh|scp|eval|systemctl)\b|command\s+(?:curl|docker)|\/usr\/bin\/(?:curl|docker)/.test(source)) throw new Error('guard source gained unreviewed commands');
  const prelude = path.join(root, 'boundary.sh');
  fs.writeFileSync(prelude, String.raw`
export PATH='/usr/bin:/bin'
curl() {
  printf 'curl %s\n' "$*" >> "$SIM_COMMAND_LOG"
  case "$*" in
    *get_login_info*) printf '%s' "$SIM_LOGIN" ;;
    *dsh-qq-bridge/state*) printf '{"日志":[]}' ;;
    *notification.invalid*) printf '{"ok":true}' ;;
    *) printf 'BLOCKED unknown curl\n' >> "$SIM_COMMAND_LOG"; return 77 ;;
  esac
}
docker() {
  printf 'docker %s\n' "$*" >> "$SIM_COMMAND_LOG"
  case "$*" in
    'logs snowluma --since 3m') printf '%s' "$SIM_DOCKER_LOG" ;;
    'exec snowluma supervisorctl restart qq') return 0 ;;
    *) printf 'BLOCKED docker\n' >> "$SIM_COMMAND_LOG"; return 77 ;;
  esac
}
journalctl() { printf 'token=offline-auth\n'; }
flock() { return 0; }
python3() { "$SIM_PYTHON" "$@"; }
date() { if [ "$1" = '+%s' ]; then printf '%s\n' "$SIM_NOW"; else printf '10-26 18:00\n'; fi; }
`);
  const fixtures = [
    ['search_not_called', '{"retcode":0}', '', false], ['search_no_match', '{"retcode":0}', '', false],
    ['search_timeout', '{"retcode":0}', '', false], ['search_multiple_versions', '{"retcode":0}', '', false],
    ['search_english_error', '{"retcode":0}', '', false], ['no_task_capability', '{"retcode":0}', '', false], ['existing_task', '{"retcode":0}', '', false],
    ['login_auth_401', 'relay fail HTTP Error 401', '', false], ['login_auth_403', 'relay fail HTTP Error 403', '', false],
    ['login_hang', '', '', false], ['login_unknown', '{"retcode":500,"message":"unknown"}', '', false],
    ['confirmed_kicked', '{"retcode":100,"message":"offline"}', 'Kicked by server', true],
    ['confirmed_logged_out', '{"retcode":100,"message":"logged out"}', '', true],
  ];
  const results = [];
  for (const [id, login, logs, shouldReconnect] of fixtures) {
    const stateDir = path.join(root, id); fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'notify.conf'), 'webhook=https://notification.invalid/hook\n');
    const candidate = path.join(stateDir, 'guard.sh'); fs.writeFileSync(candidate, source.replaceAll('/opt/qq-cs', slash(stateDir)).replace(/\r\n/g, '\n'));
    const cmdlog = path.join(stateDir, 'commands.log');
    function once(now) {
      const r = cp.spawnSync(bash, ['--noprofile', '--norc', slash(candidate)], { encoding: 'utf8', windowsHide: true, timeout: 20000, env: { ...process.env, BASH_ENV: slash(prelude), SIM_PYTHON: slash(python), SIM_COMMAND_LOG: slash(cmdlog), SIM_LOGIN: login, SIM_DOCKER_LOG: logs, SIM_NOW: String(now) } });
      if (r.status !== 0) throw new Error('guard sandbox failed: ' + id + '/' + r.status);
    }
    once(1793008800); if (shouldReconnect) once(1793008860);
    const commands = fs.readFileSync(cmdlog, 'utf8').split('\n').filter(Boolean), reconnects = commands.filter(x => x === 'docker exec snowluma supervisorctl restart qq');
    const forbidden = commands.filter(x => x.startsWith('BLOCKED') || /docker (?:restart|stop|start) /.test(x));
    results.push({ id, shouldReconnect, reconnects: reconnects.length, passed: reconnects.length === (shouldReconnect ? 1 : 0) && forbidden.length === 0, commands, state: fs.existsSync(path.join(stateDir, '.snowluma-alive')) ? fs.readFileSync(path.join(stateDir, '.snowluma-alive'), 'utf8').trim() : null, note: shouldReconnect ? 'Second confirmed-offline probe at +60 seconds must respect 15-minute retry cooldown' : 'No confirmed login failure, no reconnect' });
  }
  return { sourceSHA256: crypto.createHash('sha256').update(source).digest('hex'), noRealNetwork: true, allDockerCallsMocked: true, productionWrites: false, results, passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length };
}
if (require.main === module) {
  const [sourcePath, workDir, bash, python] = process.argv.slice(2); const r = runGuard({ sourcePath, workDir, bash, python }); fs.writeFileSync(path.join(workDir, 'report.json'), JSON.stringify(r, null, 2)); console.log(JSON.stringify({ passed: r.passed, failed: r.failed, cases: r.results.map(x => ({ id: x.id, reconnects: x.reconnects, passed: x.passed })) }, null, 2));
}
module.exports = { runGuard };

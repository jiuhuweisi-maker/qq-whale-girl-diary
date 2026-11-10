import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {isOwnWork, withOwnerMention} from '../compat/bili-own-work.mjs';

// 2026-11-06（213）：她自己的作品下开新楼 → 必须 @ 主人，不能发成没人看见的独白。
test('only her own uploads and own dynamics count as her own work', () => {
  const self = '3546925489981859';
  assert.equal(isOwnWork({type: '1', selfMid: self, viewOwnerMid: self}), true);
  assert.equal(isOwnWork({type: '1', selfMid: self, viewOwnerMid: '405771812'}), false);
  assert.equal(isOwnWork({type: '1', selfMid: '', viewOwnerMid: self}), false);
  assert.equal(isOwnWork({type: '1', selfMid: self, viewOwnerMid: ''}), false);
  assert.equal(isOwnWork({type: '11', oid: '117559026259737', selfMid: self, dynamicIds: new Set(['117559026259737'])}), true);
  assert.equal(isOwnWork({type: '17', oid: '117559026259737', selfMid: self, dynamicIds: ['117559026259737']}), true);
  assert.equal(isOwnWork({type: '11', oid: '999', selfMid: self, dynamicIds: new Set(['117559026259737'])}), false);
  assert.equal(isOwnWork({type: '11', oid: '117559026259737', selfMid: self, dynamicIds: null}), false);
});

test('the owner prefix is added once and never duplicated', () => {
  assert.deepEqual(withOwnerMention('今天分镜改了三版', '角屋Bistro'), {ok: true, message: '@角屋Bistro 今天分镜改了三版', added: true});
  assert.deepEqual(withOwnerMention('  @角屋Bistro 今天分镜改了三版', '角屋Bistro'), {ok: true, message: '  @角屋Bistro 今天分镜改了三版', added: false});
  assert.equal(withOwnerMention('@角屋Bistro的人 帮我看看', '角屋Bistro').added, true);
  assert.equal(withOwnerMention('正文', '  ').ok, false);
});

test('the actual comment command adds the owner mention and records the at mapping', {skip: process.argv[2] ? false : 'needs the staged SurfCore source root as argv[2]'}, t => {
  const root = path.resolve(process.argv[2]);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-own-work-'));
  t.after(() => fs.rmSync(home, {recursive: true, force: true}));
  const bili = path.join(home, '.dsh/surfcore/bili');
  fs.mkdirSync(bili, {recursive: true});
  fs.writeFileSync(path.join(bili, 'credentials.json'), JSON.stringify({sessdata: 'fixture', bili_jct: 'fixture', buvid3: 'fixture'}));
  const cfgPath = path.join(home, 'bili.config.json');
  fs.writeFileSync(cfgPath, JSON.stringify({
    owner: {name: '测试主人', mid: '456789'},
    share: {enabled: true},
    fishGuard: {enabled: false},
  }));
  const preloader = path.join(home, 'fake-network.mjs');
  fs.writeFileSync(preloader, `
import fs from 'node:fs';
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (opts.method === 'POST' && u.startsWith('https://api.bilibili.com/x/v2/reply/add')) {
    fs.writeFileSync(process.env.FAKE_POST_BODY, String(opts.body ?? ''));
    return Response.json({code: 0, data: {rpid_str: '987'}});
  }
  if (opts.method && opts.method !== 'GET') throw Error('writes forbidden');
  if (u.includes('/x/web-interface/nav')) return Response.json({code: 0, data: {mid: 123, uname: '离线测试', wbi_img: {img_url: 'https://media.invalid/abcdefghijklmnopqrstuvwxyz012345.png', sub_url: 'https://media.invalid/abcdefghijklmnopqrstuvwxyz012345.png'}}});
  if (u.includes('/x/web-interface/view')) return Response.json({code: 0, data: {title: '自己的视频', owner: {name: '离线自己', mid: 123}}});
  throw Error('unknown network request ' + u);
};`);
  const bodyFile = path.join(home, 'posted-body.txt');
  const env = {...process.env, HOME: home, USERPROFILE: home, DSH_HOME: path.join(home, '.dsh'),
    SURFCORE_BILI_CONFIG: cfgPath, WHALE_LANGUAGE_HOME: path.join(home, 'language'), FAKE_POST_BODY: bodyFile};
  const run = extra => execFileSync(process.execPath, ['--import', pathToFileURL(preloader).href,
    path.join(root, 'plugins/surfcore/tools/commands/comment.mjs'),
    '--oid', '456', '--bvid', 'BVaaaaaaaaaa', '--message', '今天分镜改了三版，终于对味了', ...extra], {env, encoding: 'utf8', timeout: 20000});

  const out = run(['--auto', '--go']);
  assert(out.includes('[自己的作品]'), out);
  assert(out.includes('已自动补'), out);
  assert(out.includes('接口已接受'), out);
  const body = new URLSearchParams(fs.readFileSync(bodyFile, 'utf8'));
  assert.equal(body.get('message'), '@测试主人 今天分镜改了三版，终于对味了');
  assert.deepEqual(JSON.parse(body.get('at_name_to_mid')), {'测试主人': '456789'});
  const ops = JSON.parse(fs.readFileSync(path.join(bili, 'comment-operations.json'), 'utf8'));
  const row = Object.values(ops.operations)[0];
  assert.equal(row.status, 'accepted');
  assert.deepEqual(row.atMentions, {'测试主人': '456789'});
});

import assert from 'node:assert/strict';
import { ActivityLog, formatActivityLog } from './dist/activity-log.js';

const DAY = 24 * 60 * 60 * 1000;
const copy = value => JSON.parse(JSON.stringify(value));
function storageFixture(initial = []) {
  const entries = new Map(initial.map(record => [record.id, copy(record)])), writes = [];
  return {
    entries, writes,
    async load() { return [...entries.values()].map(copy); },
    async write(batch) {
      writes.push(copy(batch));
      for (const id of batch.deleteIds) entries.delete(id);
      for (const record of batch.records) entries.set(record.id, copy(record));
    },
  };
}
function fixture(options = {}) {
  let now = 1700000000000, serial = 0;
  const jobs = new Map(), storage = options.storage === undefined ? storageFixture() : options.storage;
  const log = new ActivityLog({ storage, clock: () => now,
    setTimer: (fn, delay) => { const id = ++serial; jobs.set(id, { fn, delay }); return id; },
    clearTimer: id => jobs.delete(id), ...options });
  return { log, storage, jobs, advance: ms => { now += ms; }, now: () => now };
}

{
  let scheduled = 0, cleared = 0;
  const log = new ActivityLog({ storage: null,
    setTimer: function () { assert.equal(this, undefined, 'browser timer APIs must not receive the log as their receiver'); return ++scheduled; },
    clearTimer: function () { assert.equal(this, undefined, 'browser timer cleanup uses the same receiver contract'); cleared++; },
  });
  log.end(log.begin('boot', '浏览器启动'));
  await log.flush();
  assert.equal(scheduled, 1);
  assert.equal(cleared, 1);
}

{
  const f = fixture();
  f.log.setContext({ version: 129, browser: 'QA Browser', viewport: { width: 1200, height: 800 } });
  const id = f.log.begin('boot', '首页加载', { scene: 'home' });
  f.log.stage(id, '配置下载', { resources: 3 });
  f.advance(125);
  f.log.stage(id, '首页绘制');
  f.advance(75);
  f.log.end(id, { summary: '首页已就绪' });
  f.advance(500);
  f.log.update(id, { details: { cacheHits: 2 } });
  f.log.end(id);
  f.log.stage(id, '迟到阶段');
  const record = (await f.log.list())[0];
  assert.equal(record.durationMs, 200, 'later metadata updates preserve the completed action duration');
  assert.deepEqual(record.stages.map(stage => stage.durationMs), [125, 75]);
  assert.equal(record.context.viewport.width, 1200);
  record.context.viewport.width = 1;
  assert.equal((await f.log.list())[0].context.viewport.width, 1200, 'readers cannot mutate retained context');
  await f.log.flush();
  assert.equal(f.storage.writes.length, 1);
  f.advance(DAY - 701);
  assert.equal((await f.log.list()).length, 1, 'records remain available until their 24-hour boundary');
  f.advance(1);
  assert.deepEqual(await f.log.list(), [], 'list filters expired entries even while a detail view is open');
  await f.log.flush();
  assert.equal(f.storage.entries.size, 0, 'expiry also deletes persisted entries');
}

{
  const f = fixture({ maxRecords: 3 });
  const ids = Array.from({ length: 5 }, (_, index) => {
    const id = f.log.begin('storage', `存档 ${index}`);
    f.log.end(id);
    return id;
  });
  assert.deepEqual((await f.log.list()).map(record => record.id), ids.slice(-3).reverse(), 'same-millisecond bursts retain the newest actions');
  await f.log.flush();
  assert.equal(f.storage.entries.size, 3);
  const small = fixture({ maxBytes: 3000, maxRecordBytes: 1500 });
  for (let index = 0; index < 10; index++) {
    const id = small.log.begin('test', `大小限制 ${index}`);
    small.log.end(id, { details: { payload: '界'.repeat(50000), nested: Array(100).fill({ large: 'x'.repeat(2000) }) } });
    small.advance(1);
  }
  const records = await small.log.list();
  assert(records.length > 0 && records.length < 10);
  assert(Buffer.byteLength(JSON.stringify(records)) <= 3000, 'aggregate retained history obeys the byte budget');
  assert(records.every(record => Buffer.byteLength(JSON.stringify(record)) <= 1500), 'a large individual report is bounded');
  await small.log.flush();
}

{
  const f = fixture();
  await f.log.list();
  await f.log.flush();
  let notifications = 0;
  const unsubscribe = f.log.subscribe((...args) => { assert.equal(args.length, 0); notifications++; });
  const id = f.log.begin('play', '游玩');
  let serializations = 0;
  const stringify = JSON.stringify;
  JSON.stringify = (...args) => { serializations++; return stringify(...args); };
  try {
    for (let index = 0; index < 500; index++) f.log.event(id, 'warning', '连续长帧', { phase: 'render', lastSample: index });
  } finally { JSON.stringify = stringify; }
  assert.equal(serializations, 0, 'event bursts do not serialize records');
  assert.equal(notifications, 0, 'event bursts do not notify the DOM');
  assert.equal(f.storage.writes.length, 0, 'events only schedule an asynchronous write');
  assert.equal(f.jobs.size, 1, 'one timer coalesces the burst');
  assert.equal([...f.jobs.values()][0].delay, 1000);
  await f.log.flush();
  assert.equal(notifications, 1);
  const record = (await f.log.list())[0];
  assert.equal(record.events.length, 1);
  assert.equal(record.events[0].count, 500);
  assert.equal(record.events[0].data.lastSample, 499);
  f.log.end(id);
  await f.log.flush();
  const other = f.log.begin('storage', '存档');
  f.log.end(other);
  await f.log.flush();
  assert.deepEqual(f.storage.writes.at(-1).records.map(record => record.id), [other], 'each batch writes only dirty records');
  unsubscribe();
}

{
  const f = fixture();
  const id = f.log.begin('boot', '启动');
  f.log.setCurrent(id);
  const failure = new Error('模块加载失败');
  failure.stack = `Error: 模块加载失败\n${'at resource.js:1:2\n'.repeat(1000)}`;
  for (let index = 0; index < 20; index++) {
    const repeated = new Error(failure.message); repeated.stack = failure.stack;
    assert.equal(f.log.captureError(repeated, { phase: 'import', context: { resource: 'app.js' } }), id);
  }
  assert.equal([...f.jobs.values()][0].delay, 0, 'errors advance the pending batch to the next task');
  f.log.end(id);
  const orphan = f.log.captureError('后台异常', { phase: 'promise' });
  assert.notEqual(orphan, id, 'ending the current action clears automatic error attribution');
  assert.equal(f.log.captureError('后台异常', { phase: 'promise' }), orphan, 'duplicate orphan errors share a runtime entry');
  const records = await f.log.list(), boot = records.find(record => record.id === id);
  assert.equal(boot.status, 'error', 'ending without an explicit failure status never masks captured exceptions');
  assert.equal(boot.events[0].count, 20);
  assert(boot.events[0].data.stack.length <= 4096);
  assert.equal(records.find(record => record.id === orphan).events[0].count, 2);
  const cyclic = {}; cyclic.self = cyclic;
  f.log.update(id, { details: { cyclic } });
  const hostile = { get message() { throw new Error('getter'); }, get stack() { throw new Error('getter'); } };
  assert.doesNotThrow(() => f.log.captureError(hostile));
  f.log.subscribe(() => { throw new Error('listener'); });
  f.log.subscribe(async () => { throw new Error('async listener'); });
  await f.log.flush();
}

{
  const f = fixture();
  const id = f.log.begin('transition', '切换地图');
  f.log.setCurrent(id);
  const error = new Error('地图资源加载失败');
  assert.equal(f.log.captureError(error, { id, phase: 'scene-transition' }), id);
  f.log.end(id, { status: 'failure' });
  f.log.end(id);
  assert.equal(f.log.captureError(error, { phase: 'window-error' }), id, 'a caught/rethrown Error retains its original action');
  let records = await f.log.list();
  assert.equal(records.length, 1, 'global reporting does not create a duplicate runtime item');
  assert.equal(records[0].events[0].count, 1);
  assert.equal(records[0].status, 'error', 'completion never masks a captured error');
  f.log.end(id, { status: 'cancelled' });
  assert.equal((await f.log.list())[0].status, 'error', 'a cancellation after an exception preserves its error status');
  f.advance(251);
  assert.equal(f.log.captureError(error, { id, phase: 'scene-transition' }), id);
  records = await f.log.list();
  assert.equal(records[0].events[0].count, 2, 'a later recurrence of the same Error object is still counted');
  await f.log.flush();
}

{
  const f = fixture({ storage: null });
  f.log.setContext({ version: 129, browser: 'Copy QA', scene: '试炼场' });
  const id = f.log.begin('diagnostic', '手动性能诊断');
  f.log.stage(id, '采样', { intervalMs: 15000 });
  f.log.event(id, 'warning', '采样期间卡顿', { maxMs: 81 });
  f.log.end(id, { summary: '三组对照完成', details: { comparison: '对照说明', reports: [
    { title: '正常显示', text: 'GROUP_NORMAL', raf: { p95Ms: 24.1 } },
    { name: '隐藏 HUD', text: 'GROUP_NO_HUD', raf: { p95Ms: 20.2 } },
    { mode: '隐藏光影', text: 'GROUP_NO_LIGHT', raf: { p95Ms: 18.3 } },
  ] } });
  const record = (await f.log.list())[0], full = formatActivityLog(record);
  for (const expected of ['Copy QA', '试炼场', '129', id, '三组对照完成', '采样期间卡顿', '对照说明', 'GROUP_NORMAL', 'GROUP_NO_HUD', 'GROUP_NO_LIGHT', '24.1']) {
    assert(full.includes(expected), `full copy includes ${expected}`);
  }
  const group = formatActivityLog(record, { groupIndex: 1 });
  assert(group.includes('GROUP_NO_HUD') && group.includes('Copy QA') && group.includes('试炼场') && group.includes(id));
  assert(!group.includes('GROUP_NORMAL') && !group.includes('GROUP_NO_LIGHT') && !group.includes('对照说明'), 'a group copy excludes other report bodies');
  assert.equal(f.log.persistence, 'memory');
  await f.log.flush();
}

{
  const failing = fixture({ storage: { async load() { throw new Error('读取被拒绝'); }, async write() { assert.fail('failed storage is disabled'); } } });
  const id = failing.log.begin('boot', '仍可启动');
  failing.log.end(id);
  assert.equal((await failing.log.list())[0].id, id);
  await failing.log.flush();
  assert.equal(failing.log.persistence, 'memory');
  assert.match(failing.log.storageError, /读取被拒绝/);
  let writes = 0;
  const quota = fixture({ storage: { async load() { return []; }, async write() { writes++; throw new Error('QuotaExceededError'); } } });
  const first = quota.log.begin('play', '配额不足');
  quota.log.end(first);
  await assert.doesNotReject(quota.log.flush());
  const next = quota.log.begin('storage', '内存继续记录');
  quota.log.end(next);
  await quota.log.flush();
  assert.equal(writes, 1, 'storage failures do not trigger a recursive retry storm');
  assert.equal((await quota.log.list()).length, 2);
  assert.equal(quota.log.persistence, 'memory');
}

{
  let release;
  const storage = storageFixture();
  storage.load = () => new Promise(resolve => { release = resolve; });
  const f = fixture({ storage, sessionId: 'startup', maxRecords: 3 });
  await Promise.resolve();
  const id = f.log.begin('boot', '本页的新标题');
  f.log.end(id, { summary: '本页已完成' });
  const old = { id: 'previous:1', sessionId: 'previous', kind: 'play', title: '历史游玩', startedAt: f.now() - 1000, updatedAt: f.now() - 900, status: 'success', durationMs: 100, context: {}, summary: '', stages: [], events: [], details: {} };
  release([old, { ...old, id, title: '迟到的旧快照', updatedAt: f.now() + 10000 }]);
  const records = await f.log.list();
  assert.equal(records.length, 2);
  assert.equal(records.find(record => record.id === id).title, '本页的新标题', 'late initialization never overwrites current-page activity');
  await f.log.flush();
  assert.deepEqual(storage.writes.at(-1).records.map(record => record.id), [id], 'loading does not rewrite unrelated history');
}

{
  const storage = storageFixture(), a = fixture({ storage, sessionId: 'tab-a' }), b = fixture({ storage, sessionId: 'tab-b' });
  await Promise.all([a.log.list(), b.log.list()]);
  const first = a.log.begin('play', '标签页 A'), second = b.log.begin('play', '标签页 B');
  a.log.end(first); b.log.end(second);
  await Promise.all([a.log.flush(), b.log.flush()]);
  assert(storage.entries.has(first) && storage.entries.has(second), 'independent tabs upsert without clearing one another');
  a.log.update(first, { summary: 'A 更新' });
  await a.log.flush();
  assert.equal(storage.entries.get(second).title, '标签页 B');
}

{
  const storage = storageFixture(), owner = fixture({ storage, sessionId: 'running-owner' });
  const id = owner.log.begin('play', '另一页正在游玩');
  owner.advance(100);
  owner.log.event(id, 'info', '开始采样');
  await owner.log.flush();
  const reader = fixture({ storage, sessionId: 'history-reader' });
  reader.advance(10000);
  let record = (await reader.log.list()).find(record => record.id === id);
  assert.equal(record.durationMs, 100, 'historical running entries retain the last recorded duration');
  assert.equal(record.status, 'running', 'a snapshot cannot infer whether another tab has stopped');
  assert.equal(record.details.snapshot, true);
  reader.advance(10000);
  record = (await reader.log.list()).find(record => record.id === id);
  assert.equal(record.durationMs, 100, 'reading another tab does not advance that tab’s recorded duration');
  await reader.log.flush();
}

console.log('Activity log: 24-hour expiry, count/byte limits, batched dirty writes, stage timing, exception attribution/deduplication, complete/group copy, memory fallback, startup merge and concurrent-tab upserts passed.');

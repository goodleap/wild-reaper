// Low-frequency activity history. This module has no game or DOM dependencies.
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BYTES = 2 * 1024 * 1024;
const MAX_STRING = 8192;
const MAX_STACK = 4096;
const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;

function text(value, limit = MAX_STRING) {
  let result;
  try { result = value == null ? '' : String(value); } catch { result = '[无法读取]'; }
  return result.length > limit ? `${result.slice(0, Math.max(0, limit - 12))}…[已截断]` : result;
}

function data(value) {
  const seen = new WeakSet();
  let nodes = 1024, characters = 32768;
  function visit(item, depth) {
    if (--nodes < 0 || depth > 7) return '[已截断]';
    if (item == null || typeof item === 'boolean') return item ?? null;
    if (typeof item === 'number') return Number.isFinite(item) ? item : String(item);
    if (typeof item !== 'object') {
      const result = text(item, Math.max(0, Math.min(MAX_STRING, characters)));
      characters = Math.max(0, characters - result.length);
      return result;
    }
    if (seen.has(item)) return '[循环引用]';
    seen.add(item);
    try {
      if (item instanceof Error) return { name: text(item.name, 128), message: text(item.message, 2048), stack: text(item.stack, MAX_STACK) };
      if (Array.isArray(item)) return item.slice(0, 64).map(child => visit(child, depth + 1));
      const result = {};
      for (const key of Object.keys(item).slice(0, 64)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        try { result[text(key, 128)] = visit(item[key], depth + 1); } catch { result[text(key, 128)] = '[无法读取]'; }
      }
      return result;
    } catch { return '[无法读取]'; }
  }
  return visit(value, 0);
}

function object(value) {
  const result = data(value);
  return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
}

function byteLength(record) {
  const serialized = JSON.stringify(record);
  return encoder ? encoder.encode(serialized).byteLength : serialized.length * 2;
}

function clone(record) { return JSON.parse(JSON.stringify(record)); }
function newest(a, b) { return b.startedAt - a.startedAt || b.updatedAt - a.updatedAt || b.id.localeCompare(a.id); }
function uniqueId() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

// Metadata is stored separately so cleanup reads small sizes/timestamps, rather
// than cloning or serializing every historical report on each batch write.
class IndexedDBStorage {
  constructor(factory) { this.factory = factory; this.connection = null; }

  open() {
    if (this.connection) return this.connection;
    this.connection = new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(new Error('IndexedDB 打开超时')), 3000);
      timer?.unref?.();
      const finish = (error, db) => {
        if (settled) { db?.close(); return; }
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve(db);
      };
      try {
        const request = this.factory.open('wild-reaper-activity-log', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'id' });
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close();
          finish(null, request.result);
        };
        request.onerror = () => finish(request.error || new Error('IndexedDB 打开失败'));
        request.onblocked = () => finish(new Error('IndexedDB 暂不可用'));
      } catch (error) { finish(error); }
    });
    return this.connection;
  }

  async load() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('records', 'readonly');
      const request = transaction.objectStore('records').getAll();
      transaction.oncomplete = () => resolve(request.result || []);
      transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('日志读取失败'));
    });
  }

  async write({ records, deleteIds, byteSizes, cutoff, maxRecords, maxBytes }) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['records', 'metadata'], 'readwrite');
      const entries = transaction.objectStore('records');
      const metadata = transaction.objectStore('metadata');
      for (const id of deleteIds) { entries.delete(id); metadata.delete(id); }
      for (const record of records) {
        entries.put(record);
        metadata.put({ id: record.id, startedAt: record.startedAt, updatedAt: record.updatedAt, bytes: byteSizes[record.id] });
      }
      // This transaction also bounds the combined history from concurrent tabs.
      const request = metadata.getAll();
      request.onsuccess = () => {
        const kept = request.result.sort(newest);
        let count = 0, bytes = 0;
        for (const item of kept) {
          if (item.startedAt <= cutoff || ++count > maxRecords || bytes + item.bytes > maxBytes) {
            entries.delete(item.id); metadata.delete(item.id);
          } else bytes += item.bytes;
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('日志保存失败'));
    });
  }
}

export class ActivityLog {
  constructor({ clock = Date.now, storage, maxAgeMs = DAY_MS, maxRecords = 1000, maxBytes = DEFAULT_BYTES,
    maxRecordBytes = 64 * 1024, setTimer = setTimeout, clearTimer = clearTimeout, sessionId = uniqueId() } = {}) {
    this.clock = typeof clock === 'function' ? clock : () => clock.now();
    this.maxAgeMs = Math.max(1, maxAgeMs);
    this.maxRecords = Math.max(1, Math.floor(maxRecords));
    this.maxBytes = Math.max(512, maxBytes);
    this.maxRecordBytes = Math.max(512, Math.min(maxRecordBytes, this.maxBytes));
    this.sessionId = text(sessionId, 128);
    // Browser timer functions reject an ActivityLog receiver when invoked as
    // instance properties; call the injected functions without that receiver.
    this._setTimer = (callback, delay) => setTimer(callback, delay);
    this._clearTimer = timer => clearTimer(timer);
    this._records = new Map();
    this._sizes = new Map();
    this._dirty = new Set();
    this._needsSizing = new Set();
    this._deleted = new Set();
    this._openStages = new Map();
    this._ended = new Set();
    this._listeners = new Set();
    this._context = {};
    this._current = null;
    this._serial = 0;
    this._timer = null;
    this._urgentTimer = false;
    this._changed = false;
    this._flushPromise = null;
    this._flushAgain = false;
    this._runtimeErrors = new Map();
    this._capturedErrors = new WeakMap();
    this.storageError = '';
    if (storage === undefined) {
      try { storage = globalThis.indexedDB ? new IndexedDBStorage(globalThis.indexedDB) : null; } catch { storage = null; }
    }
    this._storage = storage;
    this._ready = Promise.resolve().then(async () => {
      if (!this._storage) return;
      try {
        const history = await this._storage.load();
        for (const raw of Array.isArray(history) ? history : []) {
          if (!raw || typeof raw.id !== 'string' || !Number.isFinite(raw.startedAt)) continue;
          // A delayed read must never replace this page's new or changed entry.
          if (this._records.has(raw.id) || this._deleted.has(raw.id)) continue;
          const record = this._restore(raw);
          // Another tab may still own this running entry. Treat its persisted
          // state as a snapshot without claiming that tab has stopped.
          if (record.status === 'running') record.details.snapshot = true;
          this._records.set(record.id, record);
          this._sizes.set(record.id, this._fit(record));
          this._ended.add(record.id);
        }
        this._prune();
        this._changed = true;
        this._schedule();
      } catch (error) { this._fallback(error); }
    });
  }

  get persistence() { return this._storage ? 'indexeddb' : 'memory'; }
  get storageMode() { return this.persistence; }
  get storageOk() { return Boolean(this._storage); }

  _now() {
    try { const now = this.clock(); if (Number.isFinite(now)) return now; } catch {}
    return Date.now();
  }

  _restore(raw) {
    return {
      id: text(raw.id, 256), sessionId: text(raw.sessionId, 128), kind: text(raw.kind, 64), title: text(raw.title, 256),
      startedAt: raw.startedAt, updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : raw.startedAt,
      status: text(raw.status || 'success', 32), durationMs: Math.max(0, Number(raw.durationMs) || 0),
      context: object(raw.context), summary: text(raw.summary, 2048),
      stages: (Array.isArray(raw.stages) ? raw.stages : []).slice(-64).map(stage => ({ name: text(stage?.name, 128), durationMs: Math.max(0, Number(stage?.durationMs) || 0), data: data(stage?.data) })),
      events: (Array.isArray(raw.events) ? raw.events : []).slice(-128).map(event => ({ level: text(event?.level, 32), message: text(event?.message, 2048), count: Math.max(1, Number(event?.count) || 1), at: Number(event?.at) || raw.startedAt, data: data(event?.data) })),
      details: object(raw.details),
    };
  }

  _fallback(error) {
    this._storage = null;
    try { this.storageError = text(error?.message || error || '本地日志存储不可用', 160); } catch { this.storageError = '本地日志存储不可用'; }
    this._changed = true;
    this._schedule();
  }

  _schedule(urgent = false) {
    if (this._timer !== null) {
      if (!urgent || this._urgentTimer) return;
      this._clearTimer(this._timer);
    }
    this._urgentTimer = urgent;
    this._timer = this._setTimer(() => { this._timer = null; this._urgentTimer = false; void this.flush(); }, urgent ? 0 : 1000);
    this._timer?.unref?.();
  }

  _touch(record, urgent = false) {
    record.updatedAt = this._now();
    if (!this._ended.has(record.id)) record.durationMs = Math.max(record.durationMs, record.updatedAt - record.startedAt);
    this._dirty.add(record.id);
    this._needsSizing.add(record.id);
    this._changed = true;
    this._schedule(urgent);
  }

  _remove(id) {
    this._records.delete(id);
    this._sizes.delete(id);
    this._dirty.delete(id);
    this._needsSizing.delete(id);
    this._deleted.add(id);
    this._openStages.delete(id);
    this._ended.delete(id);
    if (this._current === id) this._current = null;
    this._changed = true;
  }

  _fit(record) {
    let bytes = byteLength(record);
    if (bytes <= this.maxRecordBytes) return bytes;
    record.events = record.events.slice(-8);
    record.stages = record.stages.slice(-16);
    if ((bytes = byteLength(record)) <= this.maxRecordBytes) return bytes;
    record.details = { truncated: true, excerpt: text(JSON.stringify(record.details), Math.floor(this.maxRecordBytes / 10)) };
    record.context = { truncated: true, excerpt: text(JSON.stringify(record.context), Math.floor(this.maxRecordBytes / 20)) };
    for (const item of [...record.events, ...record.stages]) item.data = null;
    if ((bytes = byteLength(record)) <= this.maxRecordBytes) return bytes;
    record.events = [];
    record.stages = [];
    record.summary = text(record.summary, Math.min(256, Math.floor(this.maxRecordBytes / 20)));
    record.details = { truncated: true };
    record.context = {};
    record.title = text(record.title, 64);
    return byteLength(record);
  }

  _prune() {
    const cutoff = this._now() - this.maxAgeMs;
    for (const record of this._records.values()) if (record.startedAt <= cutoff) this._remove(record.id);
    // Only entries changed since the last batch need serialization or sizing.
    for (const id of this._needsSizing) {
      const record = this._records.get(id);
      if (record) this._sizes.set(id, this._fit(record));
    }
    this._needsSizing.clear();
    const ordered = [...this._records.values()].sort(newest);
    let bytes = 0;
    for (let index = 0; index < ordered.length; index++) {
      const record = ordered[index], size = this._sizes.get(record.id) || 0;
      if (index >= this.maxRecords || size > this.maxRecordBytes || bytes + size > this.maxBytes) this._remove(record.id);
      else bytes += size;
    }
    for (const [key, id] of this._runtimeErrors) if (!this._records.has(id)) this._runtimeErrors.delete(key);
  }

  begin(kind, title, context = {}) {
    const now = this._now(), id = `${this.sessionId}:${String(++this._serial).padStart(8, '0')}`;
    const record = { id, sessionId: this.sessionId, kind: text(kind, 64), title: text(title, 256), startedAt: now, updatedAt: now,
      status: 'running', durationMs: 0, context: object({ ...this._context, ...object(context) }), summary: '', stages: [], events: [], details: {} };
    this._records.set(id, record);
    this._touch(record);
    if (this._records.size > this.maxRecords) {
      const oldest = [...this._records.values()].sort(newest).slice(this.maxRecords);
      for (const entry of oldest) this._remove(entry.id);
    }
    return id;
  }

  setCurrent(id) { this._current = this._records.has(id) ? id : null; }
  setContext(context) { this._context = object({ ...this._context, ...object(context) }); }

  _closeStage(id, now = this._now()) {
    const open = this._openStages.get(id);
    if (!open) return;
    open.stage.durationMs = Math.max(0, now - open.startedAt);
    this._openStages.delete(id);
  }

  stage(id, name, stageData) {
    const record = this._records.get(id);
    if (!record || this._ended.has(id)) return;
    const now = this._now();
    this._closeStage(id, now);
    const stage = { name: text(name, 128), durationMs: 0, data: data(stageData) };
    record.stages.push(stage);
    if (record.stages.length > 64) record.stages.shift();
    this._openStages.set(id, { stage, startedAt: now });
    this._touch(record);
  }

  event(id, level, message, eventData) {
    const record = this._records.get(id);
    if (!record) return;
    const normalizedLevel = text(level, 32), normalizedMessage = text(message, 2048), normalizedData = data(eventData);
    const matching = record.events.find(item => item.level === normalizedLevel && item.message === normalizedMessage && item.data?.phase === normalizedData?.phase && item.data?.stack === normalizedData?.stack);
    if (matching) { matching.count++; matching.at = this._now(); matching.data = normalizedData; }
    else {
      record.events.push({ level: normalizedLevel, message: normalizedMessage, count: 1, at: this._now(), data: normalizedData });
      if (record.events.length > 128) record.events.shift();
    }
    this._touch(record, normalizedLevel === 'error');
  }

  update(id, { context, details, summary } = {}) {
    const record = this._records.get(id);
    if (!record) return;
    if (context !== undefined) record.context = object({ ...record.context, ...object(context) });
    if (details !== undefined) record.details = object({ ...record.details, ...object(details) });
    if (summary !== undefined) record.summary = text(summary, 2048);
    this._touch(record);
  }

  end(id, { status = 'success', summary = '', details = {} } = {}) {
    const record = this._records.get(id);
    if (!record) return;
    this._closeStage(id);
    record.status = record.status === 'error' || (record.status === 'failure' && status !== 'error') ? record.status : text(status, 32);
    if (summary) record.summary = text(summary, 2048);
    record.details = object({ ...record.details, ...object(details) });
    if (!this._ended.has(id)) record.durationMs = Math.max(0, this._now() - record.startedAt);
    this._ended.add(id);
    if (this._current === id) this._current = null;
    this._touch(record, record.status === 'error' || record.status === 'failure');
  }

  captureError(error, { id, context, phase } = {}) {
    const now = this._now(), isObject = error !== null && (typeof error === 'object' || typeof error === 'function');
    const previous = isObject ? this._capturedErrors.get(error) : null;
    const priorRecord = previous && this._records.get(previous.id);
    // A locally caught/rethrown Error can also reach window.onerror. Preserve
    // its first attribution while allowing later real recurrences to count.
    if (priorRecord && now - previous.at >= 0 && now - previous.at <= 250 && priorRecord.startedAt > now - this.maxAgeMs) return previous.id;
    // Error objects and rejection reasons can have hostile getters or cycles.
    let message = '未知异常', name = 'Error', stack = '';
    try { message = text(error?.message || error, 2048) || message; } catch {}
    try { name = text(error?.name || 'Error', 128); } catch {}
    try { stack = text(error?.stack, MAX_STACK); } catch {}
    let target = id === undefined ? this._current : id;
    if (!this._records.has(target) || this._records.get(target).startedAt <= now - this.maxAgeMs) target = null;
    if (!target) {
      const key = `${name}:${message}:${text(phase, 128)}:${stack}`;
      const prior = this._runtimeErrors.get(key), record = this._records.get(prior);
      target = record && now - record.updatedAt <= 60000 ? prior : this.begin('runtime', '运行异常', context);
      this._runtimeErrors.set(key, target);
      if (this._runtimeErrors.size > 64) this._runtimeErrors.delete(this._runtimeErrors.keys().next().value);
    }
    const record = this._records.get(target);
    if (!record) return null;
    if (isObject) this._capturedErrors.set(error, { id: target, at: now });
    record.status = 'error';
    if (!record.summary) record.summary = message;
    this.event(target, 'error', message, { name, stack, phase: text(phase, 128), context: object(context) });
    return target;
  }

  async list() {
    await this._ready;
    this._prune();
    if (this._deleted.size) this._schedule();
    const now = this._now();
    return [...this._records.values()].sort(newest).map(record => {
      const result = clone(record), open = this._openStages.get(record.id);
      if (open) {
        const index = record.stages.indexOf(open.stage);
        if (index >= 0) result.stages[index].durationMs = Math.max(0, now - open.startedAt);
      }
      if (record.status === 'running' && !this._ended.has(record.id)) result.durationMs = Math.max(0, now - record.startedAt);
      return result;
    });
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  flush() {
    if (this._timer !== null) { this._clearTimer(this._timer); this._timer = null; this._urgentTimer = false; }
    if (this._flushPromise) { this._flushAgain = true; return this._flushPromise; }
    this._flushPromise = (async () => {
      await this._ready;
      do {
        this._flushAgain = false;
        this._prune();
        const records = [...this._dirty].map(id => this._records.get(id)).filter(Boolean).map(clone);
        const deleteIds = [...this._deleted];
        const byteSizes = Object.fromEntries(records.map(record => [record.id, this._sizes.get(record.id)]));
        this._dirty.clear();
        this._deleted.clear();
        if (this._storage && (records.length || deleteIds.length)) {
          try { await this._storage.write({ records, deleteIds, byteSizes, cutoff: this._now() - this.maxAgeMs, maxRecords: this.maxRecords, maxBytes: this.maxBytes }); }
          catch (error) { this._fallback(error); }
        }
      } while (this._flushAgain || this._dirty.size || this._deleted.size);
      if (this._changed) {
        this._changed = false;
        for (const listener of this._listeners) {
          try { const result = listener(); if (result?.catch) result.catch(() => {}); } catch {}
        }
      }
    })().catch(error => { this._fallback(error); }).finally(() => { this._flushPromise = null; });
    return this._flushPromise;
  }
}

function printable(value) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return JSON.stringify(data(value), null, 2); }
}

function timestamp(value) {
  try { return new Date(value).toISOString(); } catch { return text(value); }
}

export function formatActivityLog(record, { groupIndex } = {}) {
  if (!record) return '';
  const lines = [
    `行为日志：${text(record.title)}`, `类型：${text(record.kind)} | 状态：${text(record.status)}`,
    `开始：${timestamp(record.startedAt)} | 用时：${Math.round(record.durationMs || 0)} ms`,
    `最近更新：${timestamp(record.updatedAt)}`,
    `记录：${text(record.id)} | 会话：${text(record.sessionId)}`,
    `摘要：${text(record.summary)}`, '', '环境：', printable(record.context || {}),
  ];
  const reports = Array.isArray(record.details?.reports) ? record.details.reports : [];
  const reportLines = index => {
    const report = reports[index];
    if (report === undefined) return ['诊断组不存在'];
    const title = report?.title || report?.name || report?.mode || report?.group || `第 ${index + 1} 组`;
    return ['', `诊断组 ${index + 1}：${text(title)}`, printable(report)];
  };
  if (groupIndex !== undefined) return [...lines, ...reportLines(Number(groupIndex))].join('\n');
  if (record.stages?.length) {
    lines.push('', '阶段：');
    for (const stage of record.stages) {
      lines.push(`${text(stage.name)}：${Math.round(stage.durationMs || 0)} ms`);
      if (stage.data != null) lines.push(printable(stage.data));
    }
  }
  if (record.events?.length) {
    lines.push('', '事件与异常：');
    for (const event of record.events) {
      lines.push(`[${timestamp(event.at)}] ${text(event.level)} ×${event.count || 1}：${text(event.message)}`);
      if (event.data != null) lines.push(printable(event.data));
    }
  }
  const details = { ...record.details };
  delete details.reports;
  if (Object.keys(details).length) lines.push('', '详情：', printable(details));
  for (let index = 0; index < reports.length; index++) lines.push(...reportLines(index));
  return lines.join('\n');
}

export const activityLog = new ActivityLog();

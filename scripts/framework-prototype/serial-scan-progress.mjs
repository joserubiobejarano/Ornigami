const runInstruction = /\bRUN\b/;
const timestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;
const int64Minimum = -9223372036854775808n;
const int64Maximum = 9223372036854775807n;
const int64TokenPattern = /^(?:0|-?[1-9]\d*)$/;

function vertices(event) {
  return Array.isArray(event?.vertexes) ? event.vertexes : [];
}

function validTimestamp(value) {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  const match = timestampPattern.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
      || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(Date.parse(value))) return false;
  if (zone !== 'Z') {
    const [zoneHour, zoneMinute] = zone.slice(1).split(':').map(Number);
    if (zoneHour > 23 || zoneMinute > 59) return false;
  }
  return true;
}

function validVertex(vertex) {
  if (Object.hasOwn(vertex, 'name') && typeof vertex.name !== 'string') return false;
  if (Object.hasOwn(vertex, 'cached') && typeof vertex.cached !== 'boolean') return false;
  if (Object.hasOwn(vertex, 'started') && !validTimestamp(vertex.started)) return false;
  if (Object.hasOwn(vertex, 'completed') && !validTimestamp(vertex.completed)) return false;
  if (Object.hasOwn(vertex, 'error') && typeof vertex.error !== 'string') return false;
  if ((!vertex.name || typeof vertex.name !== 'string')
      && (vertex.cached === true || typeof vertex.started === 'string' || typeof vertex.completed === 'string')) return false;
  return true;
}

function validInt64StatusField(status, field, numericSources) {
  if (typeof status[field] !== 'number') return false;
  const token = numericSources.get(status)?.[field];
  if (typeof token !== 'string' || !int64TokenPattern.test(token)) return false;
  const digits = token[0] === '-' ? token.slice(1) : token;
  if (digits.length > 19) return false;
  const exactValue = BigInt(token);
  return exactValue >= int64Minimum && exactValue <= int64Maximum;
}

function validStatus(status, numericSources) {
  const fields = ['id', 'vertex', 'name', 'total', 'current', 'timestamp', 'started', 'completed'];
  if (Object.keys(status).some((key) => !fields.includes(key))) return false;
  if (!Object.hasOwn(status, 'id') || !Object.hasOwn(status, 'current') || !Object.hasOwn(status, 'timestamp')) return false;
  for (const key of ['id', 'vertex', 'name']) {
    if (Object.hasOwn(status, key) && typeof status[key] !== 'string') return false;
  }
  if (!validInt64StatusField(status, 'current', numericSources)) return false;
  if (Object.hasOwn(status, 'total') && !validInt64StatusField(status, 'total', numericSources)) return false;
  for (const key of ['timestamp', 'started', 'completed']) {
    if (Object.hasOwn(status, key) && (status[key] === null || !validTimestamp(status[key]))) return false;
  }
  return true;
}

export function rejectReexecution(event) {
  return vertices(event).some((vertex) => runInstruction.test(vertex.name ?? '')
    && (typeof vertex.started === 'string' || typeof vertex.completed === 'string')
    && vertex.cached !== true);
}

export function cachedTargetRun(event, target) {
  return vertices(event).some((vertex) => typeof vertex.name === 'string'
    && vertex.name.startsWith('[' + target + ' ')
    && runInstruction.test(vertex.name)
    && typeof vertex.completed === 'string'
    && validTimestamp(vertex.completed)
    && !vertex.error
    && vertex.cached === true);
}

function isProgressEvent(event, numericSources) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)
      || !['vertexes', 'statuses', 'logs', 'warnings'].some((key) => Object.hasOwn(event, key))) return false;
  if (Object.keys(event).some((key) => !['vertexes', 'statuses', 'logs', 'warnings'].includes(key))) return false;
  return ['vertexes', 'statuses', 'logs', 'warnings'].every((key) => !Object.hasOwn(event, key)
    || (Array.isArray(event[key]) && event[key].every((entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      && (key === 'vertexes' ? validVertex(entry) : key === 'statuses' ? validStatus(entry, numericSources) : true))));
}

function cancellationText(value) {
  return value === 'context canceled';
}

export class RawJsonProgressTracker {
  constructor(target) {
    this.target = target;
    this.buffers = new Map([['stdout', ''], ['stderr', '']]);
    this.abortRequested = false;
    this.cacheMiss = false;
    this.targetCacheProof = false;
    this.malformed = false;
    this.cancellationDiagnostics = [];
    this.unclassifiedOutputCount = 0;
    this.lines = { stdout: 0, stderr: 0 };
  }

  markAbort() {
    this.abortRequested = true;
  }

  push(stream, bytes) {
    if (!this.buffers.has(stream)) throw new Error('Unexpected Buildx output stream: ' + stream);
    const lines = (this.buffers.get(stream) + bytes.toString()).split('\n');
    this.buffers.set(stream, lines.pop());
    for (const line of lines) this.#accept(stream, line);
  }

  finish(stream) {
    if (!this.buffers.has(stream)) throw new Error('Unexpected Buildx output stream: ' + stream);
    const trailing = this.buffers.get(stream);
    this.buffers.set(stream, '');
    if (trailing.trim()) this.#accept(stream, trailing);
  }

  #accept(stream, rawLine) {
    const line = rawLine.trim();
    if (!line) return;
    this.lines[stream] += 1;
    let event;
    const numericSources = new WeakMap();
    try {
      // Capture exact JSON integer tokens; the parsed Number may already be rounded.
      event = JSON.parse(line, function captureInt64Source(key, value, context) {
        if ((key === 'current' || key === 'total') && typeof value === 'number'
            && this !== null && typeof this === 'object') {
          const fields = numericSources.get(this) ?? Object.create(null);
          fields[key] = context?.source;
          numericSources.set(this, fields);
        }
        return value;
      });
    } catch {
      if (stream === 'stderr' && this.abortRequested && line === 'ERROR: context canceled') {
        this.cancellationDiagnostics.push({ stream, kind: 'plain-cancellation' });
      } else {
        this.unclassifiedOutputCount += 1;
        this.malformed = true;
      }
      return;
    }
    if (this.abortRequested && Object.keys(event ?? {}).length === 1 && cancellationText(event?.error)) {
      this.cancellationDiagnostics.push({ stream, kind: 'structured-cancellation' });
      return;
    }
    if (!isProgressEvent(event, numericSources)) {
      this.malformed = true;
      return;
    }
    const vertexErrors = vertices(event).filter((vertex) => vertex.error);
    const cancelledVertices = vertexErrors.filter((vertex) => cancellationText(vertex.error)).length;
    const permittedCancellations = this.abortRequested ? cancelledVertices : 0;
    if (permittedCancellations > 0) {
      this.cancellationDiagnostics.push({ stream, kind: 'vertex-cancellation', count: permittedCancellations });
    }
    this.cacheMiss ||= rejectReexecution(event);
    if (vertexErrors.length !== permittedCancellations) {
      this.malformed = true;
      return;
    }
    this.targetCacheProof ||= cachedTargetRun(event, this.target);
  }

  summary() {
    return {
      channel: 'Buildx rawjson; independent stdout/stderr line buffers',
      lines: { ...this.lines },
      uncachedRunStartedOrCompleted: this.cacheMiss,
      completedCachedTargetRunProven: this.targetCacheProof,
      malformedProgress: this.malformed,
      cancellationDiagnosticCount: this.cancellationDiagnostics.length,
      unclassifiedOutputCount: this.unclassifiedOutputCount,
    };
  }
}

const runInstruction = /\bRUN\b/;
const timestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

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

function isProgressEvent(event) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)
      || !['vertexes', 'statuses', 'logs', 'warnings'].some((key) => Object.hasOwn(event, key))) return false;
  if (Object.keys(event).some((key) => !['vertexes', 'statuses', 'logs', 'warnings'].includes(key))) return false;
  return ['vertexes', 'statuses', 'logs', 'warnings'].every((key) => !Object.hasOwn(event, key)
    || (Array.isArray(event[key]) && event[key].every((entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      && (!['vertexes', 'statuses'].includes(key) || validVertex(entry)))));
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
    try {
      event = JSON.parse(line);
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
    if (!isProgressEvent(event)) {
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

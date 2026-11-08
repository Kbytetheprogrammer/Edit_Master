export const TRANSFORM_KEYFRAME_FIELDS = ['x', 'y', 'scale', 'rotation', 'opacity'];

export const DEFAULT_TRANSFORM = Object.freeze({
  x: 50,
  y: 50,
  scale: 100,
  rotation: 0,
  opacity: 100,
});

const asFinite = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function upsertKeyframe(keyframes, time, values) {
  const at = Math.max(0, asFinite(time, 0));
  const next = (Array.isArray(keyframes) ? keyframes : [])
    .filter((frame) => Math.abs(asFinite(frame.time, -1000) - at) > 0.01)
    .map((frame) => ({ ...frame }));

  const frame = { time: at };
  for (const field of TRANSFORM_KEYFRAME_FIELDS) {
    if (values?.[field] !== undefined) frame[field] = asFinite(values[field], DEFAULT_TRANSFORM[field]);
  }
  next.push(frame);
  next.sort((left, right) => left.time - right.time);
  return next;
}

export function removeKeyframeAtTime(keyframes, time, tolerance = 0.08) {
  const at = asFinite(time, 0);
  return (Array.isArray(keyframes) ? keyframes : [])
    .filter((frame) => Math.abs(asFinite(frame.time, -1000) - at) > tolerance)
    .map((frame) => ({ ...frame }));
}

export function evaluateKeyframes(keyframes, time, base = DEFAULT_TRANSFORM) {
  const frames = (Array.isArray(keyframes) ? keyframes : [])
    .filter((frame) => Number.isFinite(Number(frame.time)))
    .map((frame) => ({ ...frame, time: Math.max(0, Number(frame.time)) }))
    .sort((left, right) => left.time - right.time);

  const result = {};
  for (const field of TRANSFORM_KEYFRAME_FIELDS) {
    const points = frames
      .filter((frame) => Number.isFinite(Number(frame[field])))
      .map((frame) => ({ time: frame.time, value: Number(frame[field]) }));

    if (!points.length) {
      result[field] = asFinite(base?.[field], DEFAULT_TRANSFORM[field]);
      continue;
    }
    if (time <= points[0].time) {
      result[field] = points[0].value;
      continue;
    }
    if (time >= points.at(-1).time) {
      result[field] = points.at(-1).value;
      continue;
    }

    let rightIndex = points.findIndex((point) => point.time >= time);
    const left = points[rightIndex - 1];
    const right = points[rightIndex];
    if (!left || !right || right.time <= left.time) {
      result[field] = left?.value ?? right?.value ?? asFinite(base?.[field], DEFAULT_TRANSFORM[field]);
      continue;
    }
    const ratio = (time - left.time) / (right.time - left.time);
    result[field] = left.value + (right.value - left.value) * ratio;
  }
  return result;
}

function parseSrtTimestamp(value) {
  const match = String(value).trim().match(/^(\d{2,}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4].padEnd(3, '0'));
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

export function parseSrt(content, mediaId, createId = (() => `subtitle-${Math.random().toString(36).slice(2)}`)) {
  const normalized = String(content || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const cues = [];
  const blocks = normalized.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trimEnd());
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;
    const timing = lines[timingIndex].match(/(\d{2,}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{2,}:\d{2}:\d{2}[,.]\d{1,3})/);
    if (!timing) continue;
    const start = parseSrtTimestamp(timing[1]);
    const end = parseSrtTimestamp(timing[2]);
    const text = lines.slice(timingIndex + 1).join('\n').trim();
    if (start === null || end === null || end <= start || !text) continue;
    cues.push({ id: createId(), mediaId, start, end, text, kind: 'subtitle' });
  }
  return cues.sort((left, right) => left.start - right.start);
}

export function getActiveTextCue(cues, mediaId, time) {
  return (Array.isArray(cues) ? cues : []).find((cue) =>
    cue.mediaId === mediaId && Number(time) >= Number(cue.start) && Number(time) < Number(cue.end)
  ) || null;
}

/** Replace imported SRT cues for one media item without deleting manually added titles. */
export function replaceImportedSubtitles(existing, mediaId, importedCues) {
  const current = Array.isArray(existing) ? existing : [];
  const incoming = Array.isArray(importedCues) ? importedCues : [];
  return [
    ...current.filter((cue) => cue.mediaId !== mediaId || cue.kind === 'title'),
    ...incoming.filter((cue) => cue.mediaId === mediaId && cue.kind !== 'title'),
  ];
}

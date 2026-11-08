/**
 * Convert a pointer position inside a timeline clip into an absolute timestamp
 * in the original media file. Clip start/end values are source-media times.
 */
export function mapClipPointerToSourceTime(clip, clientX, rectLeft, rectWidth) {
  if (!clip || !Number.isFinite(Number(clip.start))) return 0;
  const start = Math.max(0, Number(clip.start) || 0);
  const duration = Number(clip.duration);
  const end = Number.isFinite(Number(clip.end))
    ? Number(clip.end)
    : start + (Number.isFinite(duration) ? duration : 0);
  if (!Number.isFinite(clientX) || !Number.isFinite(rectLeft) || !Number.isFinite(rectWidth) || rectWidth <= 0 || end <= start) {
    return start;
  }
  const ratio = Math.min(1, Math.max(0, (clientX - rectLeft) / rectWidth));
  return start + (end - start) * ratio;
}

export function getClipPlaybackRange(clip, fallbackDuration = 0) {
  const start = Math.max(0, Number.isFinite(Number(clip?.start)) ? Number(clip.start) : 0);
  const rawEnd = Number(clip?.end);
  const duration = Number(clip?.duration);
  const end = Number.isFinite(rawEnd) && rawEnd > start
    ? rawEnd
    : start + (Number.isFinite(duration) && duration > 0 ? duration : Math.max(0, Number(fallbackDuration) || 0));
  return { start, end: Math.max(start, end) };
}

export function clampTimeToClip(time, clip, fallbackDuration = 0) {
  const value = Math.max(0, Number(time) || 0);
  const range = getClipPlaybackRange(clip, fallbackDuration);
  return Math.max(range.start, Math.min(range.end, value));
}

export function hasReachedClipEnd(time, clip, tolerance = 0.025, fallbackDuration = 0) {
  if (!clip) return false;
  const range = getClipPlaybackRange(clip, fallbackDuration);
  return range.end > range.start && Number(time) >= range.end - Math.max(0, tolerance);
}

/**
 * Split a media segment at an absolute source-media timestamp.
 * A clip's start/end values refer to the original media, not its timeline offset.
 */
export function splitTimelineClip(clip, sourceTime, createId) {
  if (!clip) {
    return { ok: false, reason: 'Selecione um clipe na timeline antes de dividir.' };
  }

  if (clip.durationPending) {
    return { ok: false, reason: 'Aguarde o Edit Master identificar a duração completa do arquivo antes de cortar.' };
  }

  const start = Number.isFinite(Number(clip.start)) ? Math.max(0, Number(clip.start)) : 0;
  const fallbackDuration = Number(clip.duration);
  const end = Number.isFinite(Number(clip.end))
    ? Number(clip.end)
    : start + (Number.isFinite(fallbackDuration) ? fallbackDuration : 0);
  const position = Number(sourceTime);
  const segmentDuration = end - start;
  const edgeTolerance = 0.05;

  if (!Number.isFinite(start) || !Number.isFinite(end) || segmentDuration <= 0) {
    return { ok: false, reason: 'A duração deste segmento não é válida.' };
  }

  if (!Number.isFinite(position) || position <= start + edgeTolerance || position >= end - edgeTolerance) {
    return {
      ok: false,
      reason: `Posicione o cursor dentro do segmento (${start.toFixed(2)}s–${end.toFixed(2)}s) para dividir. Clique no ponto desejado do clipe para posicionar o cursor.`,
    };
  }

  const leftDuration = position - start;
  const rightDuration = end - position;
  const left = {
    ...clip,
    clipId: createId(),
    duration: leftDuration,
    start,
    end: position,
    durationPending: false,
  };
  const right = {
    ...clip,
    clipId: createId(),
    duration: rightDuration,
    start: position,
    end,
    durationPending: false,
  };

  return { ok: true, left, right };
}

const CLIP_PROPERTY_FIELDS = [
  'audioGain', 'audioFadeIn', 'audioFadeOut', 'audioMuted',
  'overlayX', 'overlayY', 'overlayScale', 'overlayOpacity', 'overlayRotation',
  'playbackSpeed', 'colorBrightness', 'colorContrast', 'colorSaturation', 'colorWarmth', 'keyframes',
];

/** Build the serializable project payload and reject temporary drag/drop URLs. */
export function createProjectPayload(name, media, clips, subtitles = []) {
  const usedMediaIds = new Set([
    ...(clips || []).map(clip => clip.mediaId),
    ...(subtitles || []).map(cue => cue?.mediaId).filter(Boolean),
  ]);
  const missingMedia = (media || []).filter(item => !item.sourcePath && usedMediaIds.has(item.id));
  if (missingMedia.length) {
    return {
      ok: false,
      missingNames: missingMedia.map(item => item.name),
      project: null,
    };
  }

  return {
    ok: true,
    missingNames: [],
    project: {
      name: String(name || 'Projeto sem título'),
      // Media loaded only by drag/drop but not used by any clip has no stable
      // native path, so it is not part of the portable project bundle.
      media: (media || []).filter(item => Boolean(item.sourcePath)).map(item => ({
        id: item.id, name: item.name, type: item.type, size: item.size, duration: Number(item.duration) || 0, sourcePath: item.sourcePath,
        sourceProvider: item.sourceProvider || null, sourcePageUrl: item.sourcePageUrl || null, sourceAuthor: item.sourceAuthor || null,
        sourceLicense: item.sourceLicense || null, sourceLicenseUrl: item.sourceLicenseUrl || null,
      })),
      subtitles: (subtitles || []).filter(cue => cue && cue.mediaId && Number.isFinite(Number(cue.start)) && Number.isFinite(Number(cue.end)) && Number(cue.end) > Number(cue.start) && String(cue.text || '').trim()).map(cue => ({
        id: String(cue.id || ''), mediaId: String(cue.mediaId), start: Number(cue.start), end: Number(cue.end), text: String(cue.text).slice(0, 5000), kind: cue.kind === 'title' ? 'title' : 'subtitle',
      })),
      clips: (clips || []).map(clip => {
        const saved = {
          clipId: clip.clipId,
          mediaId: clip.mediaId,
          name: clip.name,
          type: clip.type,
          duration: Number(clip.duration) || 0,
          start: Number(clip.start) || 0,
          end: Number(clip.end) || 0,
          durationPending: Boolean(clip.durationPending),
        };
        for (const field of CLIP_PROPERTY_FIELDS) {
          if (clip[field] !== undefined) saved[field] = field === 'keyframes'
            ? (Array.isArray(clip[field]) ? clip[field].map(frame => ({ ...frame })) : [])
            : clip[field];
        }
        return saved;
      }),
    },
  };
}

/** Restore media URLs from the paths returned by the native project loader. */
export function restoreProjectPayload(project, toAssetUrl) {
  const media = (project?.media || []).map(item => ({
    id: item.id,
    name: item.name,
    type: item.type,
    size: Number(item.size) || 0,
    duration: Number(item.duration) || 0,
    sourcePath: item.sourcePath,
    sourceProvider: item.sourceProvider || null, sourcePageUrl: item.sourcePageUrl || null, sourceAuthor: item.sourceAuthor || null,
    sourceLicense: item.sourceLicense || null, sourceLicenseUrl: item.sourceLicenseUrl || null,
    url: toAssetUrl(item.sourcePath),
  }));
  const byId = new Map(media.map(item => [item.id, item]));
  const clips = (project?.clips || []).map(clip => ({
    ...clip,
    url: byId.get(clip.mediaId)?.url || '',
    sourcePath: byId.get(clip.mediaId)?.sourcePath || null,
  }));
  const subtitles = (project?.subtitles || []).map(cue => ({
    id: String(cue.id || ''), mediaId: String(cue.mediaId || ''), start: Number(cue.start) || 0, end: Number(cue.end) || 0, text: String(cue.text || ''), kind: cue.kind === 'title' ? 'title' : 'subtitle',
  })).filter(cue => media.some(item => item.id === cue.mediaId) && cue.end > cue.start && cue.text.trim());
  return { name: project?.name || 'Projeto sem título', media, clips, subtitles }; 
}

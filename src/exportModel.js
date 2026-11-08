const VISUAL_TYPES = new Set(['video', 'image']);
const CLIP_TYPES = new Set(['video', 'image', 'audio']);

/** Build a validated native MP4 render request without temporary drag/drop files. */
export function createExportRequest(media = [], clips = [], ffmpegPath, outputPath, options = {}, subtitles = []) {
  if (!String(ffmpegPath || '').trim()) return { ok: false, reason: 'Selecione um ffmpeg.exe antes de exportar.' };
  if (!String(outputPath || '').toLowerCase().endsWith('.mp4')) return { ok: false, reason: 'Escolha um destino com extensão .mp4.' };
  if (!Array.isArray(clips) || !clips.length) return { ok: false, reason: 'A timeline está vazia.' };

  const mediaById = new Map((Array.isArray(media) ? media : []).map(item => [item.id, item]));
  const usedIds = [...new Set(clips.map(clip => clip.mediaId))];
  const usedMedia = [];
  for (const id of usedIds) {
    const item = mediaById.get(id);
    if (!item) return { ok: false, reason: `A mídia ${id || '(sem ID)'} não está na biblioteca do projeto.` };
    if (!item.sourcePath) return { ok: false, reason: `A mídia “${item.name}” não tem caminho permanente. Reimporte pelo seletor nativo do Windows.` };
    usedMedia.push({ id: item.id, sourcePath: item.sourcePath });
  }

  // Never silently produce an MP4 that differs from the editor preview.
  // These preview features are integrated into the renderer in a later 1.0 step.
  const visualMediaIds = new Set(clips.filter(clip => VISUAL_TYPES.has(clip.type)).map(clip => clip.mediaId));
  if (Array.isArray(subtitles) && subtitles.some(cue => visualMediaIds.has(cue.mediaId))) {
    return { ok: false, reason: 'Esta timeline contém títulos ou legendas. A exportação com texto ainda está sendo integrada; nenhum arquivo foi renderizado.' };
  }
  for (const clip of clips.filter(item => VISUAL_TYPES.has(item.type))) {
    const changedTransform =
      (clip.overlayX != null && Number(clip.overlayX) !== 50) ||
      (clip.overlayY != null && Number(clip.overlayY) !== 50) ||
      (clip.overlayScale != null && Number(clip.overlayScale) !== 100) ||
      (clip.overlayOpacity != null && Number(clip.overlayOpacity) !== 100) ||
      (clip.overlayRotation != null && Number(clip.overlayRotation) !== 0) ||
      (clip.colorWarmth != null && Number(clip.colorWarmth) !== 0) ||
      (Array.isArray(clip.keyframes) && clip.keyframes.length > 0);
    if (changedTransform) {
      return { ok: false, reason: `O clipe “${clip.name || 'sem nome'}” contém transformações, aquecimento de cor ou keyframes que ainda não são reproduzidos integralmente no MP4. Ajuste removido da prévia ou aguarde a integração do renderizador.` };
    }
  }

  const visualClips = clips.filter(clip => VISUAL_TYPES.has(clip.type));
  if (!visualClips.length) return { ok: false, reason: 'Adicione pelo menos um vídeo ou uma imagem à timeline antes de exportar.' };
  for (const clip of clips) {
    if (!CLIP_TYPES.has(clip.type)) return { ok: false, reason: `O tipo de mídia “${clip.type}” ainda não pode ser exportado.` };
    const duration = Number(clip.duration) || 0;
    const start = Number(clip.start) || 0;
    const end = Number(clip.end) || 0;
    if (!Number.isFinite(duration) || !Number.isFinite(start) || !Number.isFinite(end) || duration <= 0 || start < 0 || end > duration + 0.05 || end - start <= 0.05) {
      return { ok: false, reason: `O segmento “${clip.name || 'sem nome'}” tem duração inválida.` };
    }
  }

  return {
    ok: true,
    request: {
      ffmpegPath: String(ffmpegPath),
      outputPath: String(outputPath),
      media: usedMedia,
      clips: clips.map(clip => ({
        mediaId: clip.mediaId,
        type: clip.type,
        duration: Number(clip.duration) || 0,
        start: Number(clip.start) || 0,
        end: Number(clip.end) || 0,
        audioGain: clip.audioGain,
        audioFadeIn: clip.audioFadeIn,
        audioFadeOut: clip.audioFadeOut,
        audioMuted: clip.audioMuted,
        playbackSpeed: clip.playbackSpeed,
        colorBrightness: clip.colorBrightness,
        colorContrast: clip.colorContrast,
        colorSaturation: clip.colorSaturation,
      })),
      width: Number(options.width) || 1920,
      height: Number(options.height) || 1080,
      fps: Number(options.fps) || 60,
      crf: Number(options.crf) || 20,
    },
  };
}

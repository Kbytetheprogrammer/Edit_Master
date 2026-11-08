import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Clapperboard, Copy, FilePlus2, Film, FolderOpen, Gauge, Grid2X2,
  Image as ImageIcon, Images, Import, Layers3, Maximize2, MoreHorizontal, Music2,
  Pause, Play, Plus, Redo2, Scissors, Search, Settings2, SlidersHorizontal,
  Sparkles, Trash2, Undo2, Upload, Volume2, VolumeX, Wand2, X, Youtube, ZoomIn, ZoomOut, LockKeyhole
} from 'lucide-react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { clampTimeToClip, getClipPlaybackRange, hasReachedClipEnd, mapClipPointerToSourceTime, splitTimelineClip } from './timeline.js';
import { formatBytes, getSelectedDuplicateFiles } from './mediaDuplicates.js';
import { createProjectPayload, restoreProjectPayload } from './projectModel.js';
import { createExportRequest } from './exportModel.js';
import { DEFAULT_TRANSFORM, evaluateKeyframes, getActiveTextCue, parseSrt, removeKeyframeAtTime, replaceImportedSubtitles, upsertKeyframe } from './editing.js';
import AiHub from './AiHub.jsx';
import StockHub from './StockHub.jsx';
import YouTubePublish from './YouTubePublish.jsx';
import HelpCenter from './HelpCenter.jsx';
import packageJson from '../package.json';
import { LocalizedTree, translateText } from './i18n.js';

const fmt = (value = 0) => {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
const uid = () => crypto.randomUUID();
const APP_VERSION = packageJson.version;
const LOCAL_UPDATE_FOLDER_KEY = 'edit-master-local-update-folder';
const AUTO_LOCAL_UPDATE_KEY = 'edit-master-auto-local-update';
const DISMISSED_LOCAL_UPDATE_KEY = 'edit-master-dismissed-local-update';
const FFMPEG_PATH_KEY = 'edit-master-ffmpeg-path';
const MEDIA_STORAGE_FOLDER_KEY = 'edit-master-media-storage-folder';
const LANGUAGE_KEY = 'edit-master-language';
const THEME_KEY = 'edit-master-theme';
const SUPPORTED_LANGUAGES = ['pt-BR', 'en', 'es'];
const THEME_OPTIONS = ['orange', 'blue', 'green', 'black', 'white', 'mixed'];
const classify = (file) => file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'image' : null;

const DEFAULT_PREFERENCES = {
  animations: 'full',
  visualEffects: true,
  economyMode: false,
  cacheBudgetMB: 256,
  shortcuts: { split: 's', play: 'Space' },
};
const readPreferences = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('edit-master-preferences') || '{}');
    return { ...DEFAULT_PREFERENCES, ...saved, shortcuts: { ...DEFAULT_PREFERENCES.shortcuts, ...(saved.shortcuts || {}) } };
  } catch {
    return { ...DEFAULT_PREFERENCES, shortcuts: { ...DEFAULT_PREFERENCES.shortcuts } };
  }
};

function App() {
  const [screen, setScreen] = useState('home');
  const [runtimeVersion, setRuntimeVersion] = useState(APP_VERSION);
  const [media, setMedia] = useState([]);
  const [clips, setClips] = useState([]);
  const [subtitles, setSubtitles] = useState([]);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [mediaDeleteBusy, setMediaDeleteBusy] = useState(false);
  const [selectedClip, setSelectedClip] = useState(null);
  const [inspectorTab, setInspectorTab] = useState('properties');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState('Pronto para criar. Importe sua primeira mídia.');
  const [modal, setModal] = useState(() => localStorage.getItem(LANGUAGE_KEY) ? '' : 'language-welcome');
  const [language, setLanguage] = useState(() => SUPPORTED_LANGUAGES.includes(localStorage.getItem(LANGUAGE_KEY)) ? localStorage.getItem(LANGUAGE_KEY) : 'pt-BR');
  const [theme, setTheme] = useState(() => THEME_OPTIONS.includes(localStorage.getItem(THEME_KEY)) ? localStorage.getItem(THEME_KEY) : 'orange');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  const [projectName, setProjectName] = useState('Projeto sem título');
  const [dirty, setDirty] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [localUpdatePath, setLocalUpdatePath] = useState('');
  const [expectedLocalUpdateSha256, setExpectedLocalUpdateSha256] = useState('');
  const [localUpdateCandidate, setLocalUpdateCandidate] = useState(null);
  const [localUpdateFolder, setLocalUpdateFolder] = useState(() => localStorage.getItem(LOCAL_UPDATE_FOLDER_KEY) || '');
  const [autoLocalUpdate, setAutoLocalUpdate] = useState(() => localStorage.getItem(AUTO_LOCAL_UPDATE_KEY) !== 'false');
  const [updating, setUpdating] = useState(false);
  const [preferences, setPreferences] = useState(readPreferences);
  const [draftPreferences, setDraftPreferences] = useState(readPreferences);
  const [settingsFeedback, setSettingsFeedback] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [duplicateFolder, setDuplicateFolder] = useState('');
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [duplicateKeepPaths, setDuplicateKeepPaths] = useState({});
  const [duplicateDeletePaths, setDuplicateDeletePaths] = useState([]);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [duplicateFeedback, setDuplicateFeedback] = useState('');
  const [duplicateScanSummary, setDuplicateScanSummary] = useState({ scanned_video_files: 0, skipped_items: 0 });
  const [ffmpegPath, setFfmpegPath] = useState(() => localStorage.getItem(FFMPEG_PATH_KEY) || '');
  const [mediaStorageFolder, setMediaStorageFolder] = useState(() => localStorage.getItem(MEDIA_STORAGE_FOLDER_KEY) || '');
  const [exportBusy, setExportBusy] = useState(false);
  const [lastExportedPath, setLastExportedPath] = useState('');
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const pendingSeekRef = useRef(null);
  const undoHistoryRef = useRef([]);
  const redoHistoryRef = useRef([]);
  const propertyEditActiveRef = useRef(false);
  const timelineRef = useRef(null);
  const dragId = useRef(null);
  const objectUrls = useRef([]);
  const localUpdateCheckInFlightRef = useRef(false);
  const startupLocalUpdateCheckStartedRef = useRef(false);

  const active = media.find(m => m.id === selectedMedia) || null;
  const selectedClipData = clips.find(clip => clip.clipId === selectedClip) || null;
  const previewClip = selectedClipData?.mediaId === active?.id ? selectedClipData : null;
  const previewTransform = useMemo(() => {
    if (!previewClip) return { ...DEFAULT_TRANSFORM };
    const base = {
      x: Number(previewClip.overlayX ?? 50),
      y: Number(previewClip.overlayY ?? 50),
      scale: Number(previewClip.overlayScale ?? 100),
      rotation: Number(previewClip.overlayRotation ?? 0),
      opacity: Number(previewClip.overlayOpacity ?? 100),
    };
    return evaluateKeyframes(previewClip.keyframes, time, base);
  }, [previewClip, time]);
  const previewFilter = previewClip
    ? `brightness(${Number(previewClip.colorBrightness ?? 100)}%) contrast(${Number(previewClip.colorContrast ?? 100)}%) saturate(${Number(previewClip.colorSaturation ?? 100)}%) sepia(${Math.max(0, Math.min(100, Number(previewClip.colorWarmth ?? 0))) * 0.45}%)`
    : 'none';
  const previewStyle = {
    transform: `translate(${(previewTransform.x - 50) * 1.2}%, ${(previewTransform.y - 50) * 1.2}%) scale(${previewTransform.scale / 100}) rotate(${previewTransform.rotation}deg)`,
    opacity: previewTransform.opacity / 100,
    filter: previewFilter,
    transformOrigin: 'center center',
  };
  const activeTextCue = getActiveTextCue(subtitles, active?.id, time);
  const visibleMedia = useMemo(() => media.filter(m => (filter === 'all' || m.type === filter) && m.name.toLowerCase().includes(search.toLowerCase())), [media, filter, search]);
  const totalDuration = useMemo(() => clips.reduce((sum, c) => sum + (c.duration || 5), 0), [clips]);
  const preferencesChanged = JSON.stringify(draftPreferences) !== JSON.stringify(preferences);
  const selectedDuplicateFiles = useMemo(
    () => getSelectedDuplicateFiles(duplicateGroups, duplicateKeepPaths, duplicateDeletePaths),
    [duplicateGroups, duplicateKeepPaths, duplicateDeletePaths]
  );
  const selectedDuplicateBytes = useMemo(
    () => selectedDuplicateFiles.reduce((total, file) => total + (Number(file.size_bytes) || 0), 0),
    [selectedDuplicateFiles]
  );

  const createHistorySnapshot = () => ({
    clips: clips.map(clip => ({ ...clip, keyframes: Array.isArray(clip.keyframes) ? clip.keyframes.map(frame => ({ ...frame })) : [] })),
    subtitles: subtitles.map(cue => ({ ...cue })),
  });
  const rememberTimeline = () => {
    undoHistoryRef.current.push(createHistorySnapshot());
    if (undoHistoryRef.current.length > 80) undoHistoryRef.current.shift();
    redoHistoryRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };
  const beginPropertyEdit = () => {
    if (propertyEditActiveRef.current || !selectedClip) return;
    rememberTimeline();
    propertyEditActiveRef.current = true;
  };
  const endPropertyEdit = () => {
    propertyEditActiveRef.current = false;
  };
  const propertyEditHandlers = {
    onPointerDown: beginPropertyEdit,
    onFocus: beginPropertyEdit,
    onBlur: endPropertyEdit,
  };
  const undoTimeline = () => {
    const previous = undoHistoryRef.current.pop();
    if (!previous) return;
    redoHistoryRef.current.push(createHistorySnapshot());
    setClips(previous.clips || []);
    setSubtitles(previous.subtitles || []);
    setSelectedClip(current => (previous.clips || []).some(clip => clip.clipId === current) ? current : null);
    setCanUndo(undoHistoryRef.current.length > 0);
    setCanRedo(true);
    setDirty(true);
    setNotice('Última alteração da timeline desfeita.');
  };
  const redoTimeline = () => {
    const next = redoHistoryRef.current.pop();
    if (!next) return;
    undoHistoryRef.current.push(createHistorySnapshot());
    setClips(next.clips || []);
    setSubtitles(next.subtitles || []);
    setSelectedClip(current => (next.clips || []).some(clip => clip.clipId === current) ? current : null);
    setCanUndo(true);
    setCanRedo(redoHistoryRef.current.length > 0);
    setDirty(true);
    setNotice('Alteração da timeline refeita.');
  };
  const openSettings = () => {
    setDraftPreferences({ ...preferences });
    setSettingsFeedback('');
    setModal('settings');
  };
  const persistPreferences = (next, successMessage, failureMessage) => {
    setPreferences(next);
    setDraftPreferences(next);
    try {
      localStorage.setItem('edit-master-preferences', JSON.stringify(next));
      setSettingsFeedback(successMessage);
      setNotice(successMessage);
    } catch {
      setSettingsFeedback(failureMessage);
      setNotice(failureMessage);
    }
  };
  const applyPreferences = () => {
    const next = {
      ...DEFAULT_PREFERENCES,
      ...draftPreferences,
      shortcuts: { ...DEFAULT_PREFERENCES.shortcuts, ...(draftPreferences.shortcuts || {}) },
    };
    persistPreferences(
      next,
      'Configurações aplicadas e salvas neste computador.',
      'Configurações aplicadas nesta sessão, mas não foi possível salvá-las no perfil do Windows.'
    );
  };
  const resetPreferences = () => {
    const defaults = { ...DEFAULT_PREFERENCES };
    persistPreferences(
      defaults,
      'Preferências padrão restauradas e aplicadas.',
      'Padrões aplicados nesta sessão, mas não foi possível salvá-los no perfil do Windows.'
    );
  };

  const checkLocalUpdateFolder = useCallback(async ({ notifyEmpty = false, forcePrompt = false } = {}) => {
    if (!localUpdateFolder) {
      if (notifyEmpty) setNotice('Escolha primeiro uma pasta para procurar atualizações locais.');
      return null;
    }
    if (localUpdateCheckInFlightRef.current) return null;
    localUpdateCheckInFlightRef.current = true;
    try {
      const candidate = await invoke('check_local_update', { folderPath: localUpdateFolder });
      if (candidate) {
        const updateKey = `${candidate.version}:${candidate.sha256}`;
        const dismissedKey = localStorage.getItem(DISMISSED_LOCAL_UPDATE_KEY);
        if (forcePrompt || dismissedKey !== updateKey) {
          setLocalUpdateCandidate(candidate);
          setLocalUpdatePath(candidate.installerPath);
          setExpectedLocalUpdateSha256(candidate.sha256);
          if (forcePrompt) setModal('local-update-found');
          else setModal(current => (!current || current === 'settings') ? 'local-update-found' : current);
        }
        if (notifyEmpty) setNotice(`Atualização local ${candidate.version} encontrada.`);
        return candidate;
      }
      if (notifyEmpty) setNotice(`Nenhuma atualização mais recente foi encontrada em ${localUpdateFolder}.`);
      return null;
    } catch (error) {
      if (notifyEmpty) setNotice(`Falha ao verificar a pasta de atualizações: ${String(error)}`);
      return null;
    } finally {
      localUpdateCheckInFlightRef.current = false;
    }
  }, [localUpdateFolder]);

  useEffect(() => () => objectUrls.current.forEach(url => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* Keep the current session theme. */ }
  }, [theme]);
  const chooseLanguage = (nextLanguage) => {
    if (!SUPPORTED_LANGUAGES.includes(nextLanguage)) return;
    setLanguage(nextLanguage);
    try { localStorage.setItem(LANGUAGE_KEY, nextLanguage); } catch { /* Keep the current session language. */ }
    setModal(current => current === 'language-welcome' ? '' : current);
  };
  useEffect(() => {
    let cancelled = false;
    invoke('get_app_version').then(value => { if (!cancelled && value) setRuntimeVersion(String(value)); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    invoke('get_bundled_media_tools').then(tools => {
      if (cancelled || !tools?.ffmpegPath) return;
      const manuallyConfigured = localStorage.getItem(FFMPEG_PATH_KEY);
      if (!manuallyConfigured) {
        setFfmpegPath(tools.ffmpegPath);
        localStorage.setItem(FFMPEG_PATH_KEY, tools.ffmpegPath);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const clipGain = selectedClipData?.type === 'audio' ? Math.max(0, Math.min(1, Number(selectedClipData.audioGain ?? 1))) : 1;
    const clipMuted = selectedClipData?.type === 'audio' && Boolean(selectedClipData.audioMuted);
    for (const player of [videoRef.current, audioRef.current]) {
      if (player) { player.volume = Math.max(0, Math.min(1, volume * clipGain)); player.muted = muted || clipMuted; }
    }
  }, [volume, muted, active, selectedClipData]);
  useEffect(() => {
    if (selectedClipData?.type === 'audio') setInspectorTab('audio');
    else if (selectedClipData?.type === 'image') setInspectorTab('overlay');
    else setInspectorTab('properties');
  }, [selectedClipData?.clipId, selectedClipData?.type]);
  // A verificação automática local acontece uma única vez por inicialização.
  // O ref também evita uma segunda chamada durante o ciclo de efeitos do React StrictMode.
  useEffect(() => {
    if (startupLocalUpdateCheckStartedRef.current) return;
    startupLocalUpdateCheckStartedRef.current = true;
    if (!localUpdateFolder || !autoLocalUpdate) return;
    void checkLocalUpdateFolder();
  }, []);
  useEffect(() => {
    const speed = Math.max(0.25, Math.min(2, Number(previewClip?.playbackSpeed ?? 1)));
    if (videoRef.current) videoRef.current.playbackRate = speed;
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [previewClip?.clipId, previewClip?.playbackSpeed, active?.id]);
  useEffect(() => { if (!playing) return; const player = active?.type === 'audio' ? audioRef.current : videoRef.current; if (!player) return; const id = setInterval(() => setTime(player.currentTime || 0), preferences.economyMode ? 300 : 100); return () => clearInterval(id); }, [playing, active?.id, active?.type, preferences.economyMode]);
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (typing) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === 'i') { event.preventDefault(); void chooseMediaFiles(); }
        else if (key === 'z' && !event.shiftKey) { event.preventDefault(); undoTimeline(); }
        else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redoTimeline(); }
        return;
      }
      if (preferences.shortcuts?.play === 'Space' && event.code === 'Space') {
        event.preventDefault(); void togglePlay();
      } else if (key === (preferences.shortcuts?.split || 's').toLowerCase()) {
        event.preventDefault(); splitAtPlayhead();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    clips, subtitles, preferences.shortcuts, selectedClip, selectedMedia, time, media,
    active?.id, active?.type, previewClip, duration, playing,
  ]);

  const chooseMediaStorageFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: translateText('Escolher pasta para armazenar mídias', language),
      });
      if (!selected || Array.isArray(selected)) return;
      setMediaStorageFolder(selected);
      try { localStorage.setItem(MEDIA_STORAGE_FOLDER_KEY, selected); } catch { /* Keep the current session setting. */ }
      setNotice('Pasta de armazenamento de mídia salva. Novos arquivos importados pelo seletor serão copiados para ela.');
    } catch (error) {
      setNotice(`Não foi possível selecionar a pasta de armazenamento: ${String(error)}`);
    }
  };

  const chooseMediaFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        title: translateText('Importar mídia para o Edit Master', language),
        filters: [{ name: translateText('Mídia compatível', language), extensions: ['mp4','m4v','mkv','mov','avi','webm','wmv','mpeg','mpg','3gp','flv','mp3','wav','ogg','m4a','aac','flac','png','jpg','jpeg','gif','webp','bmp'] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const descriptors = mediaStorageFolder
        ? await invoke('copy_media_to_folder', { paths, folderPath: mediaStorageFolder })
        : await invoke('register_media_paths', { paths });
      const added = descriptors.map(item => ({
        id: uid(), name: item.name, type: item.mediaType, size: item.sizeBytes,
        duration: 0, sourcePath: item.path, url: convertFileSrc(item.path),
      }));
      if (!added.length) { setNotice('Nenhum arquivo de vídeo, áudio ou imagem compatível foi selecionado.'); return; }
      setMedia(old => [...old, ...added]);
      setSelectedMedia(added[0].id);
      setScreen('editor');
      setSelectedClip(null);
      setDirty(true);
      setNotice(mediaStorageFolder
        ? `${added.length} arquivo(s) importado(s) e copiado(s) para a pasta de armazenamento escolhida.`
        : `${added.length} arquivo(s) importado(s). Configure uma pasta de armazenamento nas configurações para copiá-los automaticamente para outro disco.`);
    } catch (error) {
      setNotice(`Não foi possível importar a mídia: ${String(error)}`);
    }
  };

  // Permite arrastar arquivos do Windows para a janela. Para projetos portáteis,
  // prefira o seletor nativo, que fornece um caminho estável para copiar os originais.
  const importFiles = useCallback((files) => {
    const accepted = Array.from(files || []).map(file => ({ file, type: classify(file) })).filter(x => x.type);
    if (!accepted.length) { setNotice('Nenhum arquivo compatível. Use vídeo, imagem ou áudio.'); return; }
    const added = accepted.map(({file,type}) => {
      const url = URL.createObjectURL(file); objectUrls.current.push(url);
      return { id: uid(), file, type, name: file.name, size: file.size, url, duration: 0, sourcePath: file.path || null };
    });
    setMedia(old => [...old, ...added]); setSelectedMedia(added[0].id); setDirty(true);
    setNotice(`${added.length} arquivo(s) importado(s). Use o botão Importar arquivos para garantir que o projeto consiga copiar a mídia original.`);
  }, []);
  const addClip = (item) => {
    if (!item) return;
    rememberTimeline();
    const knownDuration = Number(item.duration) || 0;
    const clipDuration = knownDuration || 5;
    const clip = {
      clipId: uid(), mediaId: item.id, name: item.name, type: item.type, url: item.url, sourcePath: item.sourcePath || null,
      duration: clipDuration, start: 0, end: clipDuration,
      durationPending: !knownDuration && item.type !== 'image',
    };
    setClips(old => [...old, clip]);
    setSelectedClip(clip.clipId);
    setSelectedMedia(item.id);
    setPlaying(false);
    setTime(0);
    setDuration(knownDuration);
    setDirty(true);
    setNotice(`“${item.name}” adicionado à linha do tempo.`);
  };
  const removeClip = (id) => {
    if (!clips.some(clip => clip.clipId === id)) return;
    rememberTimeline();
    setClips(old => old.filter(c => c.clipId !== id));
    if (selectedClip === id) setSelectedClip(null);
    setDirty(true);
    setNotice('Clipe removido da timeline.');
  };
  const removeMediaFromLibrary = async (item) => {
    if (!item || mediaDeleteBusy) return;
    if (clips.some(clip => clip.mediaId === item.id)) {
      setNotice('Remova primeiro os clipes desta mídia da timeline. O arquivo original foi preservado.');
      return;
    }
    const action = item.sourcePath
      ? 'Enviar o arquivo original para a Lixeira do Windows?'
      : 'Remover esta mídia da biblioteca? O arquivo original não será apagado.';
    if (!window.confirm(`${action}\n\n${item.name}`)) return;
    setMediaDeleteBusy(true);
    try {
      if (item.sourcePath) await invoke('move_media_to_recycle_bin', { filePath: item.sourcePath });
      setMedia(old => old.filter(mediaItem => mediaItem.id !== item.id));
      if (selectedMedia === item.id) {
        setSelectedMedia(null);
        setTime(0);
        setDuration(0);
        setPlaying(false);
      }
      setDirty(true);
      setNotice(item.sourcePath ? 'Arquivo enviado à Lixeira do Windows.' : 'Mídia removida da biblioteca; o arquivo original foi preservado.');
    } catch (error) {
      setNotice(`Não foi possível remover a mídia: ${String(error)}`);
    } finally {
      setMediaDeleteBusy(false);
    }
  };
  const select = (item) => {
    setSelectedClip(null);
    setSelectedMedia(item.id);
    setPlaying(false);
    setTime(0);
    setDuration(item.duration || 0);
    pendingSeekRef.current = { mediaId: item.id, time: 0 };
  };
  const selectTimelineClip = (clip, requestedSourceTime = null) => {
    const sourceStart = Math.max(0, Number(clip.start) || 0);
    const sourceEnd = Number.isFinite(Number(clip.end))
      ? Number(clip.end)
      : sourceStart + Math.max(0, Number(clip.duration) || 0);
    const requested = Number(requestedSourceTime);
    const targetTime = Number.isFinite(requested)
      ? Math.min(sourceEnd, Math.max(sourceStart, requested))
      : sourceStart;

    setSelectedClip(clip.clipId);
    setSelectedMedia(clip.mediaId);
    setPlaying(false);
    setTime(targetTime);
    const source = media.find(item => item.id === clip.mediaId);
    setDuration(Math.max(source?.duration || 0, sourceEnd));
    pendingSeekRef.current = clip.type === 'image'
      ? null
      : { mediaId: clip.mediaId, time: targetTime };

    if (active?.id === clip.mediaId) {
      const player = clip.type === 'audio' ? audioRef.current : clip.type === 'video' ? videoRef.current : null;
      if (player && player.readyState >= 1) {
        try {
          player.pause();
          player.currentTime = targetTime;
          pendingSeekRef.current = null;
        } catch { /* O evento loadedmetadata aplicará a posição pendente. */ }
      }
    } else {
      videoRef.current?.pause();
      audioRef.current?.pause();
    }
  };
  const selectTimelineClipFromPointer = (clip, event) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const sourceTime = mapClipPointerToSourceTime(clip, event.clientX, rect.left, rect.width);
    selectTimelineClip(clip, sourceTime);
  };
  const togglePlay = async () => {
    const player = active?.type === 'audio' ? audioRef.current : active?.type === 'video' ? videoRef.current : null;
    if (!player) { setNotice('Selecione um vídeo ou áudio para reproduzir no monitor.'); return; }
    const clip = previewClip;
    if (player.paused) {
      const range = clip ? getClipPlaybackRange(clip, duration) : null;
      if (range && (player.currentTime < range.start || player.currentTime >= range.end)) {
        const startAt = range.start;
        try { player.currentTime = startAt; setTime(startAt); } catch { /* O navegador pode estar aguardando metadados. */ }
      }
      try { await player.play(); setPlaying(true); }
      catch { setNotice('Este arquivo não pôde ser reproduzido pelo navegador.'); }
    } else { player.pause(); setPlaying(false); }
  };
  const seek = (v) => {
    let n = Number(v);
    if (previewClip) n = clampTimeToClip(n, previewClip, duration);
    setTime(n);
    if (!active) return;
    if (active.type === 'image') {
      pendingSeekRef.current = null;
      return;
    }
    pendingSeekRef.current = { mediaId: active.id, time: n };
    const player = active.type === 'video' ? videoRef.current : active.type === 'audio' ? audioRef.current : null;
    if (player && player.readyState >= 1) {
      try {
        player.currentTime = n;
        pendingSeekRef.current = null;
      } catch { /* O evento loadedmetadata aplicará a posição pendente. */ }
    }
  };
  const handlePlayerTimeUpdate = (type, event) => {
    const player = event.currentTarget;
    const current = Number(player.currentTime) || 0;
    const clip = clips.find(item => item.clipId === selectedClip && item.mediaId === active?.id && item.type === type);
    if (clip && hasReachedClipEnd(current, clip, 0.025, duration)) {
      player.pause();
      const end = getClipPlaybackRange(clip, duration).end;
      try { player.currentTime = end; } catch { /* Mantém o último instante conhecido. */ }
      setTime(end);
      setPlaying(false);
      return;
    }
    if (clip && current < getClipPlaybackRange(clip, duration).start) {
      const start = getClipPlaybackRange(clip, duration).start;
      try { player.currentTime = start; } catch { /* Mantém o cursor atual. */ }
      setTime(start);
      return;
    }
    setTime(current);
  };
  const splitAtPlayhead = () => {
    const clip = clips.find(c => c.clipId === selectedClip);
    if (!clip) {
      setNotice('Selecione um clipe na timeline antes de dividir.');
      return;
    }

    // Read the native player's latest position rather than relying only on a
    // React state update that may be one frame behind during playback.
    const player = clip.type === 'video' && active?.id === clip.mediaId
      ? videoRef.current
      : clip.type === 'audio' && active?.id === clip.mediaId
        ? audioRef.current
        : null;
    const playerTime = player && player.readyState >= 1 && !player.seeking && Number.isFinite(player.currentTime) ? player.currentTime : time;
    const splitTime = Number.isFinite(playerTime) ? playerTime : time;
    const result = splitTimelineClip(clip, splitTime, uid);
    if (!result.ok) {
      setNotice(result.reason);
      return;
    }

    videoRef.current?.pause();
    audioRef.current?.pause();
    setPlaying(false);
    setTime(splitTime);
    rememberTimeline();
    setClips(old => old.flatMap(current => current.clipId === clip.clipId ? [result.left, result.right] : [current]));
    setSelectedClip(result.right.clipId);
    setTime(result.right.start);
    pendingSeekRef.current = clip.type === 'image'
      ? null
      : { mediaId: clip.mediaId, time: result.right.start };
    setDirty(true);
    setNotice(`Clipe dividido em ${fmt(result.left.duration)} + ${fmt(result.right.duration)}. Você pode desfazer com Ctrl+Z.`);
  };
  const clearTimeline = () => {
    if (!clips.length) return;
    rememberTimeline();
    setClips([]); setSelectedClip(null); setDirty(true);
    setNotice('Timeline limpa. Use Desfazer para recuperar os clipes.');
  };
  const dropToTimeline = (event) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/media-id') || dragId.current;
    const item = media.find(m => m.id === id);
    if (item) addClip(item);
  };
  const saveProject = async () => {
    const payload = createProjectPayload(projectName, media, clips, subtitles);
    if (!payload.ok) {
      setNotice(`Não foi possível salvar um projeto completo: estes clipes não têm um caminho permanente. Reimporte pelo botão Importar arquivos: ${payload.missingNames.join(', ')}.`);
      return;
    }
    try {
      const safeName = projectName.replace(/[^a-z0-9-_]/gi, '_') || 'projeto';
      const filePath = await saveDialog({
        title: translateText('Salvar projeto Edit Master', language),
        defaultPath: mediaStorageFolder ? `${mediaStorageFolder}/${safeName}.emproj` : `${safeName}.emproj`,
        filters: [{ name: translateText('Projeto Edit Master', language), extensions: ['emproj'] }],
      });
      if (!filePath) return;
      const normalizedPath = filePath.toLowerCase().endsWith('.emproj') ? filePath : `${filePath}.emproj`;
      const result = await invoke('save_project_bundle', { filePath: normalizedPath, project: payload.project });
      const savedPathById = new Map((result.mediaPaths || []).map(item => [item.id, item.path]));
      setMedia(current => current.map(item => {
        const savedPath = savedPathById.get(item.id);
        return savedPath ? { ...item, sourcePath: savedPath, url: convertFileSrc(savedPath) } : item;
      }));
      setClips(current => current.map(clip => {
        const savedPath = savedPathById.get(clip.mediaId);
        const source = savedPath || clip.sourcePath;
        return savedPath ? { ...clip, sourcePath: source, url: convertFileSrc(source) } : clip;
      }));
      setDirty(false);
      setNotice(`Projeto salvo com ${result.mediaCount} mídia(s). A sessão agora usa as cópias guardadas na pasta _assets.`);
    } catch (error) {
      setNotice(`Não foi possível salvar o projeto: ${String(error)}`);
    }
  };

  const openProject = async () => {
    try {
      const filePath = await open({
        multiple: false,
        directory: false,
        title: translateText('Abrir projeto Edit Master', language),
        filters: [{ name: translateText('Projeto Edit Master', language), extensions: ['emproj'] }],
      });
      if (!filePath || Array.isArray(filePath)) return;
      const project = await invoke('load_project_bundle', { filePath });
      const restored = restoreProjectPayload(project, convertFileSrc);
      setMedia(restored.media);
      setClips(restored.clips);
      setSubtitles(restored.subtitles || []);
      setProjectName(restored.name);
      setSelectedMedia(restored.media[0]?.id || null);
      setScreen('editor');
      setSelectedClip(null);
      setTime(0); setDuration(0); setPlaying(false);
      pendingSeekRef.current = null;
      propertyEditActiveRef.current = false;
      undoHistoryRef.current = []; redoHistoryRef.current = [];
      setCanUndo(false); setCanRedo(false); setDirty(false);
      setNotice(`Projeto “${project.name}” aberto. ${restored.media.length} mídia(s) restaurada(s).`);
    } catch (error) {
      setNotice(`Não foi possível abrir o projeto: ${String(error)}`);
    }
  };

  const updateSelectedClipProperties = (patch) => {
    if (!selectedClip) return;
    if (!propertyEditActiveRef.current) beginPropertyEdit();
    setClips(current => current.map(clip => {
      if (clip.clipId !== selectedClip) return clip;
      const nextPatch = { ...patch };
      const transformMap = { overlayX: 'x', overlayY: 'y', overlayScale: 'scale', overlayRotation: 'rotation', overlayOpacity: 'opacity' };
      const changedTransform = Object.keys(nextPatch).some(key => transformMap[key]);
      if (changedTransform && Array.isArray(clip.keyframes) && clip.keyframes.length) {
        const values = evaluateKeyframes(clip.keyframes, time, {
          x: Number(clip.overlayX ?? 50), y: Number(clip.overlayY ?? 50),
          scale: Number(clip.overlayScale ?? 100), rotation: Number(clip.overlayRotation ?? 0),
          opacity: Number(clip.overlayOpacity ?? 100),
        });
        for (const [field, key] of Object.entries(transformMap)) {
          if (nextPatch[field] !== undefined) values[key] = Number(nextPatch[field]);
        }
        nextPatch.keyframes = upsertKeyframe(clip.keyframes, time, values);
      }
      return { ...clip, ...nextPatch };
    }));
    setDirty(true);
  };
  const addKeyframeAtPlayhead = () => {
    if (!selectedClipData) return;
    endPropertyEdit();
    rememberTimeline();
    const current = evaluateKeyframes(selectedClipData.keyframes, time, {
      x: Number(selectedClipData.overlayX ?? 50),
      y: Number(selectedClipData.overlayY ?? 50),
      scale: Number(selectedClipData.overlayScale ?? 100),
      rotation: Number(selectedClipData.overlayRotation ?? 0),
      opacity: Number(selectedClipData.overlayOpacity ?? 100),
    });
    const keyframes = upsertKeyframe(selectedClipData.keyframes, time, current);
    setClips(items => items.map(clip => clip.clipId === selectedClip ? { ...clip, keyframes } : clip));
    setDirty(true);
    setNotice(`Keyframe salvo em ${fmt(time)}.`);
  };
  const removeKeyframeAtPlayhead = () => {
    if (!selectedClipData) return;
    const next = removeKeyframeAtTime(selectedClipData.keyframes, time);
    if (next.length === (selectedClipData.keyframes || []).length) {
      setNotice('Não há keyframe próximo ao cursor para remover.');
      return;
    }
    endPropertyEdit();
    rememberTimeline();
    setClips(items => items.map(clip => clip.clipId === selectedClip ? { ...clip, keyframes: next } : clip));
    setDirty(true);
    setNotice('Keyframe removido.');
  };
  const createNewProject = () => {
    if (dirty && !window.confirm('Há alterações não salvas. Criar um novo projeto mesmo assim?')) return;
    videoRef.current?.pause();
    audioRef.current?.pause();
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    objectUrls.current = [];
    setMedia([]);
    setClips([]);
    setSubtitles([]);
    setSelectedMedia(null);
    setSelectedClip(null);
    setTime(0);
    setDuration(0);
    setPlaying(false);
    setProjectName('Projeto sem título');
    setDirty(false);
    pendingSeekRef.current = null;
    undoHistoryRef.current = [];
    redoHistoryRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setScreen('editor');
    setNotice('Novo projeto criado. Importe mídias para começar.');
  };

  const returnToHome = () => {
    if (dirty && !window.confirm('Há alterações não salvas. Voltar ao início sem salvar?')) return;
    videoRef.current?.pause();
    audioRef.current?.pause();
    setPlaying(false);
    setScreen('home');
  };

  const applyAiSubtitles = (mediaId, cues) => {
    if (!Array.isArray(cues) || !cues.length) return;
    rememberTimeline();
    setSubtitles(current => replaceImportedSubtitles(current, mediaId, cues));
    setDirty(true);
    setSelectedMedia(mediaId);
    setScreen('editor');
  };

  const openAiHub = () => {
    setModal('ai-hub');
  };

  const openStockHub = () => setModal('stock-hub');
  const openYouTubePublish = () => setModal('youtube-publish');

  const addDownloadedStockMedia = async (downloaded) => {
    if (!downloaded?.path || !downloaded?.mediaType) throw new Error('O Media Hub não retornou um arquivo válido.');
    // Register the downloaded asset with Tauri's allow-list before creating its file:// preview URL.
    const [registered] = await invoke('register_media_paths', { paths: [downloaded.path] });
    if (!registered?.path) throw new Error('O arquivo foi baixado, mas o Edit Master não conseguiu liberar a prévia da mídia.');
    const item = {
      id: uid(), name: registered.name || downloaded.name, type: registered.mediaType || downloaded.mediaType, size: Number(registered.sizeBytes ?? downloaded.sizeBytes) || 0,
      duration: 0, sourcePath: registered.path, url: convertFileSrc(registered.path),
      sourceProvider: downloaded.provider || null, sourcePageUrl: downloaded.pageUrl || null,
      sourceAuthor: downloaded.author || null, sourceLicense: downloaded.license || null,
      sourceLicenseUrl: downloaded.licenseUrl || null,
    };
    setMedia(current => [...current, item]);
    setSelectedMedia(item.id);
    setSelectedClip(null);
    setScreen('editor');
    setDirty(true);
  };

  const chooseFfmpeg = async () => {
    try {
      const selected = await open({ multiple: false, directory: false, title: translateText('Selecionar ffmpeg.exe', language), filters: [{ name: translateText('FFmpeg (Windows)', language), extensions: ['exe'] }] });
      if (!selected || Array.isArray(selected)) return null;
      setFfmpegPath(selected);
      localStorage.setItem(FFMPEG_PATH_KEY, selected);
      return selected;
    } catch (error) {
      setNotice(`Não foi possível selecionar o FFmpeg: ${String(error)}`);
      return null;
    }
  };

  const extractAudio = async () => {
    if (exportBusy) return;
    let sourcePath;
    try {
      sourcePath = await open({
        multiple: false,
        directory: false,
        title: translateText('Selecionar vídeo ou arquivo de áudio', language),
        filters: [{ name: translateText('Mídia compatível', language), extensions: ['mp4','mov','mkv','webm','avi','m4v','mp3','wav','m4a','aac','flac','ogg'] }],
      });
    } catch (error) {
      setNotice(`Não foi possível selecionar a mídia: ${String(error)}`);
      return;
    }
    if (!sourcePath || Array.isArray(sourcePath)) return;
    let executable = ffmpegPath;
    if (!executable) executable = await chooseFfmpeg();
    if (!executable) return;
    const format = (prompt('Formato de áudio: mp3, wav, flac, aac ou ogg', 'mp3') || '').trim().toLowerCase();
    if (!['mp3','wav','flac','aac','ogg'].includes(format)) {
      setNotice('Formato inválido. Escolha MP3, WAV, FLAC, AAC ou OGG.');
      return;
    }
    const baseName = sourcePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'audio-extraido';
    let outputPath;
    try {
      outputPath = await saveDialog({
        title: translateText('Salvar áudio extraído', language),
        defaultPath: `${baseName}.${format}`,
        filters: [{ name: translateText(`Áudio ${format.toUpperCase()}`, language), extensions: [format] }],
      });
    } catch (error) {
      setNotice(`Não foi possível escolher o destino: ${String(error)}`);
      return;
    }
    if (!outputPath) return;
    if (!outputPath.toLowerCase().endsWith(`.${format}`)) outputPath += `.${format}`;
    setExportBusy(true);
    setNotice('Extraindo áudio…');
    try {
      const result = await invoke('extract_audio_file', { request: { ffmpegPath: executable, inputPath: sourcePath, outputPath, format } });
      setNotice(`Áudio extraído com sucesso: ${result.outputPath}`);
    } catch (error) {
      setNotice(`A extração de áudio falhou: ${String(error)}`);
    } finally {
      setExportBusy(false);
    }
  };

  const exportTimeline = async () => {
    if (exportBusy) return;
    const visualClips = clips.filter(clip => clip.type === 'video' || clip.type === 'image');
    if (!visualClips.length) { setNotice('Adicione pelo menos um vídeo ou uma imagem à timeline antes de exportar.'); return; }
    let executable = ffmpegPath;
    if (!executable) executable = await chooseFfmpeg();
    if (!executable) return;
    const suggested = `${(projectName || 'Edit-Master').replace(/[^a-z0-9-_]/gi, '_')}.mp4`;
    let outputPath;
    try {
      outputPath = await saveDialog({ title: translateText('Exportar vídeo MP4', language), defaultPath: suggested, filters: [{ name: translateText('Vídeo MP4', language), extensions: ['mp4'] }] });
    } catch (error) { setNotice(`Não foi possível escolher o arquivo de saída: ${String(error)}`); return; }
    if (!outputPath) return;
    if (!outputPath.toLowerCase().endsWith('.mp4')) outputPath += '.mp4';
    setExportBusy(true);
    setNotice('Preparando a renderização MP4…');
    try {
      const built = createExportRequest(media, clips, executable, outputPath, { width: 1920, height: 1080, fps: 60, crf: 20 });
      if (!built.ok) throw new Error(built.reason);
      const result = await invoke('export_timeline_mp4', { request: built.request });
      setLastExportedPath(result.outputPath || outputPath);
      setNotice(`Vídeo MP4 exportado com sucesso: ${result.outputPath || outputPath}. Renderizados ${result.videoSegments} segmento(s) visual(is) e ${result.audioSegments} faixa(s) de áudio.`);
      setModal('export-complete');
    } catch (error) {
      setNotice(`A exportação falhou: ${String(error)}`);
    } finally { setExportBusy(false); }
  };

  const importSrt = async () => {
    const target = active?.type === 'video' ? active : media.find(item => item.id === selectedMedia && item.type === 'video');
    if (!target) {
      setNotice('Selecione um vídeo antes de importar legendas SRT.');
      return;
    }
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: translateText('Importar legendas SubRip', language),
        filters: [{ name: translateText('Legendas SubRip', language), extensions: ['srt'] }],
      });
      if (!selected || Array.isArray(selected)) return;
      const content = await invoke('read_srt_file', { filePath: selected });
      const cues = parseSrt(content, target.id, uid);
      if (!cues.length) {
        setNotice('Nenhuma legenda válida foi encontrada no arquivo SRT.');
        return;
      }
      rememberTimeline();
      setSubtitles(current => replaceImportedSubtitles(current, target.id, cues));
      setDirty(true);
      setNotice(`${cues.length} legenda(s) importada(s) para “${target.name}”. Salve o projeto para preservá-las.`);
    } catch (error) {
      setNotice(`Não foi possível importar as legendas: ${String(error)}`);
    }
  };
  const addTitleCue = () => {
    const target = active?.type === 'video' ? active : media.find(item => item.id === selectedMedia && item.type === 'video');
    if (!target) {
      setNotice('Selecione um vídeo para adicionar um título.');
      return;
    }
    const text = prompt('Texto do título', 'Meu título');
    if (!text?.trim()) return;
    const start = Math.max(0, Number(time) || 0);
    const cue = { id: uid(), mediaId: target.id, start, end: start + 3, text: text.trim().slice(0, 500), kind: 'title' };
    rememberTimeline();
    setSubtitles(current => [...current, cue]);
    setDirty(true);
    setNotice(`Título adicionado por 3 segundos a partir de ${fmt(start)}. Salve o projeto para preservá-lo.`);
  };
  const removeActiveTextCue = () => {
    if (!activeTextCue) return;
    rememberTimeline();
    setSubtitles(current => current.filter(cue => cue.id !== activeTextCue.id));
    setDirty(true);
    setNotice('Título ou legenda removido. Use Ctrl+Z para desfazer.');
  };
  const checkUpdates = () => setNotice('A verificação pela internet ainda não está ativa. Para atualizações sem internet, use a pasta local configurada abaixo.');
  const chooseDuplicateFolder = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: true,
        title: translateText('Escolher pasta para procurar vídeos duplicados', language),
      });
      if (!selected) return;

      setDuplicateFolder(selected);
      setDuplicateGroups([]);
      setDuplicateKeepPaths({});
      setDuplicateDeletePaths([]);
      setDuplicateFeedback('Analisando vídeos. Pastas grandes podem levar alguns minutos.');
      setDuplicateScanSummary({ scanned_video_files: 0, skipped_items: 0 });
      setModal('duplicates');
      setDuplicateBusy(true);

      const result = await invoke('scan_duplicate_videos', { folderPath: selected });
      const groups = Array.isArray(result?.groups) ? result.groups : [];
      setDuplicateGroups(groups);
      setDuplicateKeepPaths(Object.fromEntries(groups.map(group => [group.key, group.files?.[0]?.path || ''])));
      setDuplicateScanSummary({
        scanned_video_files: Number(result?.scanned_video_files) || 0,
        skipped_items: Number(result?.skipped_items) || 0,
      });
      setDuplicateFeedback(groups.length
        ? `Encontrados ${groups.length} grupo(s) de cópias idênticas. Nenhum arquivo foi selecionado para remoção.`
        : 'Nenhuma cópia exata foi encontrada nesta pasta.');
    } catch (error) {
      setDuplicateFeedback(`Não foi possível concluir a análise: ${String(error)}`);
    } finally {
      setDuplicateBusy(false);
    }
  };

  const chooseDuplicateToKeep = (groupKey, path) => {
    setDuplicateKeepPaths(current => ({ ...current, [groupKey]: path }));
    setDuplicateDeletePaths(current => current.filter(selectedPath => selectedPath !== path));
  };

  const toggleDuplicateDelete = (path, checked) => {
    setDuplicateDeletePaths(current => checked
      ? (current.includes(path) ? current : [...current, path])
      : current.filter(selectedPath => selectedPath !== path));
  };

  const moveSelectedDuplicatesToRecycleBin = async () => {
    if (!duplicateFolder || selectedDuplicateFiles.length === 0) return;
    setDuplicateBusy(true);
    const movedPaths = [];
    const failures = [];

    for (const file of selectedDuplicateFiles) {
      try {
        await invoke('move_duplicate_to_recycle_bin', {
          folderPath: duplicateFolder,
          filePath: file.path,
          expectedSha256: file.sha256,
        });
        movedPaths.push(file.path);
      } catch (error) {
        failures.push(`${file.name}: ${String(error)}`);
      }
    }

    if (movedPaths.length) {
      setDuplicateGroups(current => current
        .map(group => ({ ...group, files: group.files.filter(file => !movedPaths.includes(file.path)) }))
        .filter(group => group.files.length > 1));
      setDuplicateDeletePaths(current => current.filter(path => !movedPaths.includes(path)));
      setDuplicateKeepPaths(current => {
        const next = { ...current };
        for (const group of duplicateGroups) {
          if (movedPaths.includes(next[group.key])) {
            const remaining = group.files.find(file => !movedPaths.includes(file.path));
            if (remaining) next[group.key] = remaining.path;
            else delete next[group.key];
          }
        }
        return next;
      });
    }

    const success = `${movedPaths.length} vídeo(s) enviado(s) à Lixeira do Windows.`;
    setDuplicateFeedback(failures.length ? `${success} ${failures.length} arquivo(s) não puderam ser removidos: ${failures.join(' | ')}` : success);
    setModal('duplicates');
    setDuplicateBusy(false);
    setNotice(success);
  };

  const chooseLocalUpdateFolder = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: true,
        title: translateText('Escolher pasta de atualizações do Edit Master', language),
      });
      if (!selected) return;
      localStorage.setItem(LOCAL_UPDATE_FOLDER_KEY, selected);
      localStorage.setItem(AUTO_LOCAL_UPDATE_KEY, 'true');
      localStorage.removeItem(DISMISSED_LOCAL_UPDATE_KEY);
      setLocalUpdateCandidate(null);
      setLocalUpdatePath('');
      setExpectedLocalUpdateSha256('');
      setLocalUpdateFolder(selected);
      setAutoLocalUpdate(true);
      setNotice('Pasta de atualizações salva. O Edit Master verificará essa pasta automaticamente na próxima inicialização. Você também pode usar Verificar pasta agora.');
    } catch (error) {
      setNotice(`Não foi possível selecionar a pasta: ${String(error)}`);
    }
  };
  const toggleAutoLocalUpdate = (enabled) => {
    localStorage.setItem(AUTO_LOCAL_UPDATE_KEY, String(enabled));
    setAutoLocalUpdate(enabled);
    setNotice(enabled ? 'Verificação automática da pasta local ativada.' : 'Verificação automática da pasta local pausada.');
  };
  const chooseLocalUpdate = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: translateText('Selecionar atualização do Edit Master', language),
        filters: [{ name: translateText('Instalador do Edit Master (Windows)', language), extensions: ['exe'] }],
      });
      if (!selected) return;
      setLocalUpdateCandidate(null);
      setExpectedLocalUpdateSha256('');
      setLocalUpdatePath(selected);
      setModal('confirm-local-update');
    } catch (error) {
      setNotice(`Não foi possível abrir o seletor de arquivos: ${String(error)}`);
    }
  };
  const dismissDetectedLocalUpdate = () => {
    if (localUpdateCandidate) {
      localStorage.setItem(DISMISSED_LOCAL_UPDATE_KEY, `${localUpdateCandidate.version}:${localUpdateCandidate.sha256}`);
    }
    setLocalUpdateCandidate(null);
    setLocalUpdatePath('');
    setExpectedLocalUpdateSha256('');
    setModal('');
  };
  const installLocalUpdate = async () => {
    if (!localUpdatePath) return;
    setUpdating(true);
    try {
      await invoke('launch_local_update', {
        installerPath: localUpdatePath,
        expectedSha256: expectedLocalUpdateSha256 || null,
      });
      setNotice('O instalador foi iniciado. O Edit Master será fechado para permitir a atualização.');
    } catch (error) {
      setNotice(`Não foi possível iniciar a atualização: ${String(error)}`);
      setUpdating(false);
      setLocalUpdatePath('');
      setExpectedLocalUpdateSha256('');
      setModal('settings');
    }
  };
  const uninstall = async () => {
    setUninstalling(true);
    try { await invoke('launch_uninstaller'); setNotice('O desinstalador foi iniciado. O Edit Master será fechado.'); }
    catch (e) { setNotice(`Desinstalador não encontrado: ${String(e)}. Use Aplicativos instalados do Windows para remover esta versão de desenvolvimento.`); setUninstalling(false); }
  };

  return <LocalizedTree language={language}><div className={`app-shell motion-${preferences.animations} ${preferences.visualEffects ? '' : 'no-effects'} ${preferences.economyMode ? 'economy-mode' : ''}`} data-theme={theme} onDragOver={e=>e.preventDefault()} onDrop={e=>{ if (screen !== 'editor' || !e.dataTransfer.files?.length) return; importFiles(e.dataTransfer.files); }}>
    {screen === 'home' ? <main className="welcome-screen">
      <div className="welcome-orbit welcome-orbit-one"/><div className="welcome-orbit welcome-orbit-two"/>
      <div className="welcome-topline"><span className="welcome-status"><i/> VIDEO EDITING STUDIO</span><span className="version">{runtimeVersion} BETA</span></div>
      <section className="welcome-content">
        <div className="welcome-brand-lockup" aria-label="Edit Master">
          <div className="welcome-wordmark"><span>EDIT</span><strong>MASTER</strong></div>
          <div className="welcome-brand-underline"/>
          <span className="welcome-tagline">CREATE WITHOUT LIMITS.</span>
        </div>
        <p className="welcome-copy">Seu espaço para transformar ideias em vídeos.</p>
        <div className="welcome-action-grid">
          <button className="welcome-action welcome-action-primary" onClick={createNewProject}><span className="welcome-action-icon"><FilePlus2 size={22}/></span><span><b>Novo projeto</b><small>Comece uma edição do zero</small></span><ChevronRight size={18}/></button>
          <button className="welcome-action" onClick={openProject}><span className="welcome-action-icon"><FolderOpen size={22}/></span><span><b>Carregar projeto</b><small>Continue de onde parou</small></span><ChevronRight size={18}/></button>
          <button className="welcome-action" onClick={openSettings}><span className="welcome-action-icon"><Settings2 size={22}/></span><span><b>Configurações</b><small>Personalize o Edit Master</small></span><ChevronRight size={18}/></button>
        </div>
        <button className="welcome-ai-link" onClick={openAiHub}><Sparkles size={15}/> Abrir AI Hub <span>GPT · Gemini · Claude · Whisper local</span></button>
      </section>
      <div className="welcome-bottom"><span>EDIT MASTER {runtimeVersion}</span><span>GRATUITO · CÓDIGO ABERTO · GPL-3.0</span></div>
    </main> : <>
    <header className="topbar">
      <button className="brand brand-home-button" onClick={returnToHome} title="Voltar ao início"><div className="brand-mark"><span>M</span></div><div className="brand-name">Edit <b>Master</b><small>VIDEO STUDIO</small></div><span className="version">{runtimeVersion} BETA</span></button>
      <button className="project-pill" onClick={()=>{const n=prompt('Nome do projeto',projectName); if(n?.trim()){setProjectName(n.trim());setDirty(true);}}}>{projectName} <ChevronDown size={14}/>{dirty && <i/>}</button>
      <div className="top-actions"><button className="subtle-button ai-topbar-button" onClick={openAiHub}><Sparkles size={15}/> AI Hub</button><button className="subtle-button" onClick={openYouTubePublish}><Youtube size={15}/> YouTube</button><button className="subtle-button" onClick={()=>setModal('help')}><CircleHelp size={15}/> Ajuda</button><button className="subtle-button" onClick={openProject}>Abrir projeto</button><button className="subtle-button" onClick={saveProject}>Salvar projeto + mídia</button><button className="export-button" onClick={()=>setModal('export')} disabled={exportBusy}><Upload size={15}/> {exportBusy ? 'Exportando…' : 'Exportar MP4'}</button></div>
    </header>
    <div className="menu-row"><span>Arquivo</span><span>Editar</span><span>Visualizar</span><span onClick={openSettings}>Configurações</span><span>Ajuda</span><div className="menu-spacer"/><span className="project-status"><i/> {dirty?'Alterações não salvas':'Projeto local'}</span></div>
    <main className="workspace">
      <aside className="media-panel panel">
        <div className="panel-heading"><div><span className="eyebrow">01 / ASSETS</span><h2>Biblioteca de mídia</h2></div></div>
        <button className="import-button" onClick={chooseMediaFiles}><Import size={16}/> Importar arquivos <span>Ctrl + I</span></button>
        <button className="stock-hub-launch" onClick={openStockHub}><Images size={14}/> Media Hub <span>STOCK</span></button>
        <button className="duplicate-scan-button" onClick={extractAudio} disabled={exportBusy}><AudioLines size={13}/> Extrair áudio de mídia</button>
        <button className="duplicate-scan-button" onClick={chooseDuplicateFolder}><Search size={13}/> Procurar vídeos duplicados</button>
        <div className="search-box"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar mídia..."/><SlidersHorizontal size={14}/></div>
        <div className="media-tabs">{[['all','Tudo'],['video','Vídeos'],['image','Imagens'],['audio','Áudios']].map(([id,label])=><button key={id} className={filter===id?'active-tab':''} onClick={()=>setFilter(id)}>{label}</button>)}</div>
        <div className="media-list">{visibleMedia.length===0?<div className="empty-media"><div className="empty-icon"><FolderOpen size={25}/></div><b>{media.length?'Nenhum resultado':'Sua biblioteca está vazia'}</b><span>{media.length?'Tente outro termo ou filtro.':'Arraste arquivos para cá ou importe vídeos, imagens e áudios.'}</span><button onClick={chooseMediaFiles}>Selecionar arquivos</button></div>:visibleMedia.map(item=><div key={item.id} draggable onDragStart={e=>{dragId.current=item.id;e.dataTransfer.setData('text/media-id',item.id);}} className={`media-item ${selectedMedia===item.id?'chosen':''}`} onClick={()=>select(item)}><div className="thumb">{item.type==='image'?<img src={item.url} alt=""/>:item.type==='video'?<Film size={19}/>:<AudioLines size={19}/>}</div><div className="media-meta"><b translate="no" title={item.name}>{item.name}</b><span>{item.type.toUpperCase()} · {(item.size/1048576).toFixed(1)} MB</span></div><div className="media-item-actions"><button className="add-clip" title="Adicionar à timeline" onClick={e=>{e.stopPropagation();addClip(item);}}><Plus size={15}/></button><button className="media-trash-button" title="Excluir mídia" aria-label={`Excluir ${item.name}`} disabled={mediaDeleteBusy} onClick={e=>{e.stopPropagation();void removeMediaFromLibrary(item);}}><Trash2 size={14}/></button></div></div>)}</div>
        <div className="storage-note"><Layers3 size={14}/>{media.length} arquivos · {(media.reduce((s,m)=>s+m.size,0)/1048576).toFixed(1)} MB referenciados</div>
      </aside>
      <section className="preview-panel panel">
        <div className="panel-heading"><div><span className="eyebrow">02 / MONITOR</span><h2>Pré-visualização</h2></div><div className="monitor-actions"><span>AJUSTAR</span><button className="icon-button" title="Tela cheia" onClick={()=>document.querySelector('.preview-stage')?.requestFullscreen?.()}><Maximize2 size={16}/></button></div></div>
        <div className="preview-stage">
          {active?.type === 'video' ? <div className="video-preview-wrap">
            <video
              ref={videoRef}
              src={active.url}
              style={previewClip?.type === 'video' ? previewStyle : undefined}
              onLoadedMetadata={e => {
                const d = e.currentTarget.duration || 0;
                const pending = pendingSeekRef.current;
                const initial = pending?.mediaId === active.id ? Math.min(pending.time, d) : 0;
                setDuration(d); setTime(initial); e.currentTarget.currentTime = initial;
                if (pending?.mediaId === active.id) pendingSeekRef.current = null;
                setMedia(old => old.map(m => m.id === active.id ? { ...m, duration: d } : m));
                setClips(old => old.map(c => c.mediaId === active.id && c.durationPending ? { ...c, duration: d, start: 0, end: d, durationPending: false } : c));
              }}
              onTimeUpdate={e => handlePlayerTimeUpdate('video', e)}
              onEnded={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            {activeTextCue && <div className={`text-cue ${activeTextCue.kind === 'title' ? 'text-cue-title' : 'text-cue-subtitle'}`}><span translate="no">{activeTextCue.text}</span></div>}
            {activeTextCue && <button className="cue-remove-button" onClick={removeActiveTextCue}>Remover texto atual</button>}
          </div> : active?.type === 'image' ? <div className="image-preview-wrap">
            <img className="preview-image" src={active.url} alt={active.name} style={previewClip?.type === 'image' ? previewStyle : undefined}/>
            {activeTextCue && <div className={`text-cue ${activeTextCue.kind === 'title' ? 'text-cue-title' : 'text-cue-subtitle'}`}>{activeTextCue.text}</div>}
            {activeTextCue && <button className="cue-remove-button" onClick={removeActiveTextCue}>Remover texto atual</button>}
          </div> : active?.type === 'audio' ? <div className="audio-preview">
            <div className="audio-art"><Music2 size={42}/></div><b translate="no">{active.name}</b><span>Áudio selecionado</span>
            <audio ref={audioRef} controls src={active.url}
              onLoadedMetadata={e => {
                const d = e.currentTarget.duration || 0;
                const pending = pendingSeekRef.current;
                const initial = pending?.mediaId === active.id ? Math.min(pending.time, d) : 0;
                setDuration(d); setTime(initial); e.currentTarget.currentTime = initial;
                if (pending?.mediaId === active.id) pendingSeekRef.current = null;
                setMedia(old => old.map(m => m.id === active.id ? { ...m, duration: d } : m));
                setClips(old => old.map(c => c.mediaId === active.id && c.durationPending ? { ...c, duration: d, start: 0, end: d, durationPending: false } : c));
              }}
              onTimeUpdate={e => handlePlayerTimeUpdate('audio', e)}
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            />
          </div> : <div className="preview-empty"><div className="preview-logo"><span>M</span></div><b>Seu próximo projeto começa aqui.</b><span>Importe uma mídia e selecione-a na biblioteca para visualizar.</span></div>}
        </div>
        <div className="scrub-row"><span>{fmt(time)}</span><input aria-label="Posição da mídia" type="range" min="0" max={duration||1} step="0.05" value={Math.min(time,duration||1)} onChange={e=>seek(e.target.value)} disabled={!active || (active.type==='image' && !selectedClip) || (active.type!=='video' && active.type!=='audio' && active.type!=='image')}/><span>{fmt(duration)}</span></div>
        <div className="preview-controls"><div className="transport"><button className="icon-button" title="Voltar ao início" onClick={()=>seek(0)}><ChevronLeft size={17}/></button><button className="play-button" onClick={togglePlay}>{playing?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button><button className="icon-button" title="Avançar 5 segundos" onClick={()=>seek(Math.min(duration,time+5))}><ChevronRight size={17}/></button></div><div className="preview-tools"><button className="icon-button" title={muted?'Ativar som':'Silenciar'} onClick={()=>setMuted(v=>!v)}>{muted?<VolumeX size={16}/>:<Volume2 size={16}/>}</button><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></div></div>
      </section>
      <aside className="inspector-panel panel">
        <div className="panel-heading"><div><span className="eyebrow">03 / CONTROLES</span><h2>Inspetor</h2></div><button className="icon-button" onClick={()=>setInspectorTab('properties')} title="Propriedades"><Settings2 size={17}/></button></div>
        {selectedClipData ? <>
          <div className="inspector-tabs">
            <button className={inspectorTab==='properties'?'active':''} onClick={()=>setInspectorTab('properties')}>Geral</button>
            <button className={inspectorTab==='audio'?'active':''} disabled={selectedClipData.type!=='audio'} onClick={()=>setInspectorTab('audio')}>Áudio</button>
            <button className={inspectorTab==='overlay'?'active':''} disabled={selectedClipData.type!=='image'} onClick={()=>setInspectorTab('overlay')}>Sobreposição</button>
            <button className={inspectorTab==='motion'?'active':''} disabled={!['video','image'].includes(selectedClipData.type)} onClick={()=>setInspectorTab('motion')}>Motion</button>
          </div>
          {inspectorTab==='audio' && selectedClipData.type==='audio' ? <div className="inspector-content clip-settings-panel">
            <div className="inspector-file"><div className="inspector-thumb"><Music2/></div><b translate="no">{selectedClipData.name}</b><small>Configurações da faixa de áudio</small></div>
            <label>Volume do clipe · {Math.round((selectedClipData.audioGain ?? 1)*100)}%</label><input {...propertyEditHandlers} type="range" min="0" max="1" step="0.01" value={selectedClipData.audioGain ?? 1} onChange={e=>updateSelectedClipProperties({audioGain:Number(e.target.value)})}/>
            <label>Fade-in · segundos</label><input {...propertyEditHandlers} className="inspector-number" type="number" min="0" max="30" step="0.1" value={selectedClipData.audioFadeIn ?? 0} onChange={e=>updateSelectedClipProperties({audioFadeIn:Math.max(0,Math.min(30,Number(e.target.value)||0))})}/>
            <label>Fade-out · segundos</label><input {...propertyEditHandlers} className="inspector-number" type="number" min="0" max="30" step="0.1" value={selectedClipData.audioFadeOut ?? 0} onChange={e=>updateSelectedClipProperties({audioFadeOut:Math.max(0,Math.min(30,Number(e.target.value)||0))})}/>
            <label className="inspector-check"><input {...propertyEditHandlers} type="checkbox" checked={Boolean(selectedClipData.audioMuted)} onChange={e=>updateSelectedClipProperties({audioMuted:e.target.checked})}/> Silenciar este clipe</label>
            <p className="inspector-note">Volume e silêncio afetam a prévia. Os fades ficam salvos no projeto, mas ainda aguardam o motor de renderização para serem aplicados no MP4.</p>
          </div> : inspectorTab==='overlay' && selectedClipData.type==='image' ? <div className="inspector-content clip-settings-panel">
            <div className="inspector-file"><div className="inspector-thumb"><ImageIcon/></div><b>{selectedClipData.name}</b><small>Configurações da sobreposição</small></div>
            <label>Posição horizontal · {Math.round(previewTransform.x)}%</label><input {...propertyEditHandlers} type="range" min="0" max="100" value={previewTransform.x} onChange={e=>updateSelectedClipProperties({overlayX:Number(e.target.value)})}/>
            <label>Posição vertical · {Math.round(previewTransform.y)}%</label><input {...propertyEditHandlers} type="range" min="0" max="100" value={previewTransform.y} onChange={e=>updateSelectedClipProperties({overlayY:Number(e.target.value)})}/>
            <label>Escala · {Math.round(previewTransform.scale)}%</label><input {...propertyEditHandlers} type="range" min="10" max="200" value={previewTransform.scale} onChange={e=>updateSelectedClipProperties({overlayScale:Number(e.target.value)})}/>
            <label>Opacidade · {Math.round(previewTransform.opacity)}%</label><input {...propertyEditHandlers} type="range" min="0" max="100" value={previewTransform.opacity} onChange={e=>updateSelectedClipProperties({overlayOpacity:Number(e.target.value)})}/>
            <label>Rotação · {Math.round(previewTransform.rotation)}°</label><input {...propertyEditHandlers} type="range" min="-180" max="180" value={previewTransform.rotation} onChange={e=>updateSelectedClipProperties({overlayRotation:Number(e.target.value)})}/>
            <p className="inspector-note">Os ajustes aparecem na prévia e ficam salvos no projeto. A composição de camadas no vídeo exportado virá com o renderizador.</p>
          </div> : inspectorTab==='motion' && ['video','image'].includes(selectedClipData.type) ? <div className="inspector-content clip-settings-panel motion-inspector">
            <div className="inspector-file"><div className="inspector-thumb"><Wand2/></div><b>Movimento e keyframes</b><small translate="no">{selectedClipData.name}</small></div>
            <div className="keyframe-toolbar"><span>{(selectedClipData.keyframes || []).length} ponto(s) · cursor {fmt(time)}</span><button className="subtle-button" onClick={addKeyframeAtPlayhead}>Adicionar keyframe</button><button className="subtle-button" onClick={removeKeyframeAtPlayhead}>Remover neste ponto</button></div>
            <label>Posição X · {Math.round(previewTransform.x)}%</label><input {...propertyEditHandlers} type="range" min="0" max="100" value={previewTransform.x} onChange={e=>updateSelectedClipProperties({overlayX:Number(e.target.value)})}/>
            <label>Posição Y · {Math.round(previewTransform.y)}%</label><input {...propertyEditHandlers} type="range" min="0" max="100" value={previewTransform.y} onChange={e=>updateSelectedClipProperties({overlayY:Number(e.target.value)})}/>
            <label>Escala · {Math.round(previewTransform.scale)}%</label><input {...propertyEditHandlers} type="range" min="10" max="250" value={previewTransform.scale} onChange={e=>updateSelectedClipProperties({overlayScale:Number(e.target.value)})}/>
            <label>Rotação · {Math.round(previewTransform.rotation)}°</label><input {...propertyEditHandlers} type="range" min="-180" max="180" value={previewTransform.rotation} onChange={e=>updateSelectedClipProperties({overlayRotation:Number(e.target.value)})}/>
            <label>Opacidade · {Math.round(previewTransform.opacity)}%</label><input {...propertyEditHandlers} type="range" min="0" max="100" value={previewTransform.opacity} onChange={e=>updateSelectedClipProperties({overlayOpacity:Number(e.target.value)})}/>
            <p className="inspector-note">Os keyframes são interpolados linearmente no tempo original da mídia. A prévia mostra a transformação animada; a exportação final ainda não está disponível.</p>
          </div> : <div className="inspector-content clip-settings-panel">
            <div className="inspector-file"><div className="inspector-thumb">{selectedClipData.type==='audio'?<Music2/>:selectedClipData.type==='image'?<ImageIcon/>:<Film/>}</div><b>{selectedClipData.name}</b><small>Propriedades do clipe</small></div>
            <label>Duração do segmento</label><div className="inspector-value">{fmt(selectedClipData.duration)}</div>
            <label>Tipo de mídia</label><div className="inspector-value">{selectedClipData.type.toUpperCase()}</div>
            <label>Velocidade de prévia</label><select {...propertyEditHandlers} className="settings-select wide" value={selectedClipData.playbackSpeed ?? 1} onChange={e=>updateSelectedClipProperties({playbackSpeed:Number(e.target.value)})}><option value="0.25">0,25×</option><option value="0.5">0,5×</option><option value="0.75">0,75×</option><option value="1">1×</option><option value="1.25">1,25×</option><option value="1.5">1,5×</option><option value="2">2×</option></select>
            {['video','image'].includes(selectedClipData.type) && <>
              <div className="settings-section-title settings-section-spaced"><SlidersHorizontal size={14}/> Correção de cor (prévia)</div>
              <label>Brilho · {Math.round(selectedClipData.colorBrightness ?? 100)}%</label><input {...propertyEditHandlers} type="range" min="50" max="150" value={selectedClipData.colorBrightness ?? 100} onChange={e=>updateSelectedClipProperties({colorBrightness:Number(e.target.value)})}/>
              <label>Contraste · {Math.round(selectedClipData.colorContrast ?? 100)}%</label><input {...propertyEditHandlers} type="range" min="50" max="150" value={selectedClipData.colorContrast ?? 100} onChange={e=>updateSelectedClipProperties({colorContrast:Number(e.target.value)})}/>
              <label>Saturação · {Math.round(selectedClipData.colorSaturation ?? 100)}%</label><input {...propertyEditHandlers} type="range" min="0" max="200" value={selectedClipData.colorSaturation ?? 100} onChange={e=>updateSelectedClipProperties({colorSaturation:Number(e.target.value)})}/>
              <label>Temperatura quente · {Math.round(selectedClipData.colorWarmth ?? 0)}%</label><input {...propertyEditHandlers} type="range" min="0" max="100" value={selectedClipData.colorWarmth ?? 0} onChange={e=>updateSelectedClipProperties({colorWarmth:Number(e.target.value)})}/>
              <p className="inspector-note">Correções de cor e velocidade são aplicadas na prévia e salvas no projeto. A exportação MP4 atual aplica apenas parte dos efeitos disponíveis.</p>
            </>}
            <button className="danger-button" onClick={()=>removeClip(selectedClipData.clipId)}><Trash2 size={14}/> Remover da timeline</button>
          </div>}
        </> : <div className="inspector-empty"><SlidersHorizontal size={25}/><b>Nada selecionado</b><span>Selecione um clipe na timeline para ver as propriedades gerais, áudio, sobreposição e movimento.</span></div>}
        <div className="quick-tips"><Sparkles size={16}/><b>Fluxo de trabalho</b><p>As propriedades e os keyframes são preservados no projeto. Use Ctrl+Z para desfazer alterações do inspetor.</p></div>
      </aside>
    </main>
    <section className="timeline-panel panel" ref={timelineRef} onDragOver={e=>e.preventDefault()} onDrop={dropToTimeline}>
      <div className="timeline-header"><div className="timeline-title"><div><span className="eyebrow">04 / MONTAGEM</span><h2>Linha do tempo</h2></div><span className="track-hint">Clique no clipe para posicionar o cursor · {fmt(time)}</span></div><div className="timeline-actions"><button className="icon-button" title="Desfazer (Ctrl+Z)" onClick={undoTimeline} disabled={!canUndo}><Undo2 size={15}/></button><button className="icon-button" title="Refazer (Ctrl+Y)" onClick={redoTimeline} disabled={!canRedo}><Redo2 size={15}/></button><button className="icon-button split-action" title="Dividir clipe no ponto atual do monitor" onClick={splitAtPlayhead} disabled={!selectedClip}><Scissors size={16}/></button><button className="subtle-button timeline-mini-action" title="Importar legendas SRT para o vídeo selecionado" onClick={importSrt}>SRT</button><button className="subtle-button timeline-mini-action" title="Adicionar um título no ponto atual" onClick={addTitleCue}>Título</button><button className="icon-button" title="Adicionar mídia" onClick={chooseMediaFiles}><Plus size={17}/></button><button className="icon-button" title="Limpar timeline" onClick={clearTimeline} disabled={!clips.length}><Trash2 size={16}/></button><button className="icon-button" title="Diminuir zoom" onClick={()=>setZoom(z=>Math.max(.6,z-.1))}><ZoomOut size={15}/></button><button className="icon-button" title="Aumentar zoom" onClick={()=>setZoom(z=>Math.min(2,z+.1))}><ZoomIn size={15}/></button></div></div>
      <div className="ruler-wrap"><div className="ruler-label">TEMPO</div><div className="ruler" style={{'--zoom':zoom}}>{Array.from({length:7},(_,i)=><span key={i}>{fmt(i*5)}</span>)}</div></div>
      <div className="tracks"><div className="track-labels"><div><Film size={15}/> Vídeo</div><div><Music2 size={15}/> Áudio</div><div><ImageIcon size={15}/> Sobreposição</div></div><div className="track-lanes"><div className="lane" onClick={()=>setSelectedClip(null)}>{clips.filter(c=>c.type!=='audio').map(c=><button key={c.clipId} className={`clip video-clip ${selectedClip===c.clipId?'clip-selected':''}`} style={{width:`${Math.max(92,c.duration*18*zoom)}px`}} onClick={e=>selectTimelineClipFromPointer(c,e)} title={`${c.name} · clique no ponto desejado para posicionar o cursor · ${fmt(c.start||0)}–${fmt(c.end||c.duration)}`}><span>{c.type==='image'?<ImageIcon size={12}/>:<Film size={12}/>} <span translate="no">{c.name}</span></span><small>{fmt(c.duration)}</small>{selectedClip===c.clipId&&time>=(c.start||0)&&time<=(c.end??((c.start||0)+c.duration))&&<i className="clip-position-marker" style={{left:`${Math.max(0,Math.min(100,((time-(c.start||0))/Math.max(.001,c.duration))*100))}%`}}/>}</button>)}{!clips.some(c=>c.type!=='audio')&&<span className="lane-placeholder">Solte vídeos e imagens aqui</span>}</div><div className="lane audio-lane" onClick={()=>setSelectedClip(null)}>{clips.filter(c=>c.type==='audio').map(c=><button key={c.clipId} className={`clip audio-clip ${selectedClip===c.clipId?'clip-selected':''}`} style={{width:`${Math.max(92,c.duration*18*zoom)}px`}} onClick={e=>selectTimelineClipFromPointer(c,e)} title={`${c.name} · clique no ponto desejado para posicionar o cursor`}>{c.name}<small>{fmt(c.duration)}</small>{selectedClip===c.clipId&&time>=(c.start||0)&&time<=(c.end??((c.start||0)+c.duration))&&<i className="clip-position-marker" style={{left:`${Math.max(0,Math.min(100,((time-(c.start||0))/Math.max(.001,c.duration))*100))}%`}}/>}</button>)}{!clips.some(c=>c.type==='audio')&&<span className="lane-placeholder">Solte trilhas de áudio aqui</span>}</div><div className="lane overlay-lane">{clips.filter(c=>c.type==='image').map(c=><button key={`ov-${c.clipId}`} className="clip overlay-clip" style={{width:`${Math.max(92,c.duration*18*zoom)}px`}} onClick={e=>selectTimelineClipFromPointer(c,e)} title={`${c.name} · clique no ponto desejado para posicionar o cursor`}>{c.name}{selectedClip===c.clipId&&time>=(c.start||0)&&time<=(c.end??((c.start||0)+c.duration))&&<i className="clip-position-marker" style={{left:`${Math.max(0,Math.min(100,((time-(c.start||0))/Math.max(.001,c.duration))*100))}%`}}/>}</button>)}{!clips.some(c=>c.type==='image')&&<span className="lane-placeholder">Imagens e elementos sobrepostos</span>}</div></div></div>
      <div className="timeline-footer"><span>{clips.length} clipe(s) · {fmt(totalDuration)} de duração estimada</span><span>Prévia local · 1920 × 1080 · 60 FPS (alvo)</span></div>
    </section>
    <footer className="statusbar"><span><i className="status-dot"/> {notice}</span><span>EDIT MASTER {runtimeVersion} · WINDOWS</span></footer>
    </>}

    {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget && modal!=='language-welcome'){if(modal==='local-update-found')dismissDetectedLocalUpdate();else if(modal==='confirm-duplicate-delete')setModal('duplicates');else setModal('');}}}><section className="modal-card"><div className="modal-head"><div><span className="eyebrow">{modal==='language-welcome'?'WELCOME · BEM-VINDO · BIENVENIDO':modal==='ai-hub'?'INTELIGÊNCIA ARTIFICIAL':modal==='stock-hub'?'BIBLIOTECA DE MÍDIA':modal==='youtube-publish'?'PUBLICAÇÃO':modal==='export'?'RENDERIZAÇÃO MP4':modal==='export-complete'?'EXPORTAÇÃO CONCLUÍDA':modal==='settings'?'PREFERÊNCIAS':(modal==='duplicates'||modal==='confirm-duplicate-delete')?'LIMPEZA DE MÍDIA':modal==='confirm-uninstall'?'CONFIRMAÇÃO':(modal==='confirm-local-update'||modal==='local-update-found')?'ATUALIZAÇÃO LOCAL':'CENTRAL DE AJUDA'}</span><h2>{modal==='language-welcome'?'Escolha seu idioma · Choose your language · Elige tu idioma':modal==='ai-hub'?'Edit Master AI Hub':modal==='stock-hub'?'Media Hub':modal==='youtube-publish'?'Publicar no YouTube':modal==='export'?'Exportar vídeo MP4':modal==='export-complete'?'Seu vídeo está pronto':modal==='settings'?'Configurações do aplicativo':modal==='duplicates'?'Vídeos duplicados':modal==='confirm-duplicate-delete'?'Confirmar envio à Lixeira':modal==='confirm-uninstall'?'Confirmar desinstalação':modal==='confirm-local-update'?'Confirmar atualização':modal==='local-update-found'?'Atualização local encontrada':'Primeiros passos'}</h2></div>{modal!=='language-welcome'&&<button className="icon-button" onClick={()=>modal==='local-update-found'?dismissDetectedLocalUpdate():modal==='confirm-duplicate-delete'?setModal('duplicates'):setModal('')}><X size={18}/></button>}</div>{modal==='language-welcome'?<div className="language-welcome-body"><p>Selecione o idioma que deseja usar no Edit Master. You can change this later in Settings. Puedes cambiarlo después en Configuración.</p><div className="language-choice-grid"><button className="language-choice" onClick={()=>chooseLanguage('pt-BR')}><b>Português</b><span>Brasil</span></button><button className="language-choice" onClick={()=>chooseLanguage('en')}><b>English</b><span>United States / International</span></button><button className="language-choice" onClick={()=>chooseLanguage('es')}><b>Español</b><span>Latinoamérica / España</span></button></div><p className="language-note">Você poderá alterar o idioma a qualquer momento nas configurações.</p></div>:modal==='ai-hub'?<AiHub language={language} mediaItems={media} selectedMediaId={selectedMedia} onSelectMedia={setSelectedMedia} subtitles={subtitles} onApplySrt={applyAiSubtitles} onClose={()=>setModal('')} setNotice={setNotice}/>:modal==='stock-hub'?<StockHub language={language} onMediaAdded={addDownloadedStockMedia} onClose={()=>setModal('')} setNotice={setNotice}/>:modal==='youtube-publish'?<YouTubePublish language={language} initialVideoPath={lastExportedPath} onClose={()=>setModal('')} setNotice={setNotice}/>:modal==='export'?<div className="export-modal-body"><div className="export-modal-intro"><b>Renderizar a montagem para MP4</b><p>A exportação atual concatena segmentos visuais e mistura o áudio. Nem todas as camadas, transições e títulos da prévia são renderizados ainda.</p></div><div className="export-setting-row"><div><b>FFmpeg</b><small>{ffmpegPath || 'FFmpeg será detectado automaticamente no instalador; você também pode selecionar outra instalação.'}</small></div><button className="subtle-button" onClick={chooseFfmpeg}>Selecionar ffmpeg.exe</button></div><div className="export-setting-row"><div><b>Predefinição</b><small>1920 × 1080 · 60 FPS · H.264 · AAC · qualidade CRF 20</small></div><span className="settings-tag">MP4</span></div><div className="ai-consent-note"><LockKeyhole size={14}/><span>FFmpeg e FFprobe incluídos no instalador são detectados automaticamente. Uma instalação própria também pode ser selecionada.</span></div><div className="modal-actions"><button className="subtle-button" disabled={exportBusy} onClick={()=>setModal('')}>Cancelar</button><button className="export-button" disabled={exportBusy||!clips.length} onClick={exportTimeline}>{exportBusy?'Renderizando…':'Escolher destino e exportar'}</button></div></div>:modal==='export-complete'?<div className="confirm-body"><p>O MP4 foi criado em:</p><div translate="no" className="selected-installer-path">{lastExportedPath}</div><p>Você pode publicar esse vídeo diretamente no YouTube agora ou fechar esta janela.</p><div className="modal-actions"><button className="subtle-button" onClick={()=>setModal('')}>Fechar</button><button className="export-button" onClick={openYouTubePublish}><Youtube size={15}/> Publicar no YouTube</button></div></div>:modal==='settings'?<div className="settings-body">
      <div className="settings-section-title"><Gauge size={15}/><span>Personalização</span></div>
      <div className="settings-row"><div><b>Tema de cores</b><p>Escolha a identidade visual do Edit Master. A alteração é aplicada imediatamente e salva neste computador.</p></div><select className="settings-select" value={theme} onChange={e=>setTheme(e.target.value)}><option value="orange">Laranja e preto (clássico)</option><option value="blue">Azul e preto</option><option value="green">Verde e amarelo</option><option value="black">Preto absoluto</option><option value="white">Branco absoluto</option><option value="mixed">Preto e branco (mesclado)</option></select></div>
      <div className="settings-row"><div><b>Idioma do aplicativo</b><p>Selecione o idioma da interface. Sua escolha será lembrada nas próximas inicializações.</p></div><select className="settings-select" value={language} onChange={e=>chooseLanguage(e.target.value)}><option value="pt-BR">Português (Brasil)</option><option value="en">English</option><option value="es">Español</option></select></div>
      <div className="settings-section-title settings-section-spaced"><Gauge size={15}/><span>Desempenho e aparência</span></div>
      <div className="settings-row"><div><b>Animações da interface</b><p>Escolha entre fluidez máxima, movimentos reduzidos ou animações desativadas. A opção máxima prioriza transições suaves sem efeitos pesados constantes.</p></div><select className="settings-select" value={draftPreferences.animations} onChange={e=>{setSettingsFeedback('');setDraftPreferences(v=>({...v,animations:e.target.value}));}}><option value="full">Fluidez máxima</option><option value="reduced">Reduzidas</option><option value="off">Desativadas</option></select></div>
      <div className="settings-row"><div><b>Efeitos visuais</b><p>Desative gradientes e sombras decorativas para economizar recursos gráficos.</p></div><label className="settings-switch"><input type="checkbox" checked={draftPreferences.visualEffects} onChange={e=>{setSettingsFeedback('');setDraftPreferences(v=>({...v,visualEffects:e.target.checked}));}}/><span>{draftPreferences.visualEffects?'Ativados':'Desativados'}</span></label></div>
      <div className="settings-row"><div><b>Modo econômico</b><p>Reduz atualizações visuais frequentes durante a reprodução e simplifica elementos da interface.</p></div><label className="settings-switch"><input type="checkbox" checked={draftPreferences.economyMode} onChange={e=>{setSettingsFeedback('');setDraftPreferences(v=>({...v,economyMode:e.target.checked}));}}/><span>{draftPreferences.economyMode?'Ativado':'Desativado'}</span></label></div>
      <div className="settings-row"><div><b>Orçamento de cache auxiliar</b><p>Reserva de referência para miniaturas e prévias temporárias. Não é um limite rígido da RAM total usada pelo Windows ou pelo aplicativo.</p></div><select className="settings-select" value={draftPreferences.cacheBudgetMB} onChange={e=>{setSettingsFeedback('');setDraftPreferences(v=>({...v,cacheBudgetMB:Number(e.target.value)}));}}><option value="128">128 MB</option><option value="256">256 MB</option><option value="512">512 MB</option><option value="1024">1 GB</option><option value="2048">2 GB</option></select></div>
      <div className="settings-section-title settings-section-spaced"><Sparkles size={15}/><span>Atalhos de teclado</span></div>
      <div className="settings-row"><div><b>Dividir clipe</b><p>Tecla usada para acionar a tesoura quando o foco não está em um campo de texto.</p></div><select className="settings-select" value={draftPreferences.shortcuts?.split || 's'} onChange={e=>{setSettingsFeedback('');setDraftPreferences(v=>({...v,shortcuts:{...DEFAULT_PREFERENCES.shortcuts,...(v.shortcuts||{}),split:e.target.value}}));}}><option value="s">S</option><option value="x">X</option><option value="d">D</option></select></div>
      <div className="settings-row"><div><b>Reproduzir / pausar</b><p>Atalho para controlar o monitor de pré-visualização.</p></div><select className="settings-select" value={draftPreferences.shortcuts?.play || 'Space'} onChange={e=>{setSettingsFeedback('');setDraftPreferences(v=>({...v,shortcuts:{...DEFAULT_PREFERENCES.shortcuts,...(v.shortcuts||{}),play:e.target.value}}));}}><option value="Space">Espaço</option><option value="k">K</option></select></div>
      <div className="settings-footnote">As alterações ficam em rascunho até você clicar em Aplicar. O orçamento de cache é uma preferência reservada para o futuro mecanismo de miniaturas/pré-visualizações; ainda não limita a RAM total do processo. Vulkan/OpenGL dependem da integração futura de um motor de vídeo compatível.</div>
      <div className="settings-actions"><div className={`settings-feedback ${preferencesChanged ? 'pending' : 'applied'}`} role="status" aria-live="polite"><i/>{settingsFeedback || (preferencesChanged ? 'Há alterações aguardando aplicação.' : 'Configurações aplicadas')}</div><div className="settings-action-buttons"><button className="subtle-button settings-reset" onClick={resetPreferences}>Restaurar padrão</button><button className="export-button settings-apply" onClick={applyPreferences} disabled={!preferencesChanged}>Aplicar alterações</button></div></div>
      <div className="settings-section-title settings-section-spaced"><FolderOpen size={15}/><span>Armazenamento de mídia</span></div>
      <div className="settings-row"><div><b>Pasta para vídeos, imagens e áudios</b><p>{mediaStorageFolder || 'Nenhuma pasta escolhida. Você pode manter o aplicativo no SSD e guardar as mídias em outro disco, como um HD.'}</p></div><button className="subtle-button" onClick={chooseMediaStorageFolder}>{mediaStorageFolder?'Alterar pasta':'Escolher pasta'}</button></div>
      <div className="settings-row"><div><b>Como funciona</b><p>Quando uma pasta estiver configurada, os próximos arquivos importados pelo botão Importar serão copiados para ela. Os originais serão preservados. Arquivos com nomes repetidos receberão um sufixo para evitar sobrescrita. A pasta pode ficar em outro disco, por exemplo D:\\EditMaster-Midia.</p></div><span className="settings-tag">{mediaStorageFolder?'Ativo':'Não configurado'}</span></div>
      <div className="settings-section-title settings-section-spaced"><Settings2 size={15}/><span>Aplicativo</span></div>
      <div className="settings-row"><div><b>Verificar atualizações online</b><p>A verificação online ainda depende da publicação oficial e da configuração das chaves de assinatura.</p></div><button className="subtle-button" onClick={checkUpdates}>Verificar</button></div>
      <div className="settings-row"><div><b>Pasta de atualizações locais</b><p>{localUpdateFolder || 'Nenhuma pasta configurada. Escolha uma pasta que contenha o instalador e edit-master-update.json.'}</p></div><button className="subtle-button" onClick={chooseLocalUpdateFolder}>{localUpdateFolder?'Alterar pasta':'Escolher pasta'}</button></div>
      <div className="settings-row"><div><b>Detectar atualizações automaticamente ao abrir</b><p>Verifica a pasta escolhida uma única vez ao abrir o aplicativo. Não há verificações em segundo plano; você também pode verificar manualmente. A instalação só começa com sua confirmação.</p></div><label className="settings-switch"><input type="checkbox" checked={autoLocalUpdate} disabled={!localUpdateFolder} onChange={e=>toggleAutoLocalUpdate(e.target.checked)}/><span>{!localUpdateFolder?'Aguardando pasta':autoLocalUpdate?'Ativado':'Desativado'}</span></label></div>
      <div className="settings-row"><div><b>Verificar pasta agora</b><p>Procura imediatamente por uma versão local mais recente e valida o SHA-256 do instalador.</p></div><button className="subtle-button" onClick={()=>checkLocalUpdateFolder({notifyEmpty:true,forcePrompt:true})} disabled={!localUpdateFolder}>Verificar agora</button></div>
      <div className="settings-row"><div><b>Instalar atualização local manualmente</b><p>Você também pode selecionar diretamente um instalador .exe. Essa opção não compara a versão pelo manifesto.</p></div><button className="subtle-button" onClick={chooseLocalUpdate}>Selecionar arquivo .exe</button></div>
      <div className="settings-row"><div><b>Versão instalada</b><p>Edit Master {runtimeVersion} Beta</p></div><span className="settings-tag">BETA</span></div>
      <div className="settings-row"><div><b>Desinstalar aplicativo</b><p>Inicia o desinstalador incluído na instalação do Windows. A versão de desenvolvimento pode não ter desinstalador.</p></div><button className="danger-button" disabled={uninstalling} onClick={()=>setModal('confirm-uninstall')}><Trash2 size={14}/> Desinstalar</button></div>
      <div className="settings-footnote">A busca automática desta versão acontece somente ao iniciar o aplicativo, é local e não usa internet. Não há consultas periódicas em segundo plano. Use Verificar pasta agora para uma consulta manual. Ela exige o arquivo edit-master-update.json na pasta escolhida. O SHA-256 detecta alterações acidentais ou divergências, mas não substitui assinatura digital nem prova quem publicou o instalador. A instalação sempre exige sua confirmação. A atualização online continua planejada.</div>
    </div>:modal==='duplicates'?<div className="duplicate-scan-body">
      <div className="duplicate-intro"><b>Análise de cópias exatas</b><p>O Edit Master compara o conteúdo dos vídeos por SHA-256, não apenas o nome. A busca inclui subpastas da pasta selecionada. Escolha uma pasta específica de vídeos, não a raiz do disco inteiro. Nada será removido sem você marcar os arquivos e confirmar.</p><div className="duplicate-root">Pasta analisada: <span translate="no">{duplicateFolder}</span></div></div>
      {duplicateBusy?<div className="duplicate-empty"><Search size={22}/><b>Analisando arquivos de vídeo…</b><span>Pastas grandes podem levar alguns minutos. Não feche o aplicativo durante a análise.</span></div>:duplicateGroups.length? <div className="duplicate-groups">{duplicateGroups.map(group=><section className="duplicate-group" key={group.key}><div className="duplicate-group-head"><b>{group.files.length} cópias idênticas</b><span>{formatBytes(group.size_bytes)} cada · até {formatBytes(group.size_bytes*(group.files.length-1))} recuperáveis</span></div>{group.files.map(file=><div className="duplicate-file-row" key={file.path}><label className="duplicate-keep"><input type="radio" name={`keep-${group.key}`} checked={duplicateKeepPaths[group.key]===file.path} onChange={()=>chooseDuplicateToKeep(group.key,file.path)}/><span>Manter</span></label><label className="duplicate-delete"><input type="checkbox" checked={duplicateDeletePaths.includes(file.path)} disabled={duplicateKeepPaths[group.key]===file.path} onChange={event=>toggleDuplicateDelete(file.path,event.target.checked)}/><span>Enviar à Lixeira</span></label><div className="duplicate-file-info"><b translate="no" title={file.name}>{file.name}</b><small translate="no" title={file.path}>{file.path}</small><small>{file.modified_unix?new Date(file.modified_unix*1000).toLocaleString():'Data desconhecida'}</small></div></div>)}</section>)}</div>:<div className="duplicate-empty"><Check size={23}/><b>{duplicateFeedback || 'Nenhuma cópia exata foi encontrada.'}</b><span>Foram analisados {duplicateScanSummary.scanned_video_files} arquivo(s) de vídeo.{duplicateScanSummary.skipped_items?` ${duplicateScanSummary.skipped_items} item(ns) não puderam ser lidos.`:''}</span></div>}
      {duplicateFeedback&&duplicateGroups.length>0&&<div className="duplicate-feedback" role="status">{duplicateFeedback}</div>}
      <div className="duplicate-footer"><span>{duplicateScanSummary.scanned_video_files} vídeo(s) analisado(s) · {selectedDuplicateFiles.length} selecionado(s) · {formatBytes(selectedDuplicateBytes)}</span><div className="modal-actions"><button className="subtle-button" onClick={()=>setModal('')}>Fechar</button><button className="danger-button" disabled={duplicateBusy||selectedDuplicateFiles.length===0} onClick={()=>setModal('confirm-duplicate-delete')}><Trash2 size={14}/> Enviar à Lixeira</button></div></div>
    </div>:modal==='confirm-duplicate-delete'?<div className="confirm-body"><p>Você está prestes a enviar <b>{selectedDuplicateFiles.length} vídeo(s)</b> ({formatBytes(selectedDuplicateBytes)}) para a Lixeira do Windows.</p><p>Os arquivos não serão apagados permanentemente e poderão ser restaurados pela Lixeira. O Edit Master vai conferir novamente o SHA-256 antes de mover cada arquivo. A cópia marcada como <b>Manter</b> não pode ser selecionada para remoção.</p><div className="modal-actions"><button className="subtle-button" disabled={duplicateBusy} onClick={()=>setModal('duplicates')}>Voltar</button><button className="danger-button" disabled={duplicateBusy||selectedDuplicateFiles.length===0} onClick={moveSelectedDuplicatesToRecycleBin}>{duplicateBusy?'Movendo…':'Confirmar e enviar à Lixeira'}</button></div></div>:modal==='confirm-uninstall'?<div className="confirm-body"><p>Tem certeza de que deseja iniciar a desinstalação do Edit Master? Salve seu projeto antes de continuar.</p><div className="modal-actions"><button className="subtle-button" onClick={openSettings}>Cancelar</button><button className="danger-button" onClick={uninstall}>Sim, desinstalar</button></div></div>:modal==='local-update-found'?<div className="confirm-body"><p>Uma versão mais recente foi encontrada na pasta local configurada:</p><div className="local-update-version"><span>Instalada</span><b>{localUpdateCandidate?.currentVersion}</b><span>Disponível</span><b>{localUpdateCandidate?.version}</b></div><div className="selected-installer-path">{localUpdateCandidate?.installerName}<br/>{localUpdateCandidate?.installerPath}</div><p>O SHA-256 do instalador corresponde ao manifesto local. Isso verifica a integridade do arquivo, mas não é uma assinatura digital do publicador. Só continue se você confia na origem desse instalador. Salve seus projetos antes de atualizar.</p><div className="modal-actions"><button className="subtle-button" disabled={updating} onClick={dismissDetectedLocalUpdate}>Mais tarde</button><button className="export-button" disabled={updating||!localUpdateCandidate} onClick={installLocalUpdate}>{updating?'Iniciando…':'Atualizar agora'}</button></div></div>:modal==='confirm-local-update'?<div className="confirm-body"><p>Você selecionou este instalador:</p><div translate="no" className="selected-installer-path">{localUpdatePath}</div><p>Continue apenas se o arquivo foi obtido de uma fonte oficial e confiável do Edit Master. O Setup será executado e o aplicativo será fechado. Salve seus projetos antes de continuar.</p><div className="modal-actions"><button className="subtle-button" disabled={updating} onClick={()=>{openSettings();setLocalUpdatePath('');}}>Cancelar</button><button className="export-button" disabled={updating} onClick={installLocalUpdate}>{updating?'Iniciando…':'Executar instalador e atualizar'}</button></div></div>:<HelpCenter language={language} onClose={()=>setModal('')}/>}</section></div>}
  </div></LocalizedTree>;
}
export default App;

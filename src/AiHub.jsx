import { withLocalization } from './i18n.js';
import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Bot, CheckCircle2, Cpu, FileAudio, FolderOpen, KeyRound, Languages, LoaderCircle, LockKeyhole, Mic2, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react';
import { parseSrt } from './editing.js';

const PROVIDERS = [
  { id: 'gpt', name: 'GPT', brand: 'OpenAI', icon: Bot, subtitle: 'Transcrição em nuvem', description: 'Gera uma transcrição do áudio e cria legendas SRT.' },
  { id: 'gemini', name: 'Gemini', brand: 'Google', icon: Sparkles, subtitle: 'Transcrição em nuvem', description: 'Transcreve áudio com suporte a marcações de tempo e falantes, conforme a resposta do modelo.' },
  { id: 'claude', name: 'Claude', brand: 'Anthropic', icon: Wand2, subtitle: 'Revisão de legendas', description: 'Revisa ou traduz legendas SRT existentes. Não recebe nem transcreve o áudio.' },
  { id: 'local', name: 'Whisper local', brand: 'No computador', icon: Cpu, subtitle: 'Processamento offline', description: 'Transcreve usando whisper.cpp sem enviar o áudio a um serviço de IA externo.' },
];
const PROVIDER_KEY = 'edit-master-ai-provider';
const WHISPER_EXE_KEY = 'edit-master-whisper-executable';
const WHISPER_MODEL_KEY = 'edit-master-whisper-model';
const FFMPEG_KEY = 'edit-master-ffmpeg-path';

function makeSrt(cues) {
  const stamp = (seconds) => {
    const ms = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const milli = ms % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
  };
  return cues.map((cue, index) => `${index + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${String(cue.text || '').trim()}`).join('\n\n');
}

function AiHub({ mediaItems = [], selectedMediaId, onSelectMedia, subtitles = [], onApplySrt, onClose, setNotice }) {
  const [provider, setProvider] = useState(() => localStorage.getItem(PROVIDER_KEY) || 'local');
  const [task, setTask] = useState('generate');
  const [language, setLanguage] = useState('pt');
  const [targetLanguage, setTargetLanguage] = useState('English');
  const [apiKey, setApiKey] = useState('');
  const [keyStatuses, setKeyStatuses] = useState({ gpt: false, gemini: false, claude: false });
  const [keyBusy, setKeyBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [whisperExecutable, setWhisperExecutable] = useState(() => localStorage.getItem(WHISPER_EXE_KEY) || '');
  const [whisperModel, setWhisperModel] = useState(() => localStorage.getItem(WHISPER_MODEL_KEY) || '');
  const [ffmpegPath, setFfmpegPath] = useState(() => localStorage.getItem(FFMPEG_KEY) || '');
  const [targetId, setTargetId] = useState(selectedMediaId || mediaItems.find(item => item.type === 'video' || item.type === 'audio')?.id || '');

  const availableMedia = useMemo(() => mediaItems.filter(item => item.type === 'video' || item.type === 'audio'), [mediaItems]);
  const targetMedia = availableMedia.find(item => item.id === targetId) || null;
  const selectedProvider = PROVIDERS.find(item => item.id === provider) || PROVIDERS[3];
  const existingCues = subtitles.filter(cue => cue.mediaId === targetMedia?.id && cue.kind !== 'title');
  const hasCloudKey = Boolean(keyStatuses[provider]);

  useEffect(() => {
    if (!availableMedia.some(item => item.id === targetId) && availableMedia.length) setTargetId(availableMedia[0].id);
  }, [availableMedia, targetId]);
  useEffect(() => {
    let cancelled = false;
    invoke('get_bundled_media_tools').then(tools => {
      if (cancelled || !tools) return;
      if (tools.whisperExecutable && !localStorage.getItem(WHISPER_EXE_KEY)) {
        setWhisperExecutable(tools.whisperExecutable);
        localStorage.setItem(WHISPER_EXE_KEY, tools.whisperExecutable);
      }
      if (tools.whisperModelPath && !localStorage.getItem(WHISPER_MODEL_KEY)) {
        setWhisperModel(tools.whisperModelPath);
        localStorage.setItem(WHISPER_MODEL_KEY, tools.whisperModelPath);
      }
      if (tools.ffmpegPath && !localStorage.getItem(FFMPEG_KEY)) {
        setFfmpegPath(tools.ffmpegPath);
        localStorage.setItem(FFMPEG_KEY, tools.ffmpegPath);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem(PROVIDER_KEY, provider);
    setTask(provider === 'claude' ? 'correct' : 'generate');
    setFeedback('');
  }, [provider]);

  useEffect(() => {
    if (provider === 'local') return;
    let cancelled = false;
    invoke('ai_provider_key_status', { provider })
      .then(status => { if (!cancelled) setKeyStatuses(current => ({ ...current, [provider]: Boolean(status) })); })
      .catch(error => { if (!cancelled) setFeedback(`Não foi possível consultar a credencial: ${String(error)}`); });
    return () => { cancelled = true; };
  }, [provider]);

  const selectPath = async (kind) => {
    try {
      const config = kind === 'whisper'
        ? { title: 'Selecionar whisper-cli.exe', filters: [{ name: 'Executável Whisper', extensions: ['exe'] }] }
        : kind === 'model'
          ? { title: 'Selecionar modelo Whisper', filters: [{ name: 'Modelo Whisper', extensions: ['bin'] }] }
          : { title: 'Selecionar ffmpeg.exe', filters: [{ name: 'FFmpeg', extensions: ['exe'] }] };
      const selected = await open({ multiple: false, directory: false, ...config });
      if (!selected || Array.isArray(selected)) return;
      if (kind === 'whisper') { setWhisperExecutable(selected); localStorage.setItem(WHISPER_EXE_KEY, selected); }
      if (kind === 'model') { setWhisperModel(selected); localStorage.setItem(WHISPER_MODEL_KEY, selected); }
      if (kind === 'ffmpeg') { setFfmpegPath(selected); localStorage.setItem(FFMPEG_KEY, selected); }
      setFeedback('Caminho salvo neste computador.');
    } catch (error) {
      setFeedback(`Não foi possível abrir o seletor: ${String(error)}`);
    }
  };

  const saveKey = async () => {
    if (!apiKey.trim()) { setFeedback('Digite a chave da API antes de salvar.'); return; }
    setKeyBusy(true);
    try {
      await invoke('save_ai_provider_key', { provider, apiKey: apiKey.trim() });
      setKeyStatuses(current => ({ ...current, [provider]: true }));
      setApiKey('');
      setFeedback(`Credencial ${selectedProvider.brand} salva no Cofre de Credenciais do Windows.`);
    } catch (error) {
      setFeedback(`Não foi possível salvar a chave: ${String(error)}`);
    } finally { setKeyBusy(false); }
  };

  const removeKey = async () => {
    setKeyBusy(true);
    try {
      await invoke('remove_ai_provider_key', { provider });
      setKeyStatuses(current => ({ ...current, [provider]: false }));
      setFeedback('Chave removida do Cofre de Credenciais do Windows.');
    } catch (error) {
      setFeedback(`Não foi possível remover a chave: ${String(error)}`);
    } finally { setKeyBusy(false); }
  };

  const runTask = async () => {
    if (!targetMedia) { setFeedback('Importe e selecione primeiro um vídeo ou áudio.'); return; }
    if (!targetMedia.sourcePath) { setFeedback('Esta mídia não tem um caminho de arquivo permanente. Reimporte pelo botão Importar arquivos.'); return; }
    setBusy(true);
    setFeedback('Processando… isso pode levar alguns minutos.');
    try {
      let srtText = '';
      if (provider === 'claude') {
        if (!existingCues.length) throw new Error('Não existem legendas SRT importadas ou geradas para esta mídia. Gere ou importe legendas primeiro.');
        srtText = makeSrt(existingCues);
        srtText = await invoke('refine_subtitles_with_claude', {
          srtText,
          operation: task === 'translate' ? 'translate' : 'correct',
          targetLanguage,
        });
      } else if (provider === 'local') {
        if (!whisperExecutable || !whisperModel) throw new Error('Os componentes Whisper não foram encontrados no instalador. Reinstale o Edit Master ou selecione whisper-cli.exe e o modelo Whisper .bin manualmente.');
        srtText = await invoke('transcribe_local_whisper', {
          mediaPath: targetMedia.sourcePath,
          mediaType: targetMedia.type,
          whisperExecutable,
          modelPath: whisperModel,
          ffmpegPath: ffmpegPath || null,
          language: language || 'auto',
        });
      } else {
        if (!hasCloudKey) throw new Error(`Salve uma chave de API válida da ${selectedProvider.brand} antes de iniciar.`);
        srtText = await invoke('transcribe_media_with_ai', {
          provider,
          mediaPath: targetMedia.sourcePath,
          mediaType: targetMedia.type,
          duration: Number(targetMedia.duration) || 0,
          language: language || 'auto',
          ffmpegPath: ffmpegPath || null,
        });
      }
      const cues = parseSrt(srtText, targetMedia.id, () => crypto.randomUUID());
      if (!cues.length) throw new Error('O provedor não retornou legendas SRT válidas. As legendas existentes foram mantidas.');
      onApplySrt?.(targetMedia.id, cues);
      setFeedback(`${cues.length} legenda(s) processada(s) com ${selectedProvider.name}.`);
      setNotice?.(`AI Hub: ${cues.length} legenda(s) aplicadas em “${targetMedia.name}”.`);
    } catch (error) {
      setFeedback(`Falha no AI Hub: ${String(error)}`);
    } finally { setBusy(false); }
  };

  return <div className="ai-hub-body">
    <div className="ai-hub-intro"><div className="ai-hub-mark"><Sparkles size={26}/></div><div><span className="eyebrow">EDIT MASTER INTELLIGENCE</span><h3>AI Hub</h3><p>Escolha o mecanismo para criar, revisar ou traduzir legendas.</p></div></div>
    <div className="ai-provider-grid">
      {PROVIDERS.map(item => { const Icon = item.icon; return <button type="button" key={item.id} className={`ai-provider-card ${provider === item.id ? 'selected' : ''}`} onClick={() => setProvider(item.id)}><div className="ai-provider-icon"><Icon size={20}/></div><div><b>{item.name}</b><small>{item.brand}</small></div>{provider === item.id && <CheckCircle2 className="ai-provider-check" size={16}/>}<span>{item.subtitle}</span></button>; })}
    </div>
    <div className="ai-provider-description"><b>{selectedProvider.name}</b><span>{selectedProvider.description}</span></div>
    {provider !== 'local' && <section className="ai-config-section">
      <div className="ai-section-title"><KeyRound size={15}/> <b>Credencial de API</b><span className={`ai-key-status ${hasCloudKey ? 'connected' : ''}`}>{hasCloudKey ? 'Conectada' : 'Não configurada'}</span></div>
      <div className="ai-key-row"><input type="password" autoComplete="off" spellCheck="false" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={`Cole sua chave da ${selectedProvider.brand} aqui`}/><button className="export-button" disabled={keyBusy || !apiKey.trim()} onClick={saveKey}>{keyBusy ? 'Salvando…' : 'Salvar chave'}</button></div>
      {hasCloudKey && <button className="ai-remove-key" disabled={keyBusy} onClick={removeKey}><Trash2 size={13}/> Remover chave salva</button>}
      <p className="ai-help-copy"><LockKeyhole size={13}/> A chave é armazenada no Cofre de Credenciais do Windows, não no projeto nem no navegador.</p>
    </section>}
    {provider === 'local' && <section className="ai-config-section">
      <div className="ai-section-title"><Cpu size={15}/> <b>Modelo local Whisper.cpp</b><span className="ai-key-status connected">Offline</span></div>
      <div className="ai-path-row"><div><b>Executável whisper-cli.exe</b><small>{whisperExecutable || 'Detectando Whisper incluído no instalador…'}</small></div><button className="subtle-button" onClick={() => selectPath('whisper')}>Selecionar</button></div>
      <div className="ai-path-row"><div><b>Modelo de reconhecimento (.bin)</b><small>{whisperModel || 'Detectando modelo Tiny incluído no instalador…'}</small></div><button className="subtle-button" onClick={() => selectPath('model')}>Selecionar</button></div>
      <div className="ai-path-row"><div><b>FFmpeg (opcional para áudio; necessário para vídeo)</b><small>{ffmpegPath || 'FFmpeg incluído no instalador será detectado automaticamente'}</small></div><button className="subtle-button" onClick={() => selectPath('ffmpeg')}>Selecionar</button></div>
    </section>}
    <section className="ai-config-section">
      <div className="ai-section-title"><FileAudio size={15}/> <b>Mídia e tarefa</b></div>
      <label className="ai-field-label">Vídeo ou áudio</label>
      <select className="ai-select" value={targetId} onChange={event => { setTargetId(event.target.value); onSelectMedia?.(event.target.value); }}>
        <option value="">Selecione uma mídia importada</option>
        {availableMedia.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <div className="ai-fields-two"><div><label className="ai-field-label">Idioma do áudio</label><input className="ai-text-input" value={language} onChange={event => setLanguage(event.target.value)} placeholder="pt, en ou auto"/></div><div><label className="ai-field-label">Idioma de tradução</label><input className="ai-text-input" value={targetLanguage} onChange={event => setTargetLanguage(event.target.value)} placeholder="English, Português…"/></div></div>
      {provider === 'claude' ? <div className="ai-task-note"><Languages size={14}/> Claude revisa ou traduz legendas existentes. Primeiro gere ou importe um SRT com outro provedor.</div> : <div className="ai-task-note"><Mic2 size={14}/> {provider === 'gpt' ? 'O GPT retorna texto; os tempos das legendas serão estimados pela duração do arquivo nesta versão.' : provider === 'gemini' ? 'O Gemini pode retornar segmentos com tempos; a qualidade dos tempos depende da resposta da API.' : 'Whisper gera um arquivo SRT localmente, sem enviar seu áudio à nuvem.'}</div>}
      {provider === 'claude' && <label className="ai-field-label">Operação<select className="ai-select" value={task} onChange={event => setTask(event.target.value)}><option value="correct">Corrigir texto e pontuação</option><option value="translate">Traduzir legendas</option></select></label>}
      <div className="ai-consent-note"><LockKeyhole size={14}/><span>{provider === 'local' ? 'O áudio é processado neste computador. Vídeos precisam de FFmpeg para extrair o áudio.' : provider === 'claude' ? 'Somente o texto das legendas SRT será enviado à Anthropic. Custos de API podem ser aplicados.' : 'O áudio será enviado ao provedor selecionado apenas após clicar em gerar. APIs de nuvem podem cobrar pelo uso.'}</span></div>
      <div className="ai-run-row"><button className="subtle-button" onClick={onClose} disabled={busy}>Fechar</button><button className="export-button" disabled={busy || !targetMedia || (provider !== 'claude' && provider !== 'local' && !hasCloudKey)} onClick={runTask}>{busy ? <><LoaderCircle size={15} className="spin"/> Processando…</> : <><Upload size={15}/>{provider === 'claude' ? (task === 'translate' ? 'Traduzir legendas' : 'Revisar legendas') : 'Gerar legendas automaticamente'}</>}</button></div>
    </section>
    {feedback && <div className={`ai-feedback ${/Falha|Não foi possível|não existem|não tem/i.test(feedback) ? 'error' : ''}`} role="status">{feedback}</div>}
    <div className="ai-footer-note">As APIs de nuvem exigem contas e chaves próprias, e podem ter custos. A modalidade local não exige chave, mas precisa do executável e do modelo Whisper baixados pelo usuário.</div>
  </div>;
}

export default withLocalization(AiHub);

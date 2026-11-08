import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { CheckCircle2, ExternalLink, KeyRound, LoaderCircle, LockKeyhole, Upload, Youtube } from 'lucide-react';

export default function YouTubePublish({ initialVideoPath = '', onClose, setNotice }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoPath, setVideoPath] = useState(initialVideoPath);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [feedback, setFeedback] = useState('');
  const [publishedUrl, setPublishedUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    invoke('youtube_connection_status').then(value => { if (!cancelled) setConnected(Boolean(value)); })
      .catch(error => { if (!cancelled) setFeedback(`Não foi possível consultar a conexão: ${String(error)}`); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);

  const connect = async () => {
    if (!clientId.trim() || !clientSecret.trim()) { setFeedback('Informe o Client ID e o Client Secret do aplicativo OAuth do Google.'); return; }
    setConnecting(true); setFeedback('Abrindo o navegador para autorização segura do YouTube…');
    try {
      const message = await invoke('youtube_connect', { clientId: clientId.trim(), clientSecret: clientSecret.trim() });
      setConnected(true); setFeedback(String(message)); setClientSecret('');
    } catch (error) { setFeedback(`Falha ao conectar: ${String(error)}`); }
    finally { setConnecting(false); }
  };

  const disconnect = async () => {
    try { await invoke('youtube_disconnect'); setConnected(false); setFeedback('Conta desconectada. O token de atualização foi removido do Cofre do Windows.'); }
    catch (error) { setFeedback(`Não foi possível desconectar: ${String(error)}`); }
  };

  const chooseVideo = async () => {
    try {
      const selected = await open({ multiple: false, directory: false, title: 'Selecionar MP4 exportado', filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }] });
      if (selected && !Array.isArray(selected)) setVideoPath(selected);
    } catch (error) { setFeedback(`Não foi possível selecionar o MP4: ${String(error)}`); }
  };

  const upload = async () => {
    if (!connected) { setFeedback('Conecte primeiro uma conta Google.'); return; }
    if (!videoPath) { setFeedback('Selecione um arquivo MP4.'); return; }
    if (!title.trim()) { setFeedback('Informe um título para o vídeo.'); return; }
    setUploading(true); setFeedback('Enviando vídeo em blocos para o YouTube. Não feche o Edit Master durante o envio.'); setPublishedUrl('');
    try {
      const result = await invoke('upload_video_to_youtube', {
        filePath: videoPath,
        title: title.trim(),
        description,
        tags: tags.split(',').map(item => item.trim()).filter(Boolean),
        privacyStatus: privacy,
      });
      setPublishedUrl(result.videoUrl || '');
      setFeedback(`Vídeo enviado com sucesso. Privacidade: ${result.privacyStatus || privacy}.`);
      setNotice?.('O YouTube confirmou o envio do vídeo. Confira o processamento no YouTube Studio.');
    } catch (error) { setFeedback(`Falha no envio: ${String(error)}`); }
    finally { setUploading(false); }
  };

  return <div className="youtube-publish-body">
    <div className="youtube-intro"><div className="youtube-mark"><Youtube size={25}/></div><div><span className="eyebrow">EDIT MASTER PUBLISHING</span><h3>Publicar no YouTube</h3><p>Envie um MP4 exportado diretamente para seu canal.</p></div></div>
    <section className="youtube-section">
      <div className="youtube-section-head"><b><KeyRound size={15}/> Conexão Google OAuth</b><span className={`ai-key-status ${connected ? 'connected' : ''}`}>{checking ? 'Verificando…' : connected ? 'Conectado' : 'Desconectado'}</span></div>
      {!connected ? <>
        <label className="ai-field-label">OAuth Client ID (aplicativo Desktop)</label><input className="ai-text-input" value={clientId} onChange={event => setClientId(event.target.value)} placeholder="Client ID do Google Cloud" autoComplete="off"/>
        <label className="ai-field-label">OAuth Client Secret</label><input className="ai-text-input" type="password" value={clientSecret} onChange={event => setClientSecret(event.target.value)} placeholder="Client Secret" autoComplete="off"/>
        <button className="export-button" disabled={connecting || checking} onClick={connect}>{connecting ? <><LoaderCircle size={15} className="spin"/> Aguardando autorização</> : <><Youtube size={15}/> Conectar conta do YouTube</>}</button>
        <p className="ai-help-copy"><LockKeyhole size={13}/> Crie um cliente OAuth do tipo aplicativo Desktop no seu projeto Google Cloud e habilite YouTube Data API v3. As credenciais são guardadas no Cofre de Credenciais do Windows.</p>
      </> : <div className="youtube-connected"><CheckCircle2 size={18}/><span>Conta Google autorizada para enviar vídeos.</span><button className="ai-remove-key" onClick={disconnect}>Desconectar conta</button></div>}
    </section>
    <section className="youtube-section">
      <div className="youtube-section-head"><b><Upload size={15}/> Arquivo e detalhes</b></div>
      <div className="youtube-file-row"><span title={videoPath}>{videoPath || 'Nenhum MP4 selecionado'}</span><button className="subtle-button" onClick={chooseVideo}>Selecionar MP4</button></div>
      <label className="ai-field-label">Título (até 100 caracteres)</label><input className="ai-text-input" maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder="Título do vídeo"/>
      <label className="ai-field-label">Descrição</label><textarea className="ai-textarea" maxLength={5000} rows={4} value={description} onChange={event => setDescription(event.target.value)} placeholder="Descrição do vídeo"/>
      <label className="ai-field-label">Tags (separadas por vírgula)</label><input className="ai-text-input" value={tags} onChange={event => setTags(event.target.value)} placeholder="edição, tutorial, Edit Master"/>
      <label className="ai-field-label">Privacidade</label><select className="ai-select" value={privacy} onChange={event => setPrivacy(event.target.value)}><option value="private">Privado (padrão seguro)</option><option value="unlisted">Não listado</option><option value="public">Público</option></select>
      <div className="ai-consent-note"><LockKeyhole size={14}/><span>O MP4 será enviado ao Google/YouTube após você clicar em Enviar. O padrão é Privado; confira título, descrição, público e direitos do conteúdo antes de publicar.</span></div>
      <div className="youtube-actions"><button className="subtle-button" disabled={uploading} onClick={onClose}>Fechar</button><button className="export-button" disabled={!connected || uploading || !videoPath || !title.trim()} onClick={upload}>{uploading ? <><LoaderCircle size={15} className="spin"/> Enviando…</> : <><Upload size={15}/> Enviar para o YouTube</>}</button></div>
    </section>
    {publishedUrl && <a className="youtube-success-link" href={publishedUrl} target="_blank" rel="noreferrer"><CheckCircle2 size={15}/> Abrir vídeo no YouTube <ExternalLink size={13}/></a>}
    {feedback && <div className={`ai-feedback ${/Falha|Não foi possível|recusou/i.test(feedback) ? 'error' : ''}`} role="status">{feedback}</div>}
    <div className="youtube-footer">O Edit Master não inclui credenciais de desenvolvedor próprias. A API do YouTube está sujeita a OAuth, cotas e regras de publicação do Google.</div>
  </div>;
}

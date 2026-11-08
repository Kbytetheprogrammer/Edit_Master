import { withLocalization } from './i18n.js';
import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { AudioLines, CheckCircle2, Download, ExternalLink, Film, Image as ImageIcon, KeyRound, LoaderCircle, Music2, Search, ShieldCheck, Trash2, Video } from 'lucide-react';

const PROVIDERS = [
  { id: 'pexels', label: 'Pexels', description: 'Fotos e vídeos gratuitos' },
  { id: 'pixabay', label: 'Pixabay', description: 'Fotos e vídeos gratuitos' },
  { id: 'freesound', label: 'Freesound', description: 'Efeitos e gravações de áudio' },
];

const MEDIA_TYPES = {
  pexels: [{ id: 'image', label: 'Imagens' }, { id: 'video', label: 'Vídeos' }],
  pixabay: [{ id: 'image', label: 'Imagens' }, { id: 'video', label: 'Vídeos' }],
  freesound: [{ id: 'audio', label: 'Áudios' }],
};

function StockHub({ onMediaAdded, onClose, setNotice }) {
  const [provider, setProvider] = useState('pexels');
  const [mediaType, setMediaType] = useState('image');
  const [query, setQuery] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keyStatuses, setKeyStatuses] = useState({ pexels: false, pixabay: false, freesound: false });
  const [busyKey, setBusyKey] = useState(false);
  const [busySearch, setBusySearch] = useState(false);
  const [downloadingId, setDownloadingId] = useState('');
  const [results, setResults] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [page, setPage] = useState(1);

  const selectedProvider = PROVIDERS.find(item => item.id === provider) || PROVIDERS[0];
  const hasKey = Boolean(keyStatuses[provider]);
  const types = useMemo(() => MEDIA_TYPES[provider] || MEDIA_TYPES.pexels, [provider]);

  useEffect(() => {
    if (!types.some(item => item.id === mediaType)) setMediaType(types[0].id);
    setResults([]);
    setFeedback('');
    setPage(1);
  }, [provider]);

  useEffect(() => {
    let cancelled = false;
    invoke('stock_provider_key_status', { provider })
      .then(value => { if (!cancelled) setKeyStatuses(old => ({ ...old, [provider]: Boolean(value) })); })
      .catch(error => { if (!cancelled) setFeedback(`Não foi possível verificar a chave: ${String(error)}`); });
    return () => { cancelled = true; };
  }, [provider]);

  const saveKey = async () => {
    if (!apiKey.trim()) { setFeedback('Cole uma chave de API antes de salvar.'); return; }
    setBusyKey(true);
    try {
      await invoke('save_stock_provider_key', { provider, apiKey: apiKey.trim() });
      setKeyStatuses(old => ({ ...old, [provider]: true }));
      setApiKey('');
      setFeedback(`Chave ${selectedProvider.label} salva no Cofre de Credenciais do Windows.`);
    } catch (error) { setFeedback(String(error)); }
    finally { setBusyKey(false); }
  };

  const removeKey = async () => {
    setBusyKey(true);
    try {
      await invoke('remove_stock_provider_key', { provider });
      setKeyStatuses(old => ({ ...old, [provider]: false }));
      setFeedback('Chave removida do Cofre de Credenciais.');
      setResults([]);
    } catch (error) { setFeedback(String(error)); }
    finally { setBusyKey(false); }
  };

  const search = async () => {
    if (!hasKey) { setFeedback(`Configure primeiro a chave de API de ${selectedProvider.label}.`); return; }
    if (!query.trim()) { setFeedback('Digite o que deseja procurar.'); return; }
    setBusySearch(true); setFeedback('Buscando na biblioteca selecionada…');
    try {
      const found = await invoke('search_stock_media', { provider, query: query.trim(), mediaType });
      setResults(Array.isArray(found) ? found : []);
      setPage(1);
      setFeedback(found?.length ? `${found.length} resultado(s) encontrados. Confira a licença e a autoria antes de usar.` : 'Nenhum resultado encontrado. Tente outros termos.');
    } catch (error) { setResults([]); setFeedback(`Falha na busca: ${String(error)}`); }
    finally { setBusySearch(false); }
  };

  const addToLibrary = async (item) => {
    setDownloadingId(item.id);
    try {
      const folder = await open({ directory: true, multiple: false, title: 'Escolha onde salvar a mídia stock' });
      if (!folder || Array.isArray(folder)) return;
      const downloaded = await invoke('download_stock_media', {
        provider: item.provider,
        mediaType: item.mediaType,
        downloadUrl: item.downloadUrl,
        filename: item.name,
        targetFolder: folder,
        sourcePageUrl: item.pageUrl,
        author: item.author,
        license: item.license,
        licenseUrl: item.licenseUrl,
      });
      await onMediaAdded?.(downloaded);
      setFeedback(`“${downloaded.name}” foi baixado e adicionado à biblioteca de mídia.`);
      setNotice?.(`Media Hub: mídia adicionada por ${item.provider}. A origem e a licença foram preservadas no projeto.`);
    } catch (error) { setFeedback(`Não foi possível adicionar a mídia: ${String(error)}`); }
    finally { setDownloadingId(''); }
  };

  return <div className="stock-hub-body">
    <div className="stock-hub-intro">
      <div className="stock-hub-mark"><ImageIcon size={24}/></div>
      <div><span className="eyebrow">EDIT MASTER ASSET LIBRARY</span><h3>Media Hub</h3><p>Busque imagens, vídeos e sons gratuitos para adicionar ao projeto.</p></div>
    </div>
    <div className="stock-provider-tabs">
      {PROVIDERS.map(item => <button type="button" key={item.id} className={provider === item.id ? 'active' : ''} onClick={() => setProvider(item.id)}><b>{item.label}</b><small>{item.description}</small><span className={keyStatuses[item.id] ? 'stock-ready' : 'stock-not-ready'}>{keyStatuses[item.id] ? 'Chave conectada' : 'Configurar chave'}</span></button>)}
    </div>
    <section className="stock-config-section">
      <div className="ai-section-title"><KeyRound size={15}/><b>Credencial de API — {selectedProvider.label}</b><span className={`ai-key-status ${hasKey ? 'connected' : ''}`}>{hasKey ? 'Conectada' : 'Não configurada'}</span></div>
      {!hasKey ? <div className="ai-key-row"><input type="password" autoComplete="off" spellCheck="false" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={`Cole sua chave de API ${selectedProvider.label}`}/><button className="export-button" disabled={busyKey || !apiKey.trim()} onClick={saveKey}>{busyKey ? 'Salvando…' : 'Salvar chave'}</button></div> : <button className="ai-remove-key" disabled={busyKey} onClick={removeKey}><Trash2 size={13}/> Remover chave salva</button>}
      <p className="ai-help-copy"><ShieldCheck size={13}/> As chaves ficam no Cofre de Credenciais do Windows. O Edit Master não fornece chaves próprias.</p>
    </section>
    <section className="stock-search-section">
      <div className="stock-search-row"><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void search(); }} placeholder={provider === 'freesound' ? 'Ex.: chuva, passos, ambiente...' : 'Ex.: natureza, cidade, tecnologia...'}/><select className="ai-select" value={mediaType} onChange={event => setMediaType(event.target.value)}>{types.map(type => <option value={type.id} key={type.id}>{type.label}</option>)}</select><button className="export-button" disabled={busySearch || !hasKey} onClick={search}>{busySearch ? <><LoaderCircle size={15} className="spin"/> Buscando</> : <><Search size={15}/> Buscar</>}</button></div>
      <div className="stock-results-head"><b>Resultados</b><span>{results.length} item(ns)</span></div>
      {results.length ? <div className="stock-results-grid">{results.map(item => <article className="stock-result-card" key={`${item.provider}-${item.id}`}>
        <div className="stock-result-preview">
          {item.mediaType === 'audio' ? <div className="stock-audio-preview"><Music2 size={26}/><audio controls preload="none" src={item.previewUrl}/></div> : item.previewUrl ? <img src={item.previewUrl} alt={item.name} loading="lazy"/> : <div className="stock-no-preview">{item.mediaType === 'video' ? <Video size={25}/> : <ImageIcon size={25}/>}</div>}
          <span className="stock-result-type">{item.mediaType === 'audio' ? 'ÁUDIO' : item.mediaType === 'video' ? 'VÍDEO' : 'IMAGEM'}</span>
        </div>
        <div className="stock-result-info"><b title={item.name}>{item.name}</b><small>Por {item.author || 'Criador não informado'}</small><small className="stock-license">{item.license}</small><a href={item.pageUrl} target="_blank" rel="noreferrer"><ExternalLink size={12}/> Ver origem e licença</a><button className="subtle-button" disabled={downloadingId === item.id} onClick={() => addToLibrary(item)}>{downloadingId === item.id ? <><LoaderCircle size={14} className="spin"/> Baixando…</> : <><Download size={14}/> Adicionar à biblioteca</>}</button></div>
      </article>)}</div> : <div className="stock-empty"><Search size={22}/><b>Nenhum resultado para mostrar</b><span>Configure uma chave, digite um termo e clique em Buscar.</span></div>}
    </section>
    <div className="stock-attribution"><b>Créditos e licenças</b><span>Confira sempre a licença do material antes de publicar. O Edit Master salva um arquivo de origem/licença ao lado de cada download e preserva os créditos ao salvar o projeto.</span><span>Imagens e vídeos fornecidos por <a href="https://www.pexels.com" target="_blank" rel="noreferrer">Pexels</a> e <a href="https://pixabay.com" target="_blank" rel="noreferrer">Pixabay</a>. Áudios fornecidos por <a href="https://freesound.org" target="_blank" rel="noreferrer">Freesound</a>.</span></div>
    {feedback && <div className={`ai-feedback ${/Falha|Não foi possível|não encontrada/i.test(feedback) ? 'error' : ''}`} role="status">{feedback}</div>}
    <div className="stock-footer"><span>As APIs são gratuitas dentro dos limites e termos de cada provedor; cada usuário fornece sua chave.</span><button className="subtle-button" onClick={onClose}>Fechar Media Hub</button></div>
  </div>;
}

export default withLocalization(StockHub);

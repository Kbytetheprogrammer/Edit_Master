import { getRuntimeDiagnosticHistory } from './runtimeDiagnostics.js';

function sanitize(value) {
  return String(value ?? '')
    .replace(/([A-Z]:\\Users\\)[^\\\s]+/gi, '$1[USUARIO]')
    .replace(/(file:\/\/\/[^\s]*?Users\/)[^/\s]+/gi, '$1[USUARIO]')
    .replace(/\b(?:Bearer|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '[CREDENCIAL REDIGIDA]')
    .slice(0, 5000);
}

function status(label, value, detail = '') {
  return { label, value, detail: sanitize(detail) };
}

function withTimeout(promise, timeoutMs = 8000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Tempo limite excedido')), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Runs read-only compatibility checks. The only write is a temporary,
 * uniquely named storage probe which is removed immediately.
 * No project files, media names, API keys, tokens or user documents are read.
 */
export async function buildDiagnosticReport({ invoke, environment } = {}) {
  const env = environment || {
    window: typeof window !== 'undefined' ? window : null,
    navigator: typeof navigator !== 'undefined' ? navigator : null,
    document: typeof document !== 'undefined' ? document : null,
    localStorage: (() => { try { return globalThis.localStorage; } catch { return null; } })(),
    screen: typeof screen !== 'undefined' ? screen : null,
  };
  const checks = [];
  const now = new Date().toISOString();

  const doc = env.document;
  const win = env.window;
  const nav = env.navigator;
  checks.push(status('Documento da interface', doc?.readyState || 'indisponível', doc?.readyState === 'complete' || doc?.readyState === 'interactive' ? 'Documento carregado.' : 'Estado do documento não confirmado.'));
  checks.push(status('Elemento raiz React', doc?.getElementById?.('root') ? 'presente' : 'ausente', doc?.getElementById?.('root') ? 'Área principal localizada.' : 'O elemento #root não foi encontrado.'));
  checks.push(status('Contexto Tauri/WebView', win && (win.__TAURI_INTERNALS__ || win.__TAURI__) ? 'detectado' : 'não confirmado', 'A confirmação definitiva é a resposta dos comandos nativos abaixo.'));
  checks.push(status('Navegador/WebView', nav?.userAgent || 'não identificado'));
  checks.push(status('Plataforma', nav?.platform || 'não identificada'));
  checks.push(status('Núcleos lógicos', Number.isFinite(nav?.hardwareConcurrency) ? String(nav.hardwareConcurrency) : 'não informado'));
  checks.push(status('Conexão de rede', nav?.onLine === false ? 'offline' : nav?.onLine === true ? 'online' : 'não informada'));
  checks.push(status('Contexto seguro', win?.isSecureContext === true ? 'sim' : win?.isSecureContext === false ? 'não' : 'não informado'));
  checks.push(status('Tamanho da janela', win ? (String(win.innerWidth) + ' × ' + String(win.innerHeight)) : 'não informado'));
  checks.push(status('Tamanho da tela', env.screen ? (String(env.screen.width) + ' × ' + String(env.screen.height)) : 'não informado'));
  let cssCount = 0;
  try { cssCount = doc?.styleSheets?.length || 0; } catch { cssCount = -1; }
  checks.push(status('Folhas de estilo carregadas', cssCount < 0 ? 'bloqueadas' : String(cssCount), cssCount > 0 ? 'CSS detectado.' : 'Nenhuma folha de estilo foi detectada.'));
  let storageOk = false;
  let storageDetail = 'Armazenamento não disponível.';
  try {
    const storage = env.localStorage;
    if (!storage) throw new Error('localStorage indisponível');
    const key = '__edit_master_diagnostic_probe_' + Math.random().toString(36).slice(2);
    const probe = 'ok-' + Date.now();
    storage.setItem(key, probe);
    storageOk = storage.getItem(key) === probe;
    storage.removeItem(key);
    if (!storageOk) throw new Error('A leitura do valor de teste não correspondeu à gravação.');
    storageDetail = 'Gravação, leitura e remoção temporárias funcionaram.';
  } catch (error) {
    storageDetail = sanitize(error?.message || error);
  }
  checks.push(status('Armazenamento local', storageOk ? 'OK' : 'falha', storageDetail));

  let backendVersion = null;
  if (typeof invoke === 'function') {
    try {
      backendVersion = await withTimeout(invoke('get_app_version'));
      checks.push(status('Backend Rust/Tauri', 'respondendo', 'Versão informada pelo aplicativo: ' + sanitize(backendVersion)));
    } catch (error) {
      checks.push(status('Backend Rust/Tauri', 'falha', sanitize(error?.message || error)));
    }
    try {
      const tools = await withTimeout(invoke('get_bundled_media_tools'));
      const flags = [
        ['FFmpeg', Boolean(tools?.ffmpegPath)],
        ['FFprobe', Boolean(tools?.ffprobePath)],
        ['Whisper CLI', Boolean(tools?.whisperExecutable)],
        ['Modelo Whisper', Boolean(tools?.whisperModelPath)],
      ];
      flags.forEach(([name, found]) => checks.push(status('Recurso ' + name, found ? 'encontrado' : 'não encontrado', found ? 'Caminho válido retornado pelo backend; caminho completo omitido.' : 'O backend não encontrou o recurso no pacote instalado.')));
    } catch (error) {
      checks.push(status('Ferramentas de mídia', 'não verificadas', sanitize(error?.message || error)));
    }
  } else {
    checks.push(status('Backend Rust/Tauri', 'não testado', 'Função invoke não foi fornecida.'));
  }

  const history = getRuntimeDiagnosticHistory();
  const recentErrors = history.slice(-5);
  const lines = [
    'EDIT MASTER — VARREDURA DE DIAGNÓSTICO',
    'Gerado em: ' + now,
    'Atalho: Ctrl + Shift + D',
    '',
    'RESULTADOS',
    ...checks.map(check => '- ' + check.label + ': ' + check.value + (check.detail ? ' — ' + check.detail : '')),
    '',
    'ERROS RECENTES REGISTRADOS',
    recentErrors.length
      ? recentErrors.map((item, index) => '--- ERRO ' + (index + 1) + ' (' + sanitize(item.timestamp) + ') ---\n' + sanitize(item.report)).join('\n')
      : 'Nenhum erro recente foi registrado.',
    '',
    'PRIVACIDADE',
    'Esta varredura não lê nomes ou conteúdos de vídeos, áudios, imagens, projetos, documentos, chaves de API ou senhas. Caminhos completos das ferramentas nativas são omitidos.',
    'O relatório contém informações técnicas do WebView, estado do aplicativo e mensagens de erro recentes. Revise o texto antes de compartilhá-lo.',
  ];
  return { createdAt: now, checks, text: lines.join('\n'), backendVersion };
}

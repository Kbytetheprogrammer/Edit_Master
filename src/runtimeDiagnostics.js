import { invoke } from '@tauri-apps/api/core';
const DIAGNOSTICS_KEY = 'edit-master-runtime-diagnostics';
const MAX_DIAGNOSTICS = 12;
const inMemoryDiagnostics = [];

function errorDetails(error) {
  if (error instanceof Error) return {
    name: String(error.name || 'Error').slice(0, 120),
    message: String(error.message || 'Erro sem mensagem').slice(0, 3000),
    stack: String(error.stack || '').slice(0, 12000),
  };
  return { name: 'RuntimeError', message: String(error ?? 'Erro sem detalhes').slice(0, 3000), stack: '' };
}

export function formatRuntimeDiagnostic(error, details = {}) {
  const parsed = errorDetails(error);
  const lines = [
    'Edit Master - relatório de diagnóstico',
    'Data/hora: ' + String(details.timestamp || new Date().toISOString()),
    'Origem: ' + String(details.source || 'não identificada').slice(0, 200),
    'Erro: ' + parsed.name + ': ' + parsed.message,
  ];
  if (details.filename) lines.push('Arquivo: ' + String(details.filename).slice(0, 1000));
  if (details.line) lines.push('Linha: ' + String(details.line));
  if (details.column) lines.push('Coluna: ' + String(details.column));
  if (details.componentStack) lines.push('Pilha de componentes React:\n' + String(details.componentStack).slice(0, 8000));
  if (parsed.stack) lines.push('Pilha técnica:\n' + parsed.stack);
  try {
    if (typeof navigator !== 'undefined' && navigator.userAgent) lines.push('Ambiente: ' + String(navigator.userAgent).slice(0, 1000));
  } catch { /* Diagnostics must never create another error. */ }
  return lines.join('\n');
}

export function captureRuntimeDiagnostic(error, details = {}) {
  const report = formatRuntimeDiagnostic(error, details);
  const item = { timestamp: details.timestamp || new Date().toISOString(), report };
  inMemoryDiagnostics.push(item);
  if (inMemoryDiagnostics.length > MAX_DIAGNOSTICS) inMemoryDiagnostics.shift();
  try {
    const storage = typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
    const previous = storage ? JSON.parse(storage.getItem(DIAGNOSTICS_KEY) || '[]') : [];
    const safePrevious = Array.isArray(previous) ? previous.slice(-(MAX_DIAGNOSTICS - 1)) : [];
    safePrevious.push(item);
    storage?.setItem(DIAGNOSTICS_KEY, JSON.stringify(safePrevious));
  } catch { /* Keep the in-memory copy if WebView storage is unavailable. */ }
  try { console.error('[Edit Master] erro de execução', report); } catch { /* no-op */ }
  // Persist the error in the native Windows log. This still works when the
  // React interface later crashes and localStorage becomes unavailable.
  try {
    void invoke('write_runtime_diagnostic', { message: report }).catch((nativeError) => {
      try { console.error('[Edit Master] não foi possível gravar o log nativo', nativeError); } catch { /* no-op */ }
    });
  } catch { /* Native bridge may be unavailable during very early startup. */ }
  return report;
}

export function getRuntimeDiagnosticHistory() {
  try {
    const storage = typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
    const saved = storage ? JSON.parse(storage.getItem(DIAGNOSTICS_KEY) || '[]') : [];
    return Array.isArray(saved) ? saved.slice(-MAX_DIAGNOSTICS) : [...inMemoryDiagnostics];
  } catch { return [...inMemoryDiagnostics]; }
}

export function installRuntimeDiagnosticHandlers() {
  if (typeof window === 'undefined' || window.__EDIT_MASTER_DIAGNOSTICS_INSTALLED__) return false;
  window.__EDIT_MASTER_DIAGNOSTICS_INSTALLED__ = true;
  window.addEventListener('error', (event) => {
    const target = event.target;
    if (target && target !== window) {
      const tag = String(target.tagName || '').toUpperCase();
      if (!['SCRIPT', 'LINK'].includes(tag)) return;
      captureRuntimeDiagnostic(new Error('Falha ao carregar recurso ' + tag.toLowerCase() + '.'), {
        source: 'resource-load', filename: target.src || target.href || '',
      });
      return;
    }
    captureRuntimeDiagnostic(event.error || event.message || 'Erro global do JavaScript', {
      source: 'window.error', filename: event.filename, line: event.lineno, column: event.colno,
    });
  }, true);
  window.addEventListener('unhandledrejection', (event) => {
    captureRuntimeDiagnostic(event.reason || 'Promise rejeitada sem tratamento', { source: 'unhandledrejection' });
  });
  return true;
}

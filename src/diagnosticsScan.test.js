import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnosticReport } from './diagnosticsScan.js';

function makeEnvironment({ storage = null, withRoot = true } = {}) {
  return {
    window: { __TAURI_INTERNALS__: {}, innerWidth: 1440, innerHeight: 900, isSecureContext: true },
    navigator: { userAgent: 'Test WebView', platform: 'Win32', hardwareConcurrency: 8, onLine: true },
    document: { readyState: 'complete', getElementById: id => id === 'root' && withRoot ? {} : null, styleSheets: [1, 2] },
    localStorage: storage,
    screen: { width: 1920, height: 1080 },
  };
}

test('diagnostic scan checks the frontend and bundled media tools without exposing paths', async () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  const report = await buildDiagnosticReport({
    environment: makeEnvironment({ storage }),
    invoke: async command => command === 'get_app_version'
      ? '1.0.0'
      : { ffmpegPath: 'C:\\\\secret\\\\ffmpeg.exe', ffprobePath: 'C:\\\\secret\\\\ffprobe.exe', whisperExecutable: null, whisperModelPath: null },
  });
  assert.match(report.text, /Backend Rust\/Tauri: respondendo/);
  assert.match(report.text, /Recurso FFmpeg: encontrado/);
  assert.match(report.text, /Recurso Whisper CLI: não encontrado/);
  assert.doesNotMatch(report.text, /secret/);
  assert.match(report.text, /não lê nomes ou conteúdos/);
  assert.equal(values.size, 0, 'temporary storage probe must be removed');
});

test('diagnostic scan reports missing browser storage and backend errors', async () => {
  const report = await buildDiagnosticReport({
    environment: makeEnvironment({ storage: null, withRoot: false }),
    invoke: async () => { throw new Error('backend unavailable'); },
  });
  assert.match(report.text, /Elemento raiz React: ausente/);
  assert.match(report.text, /Armazenamento local: falha/);
  assert.match(report.text, /Backend Rust\/Tauri: falha/);
});

test('diagnostic scan works when native invoke is not available', async () => {
  const report = await buildDiagnosticReport({ environment: makeEnvironment(), invoke: null });
  assert.match(report.text, /Backend Rust\/Tauri: não testado/);
});

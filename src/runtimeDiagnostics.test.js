import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRuntimeDiagnostic } from './runtimeDiagnostics.js';

test('formats React and JavaScript details for startup diagnostics', () => {
  const report = formatRuntimeDiagnostic(new Error('render failed'), {
    source: 'React render',
    timestamp: '2026-11-08T12:00:00.000Z',
    componentStack: 'at App (src/App.jsx:10)',
  });
  assert.match(report, /Edit Master - relatório de diagnóstico/);
  assert.match(report, /React render/);
  assert.match(report, /render failed/);
  assert.match(report, /src\/App\.jsx/);
});

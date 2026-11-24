import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { buildDiagnosticReport } from './diagnosticsScan.js';

export default function DiagnosticsPanel() {
  const [report, setReport] = useState('Preparando a varredura…');
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const runScan = async () => {
    setScanning(true);
    setCopied(false);
    setError('');
    try {
      const result = await buildDiagnosticReport({ invoke });
      setReport(result.text);
    } catch (cause) {
      const message = String(cause?.message || cause);
      setError(message);
      setReport('A varredura não foi concluída.\n' + message);
    } finally {
      setScanning(false);
    }
  };
  useEffect(() => { void runScan(); }, []);
  const copyReport = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Área de transferência indisponível');
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setError('');
    } catch {
      const box = document.getElementById('edit-master-diagnostic-report');
      box?.focus();
      box?.select();
      setError('Não foi possível copiar automaticamente. O relatório foi selecionado: pressione Ctrl + C.');
    }
  };
  return (
    <div className="settings-body diagnostics-body">
      <div className="settings-section-title"><span>VARREDURA DE COMPATIBILIDADE</span></div>
      <p className="diagnostics-intro">Verifica o WebView, a interface, o armazenamento local, o backend Rust/Tauri e a presença das ferramentas incluídas no instalador.</p>
      <div className="diagnostics-actions">
        <button className="subtle-button" onClick={runScan} disabled={scanning}>{scanning ? 'Analisando…' : 'Executar novamente'}</button>
        <button className="export-button" onClick={copyReport} disabled={scanning || !report}>{copied ? 'Relatório copiado' : 'Copiar relatório'}</button>
      </div>
      {error && <p className="diagnostics-error" role="status">{error}</p>}
      <textarea id="edit-master-diagnostic-report" className="diagnostics-report" readOnly value={report} aria-label="Relatório da varredura de diagnóstico" />
      <p className="diagnostics-privacy">A varredura não abre nem lê seus projetos ou arquivos de mídia e não coleta chaves de API. Revise o relatório antes de enviá-lo.</p>
      <p className="diagnostics-shortcut">Atalho: <b>Ctrl + Shift + D</b> · disponível na tela inicial e no editor.</p>
    </div>
  );
}

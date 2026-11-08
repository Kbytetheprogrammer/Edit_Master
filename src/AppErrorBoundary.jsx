import React from 'react';
import { captureRuntimeDiagnostic } from './runtimeDiagnostics.js';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, report: '', copied: false };
    this.reportRef = React.createRef();
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    const report = captureRuntimeDiagnostic(error, {
      source: 'React render',
      componentStack: info?.componentStack || '',
    });
    this.setState({ report });
  }
  copyReport = async () => {
    const report = this.state.report || String(this.state.error?.message || 'Falha sem detalhes.');
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
        this.setState({ copied: true });
        return;
      }
    } catch { /* Fall through to selecting the report for manual copying. */ }
    this.reportRef.current?.focus();
    this.reportRef.current?.select();
  };
  render() {
    if (!this.state.error) return this.props.children;
    const button = { border: '1px solid #80502b', borderRadius: '7px', padding: '10px 14px', background: '#ff7900', color: '#17100a', fontWeight: 700, cursor: 'pointer' };
    return (
      <main data-edit-master-error="true" role="alert" style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', boxSizing: 'border-box', background: '#101010', color: '#f4f4f4',
        fontFamily: 'Segoe UI, Arial, sans-serif',
      }}>
        <section style={{ width: 'min(760px, calc(100% - 40px))', padding: '32px', border: '1px solid #49301f', borderRadius: '12px', background: '#171311', boxShadow: '0 18px 60px #0008' }}>
          <div style={{ color: '#ff922b', fontSize: '12px', fontWeight: 800, letterSpacing: '2px' }}>EDIT MASTER · RECUPERAÇÃO</div>
          <h1 style={{ margin: '12px 0', fontSize: '25px' }}>A interface encontrou um erro</h1>
          <p style={{ color: '#c8c0b9', lineHeight: 1.55 }}>O aplicativo detectou uma falha durante a inicialização ou renderização. O relatório ajuda a encontrar a causa, em vez de deixar a janela preta.</p>
          <p style={{ padding: '10px 12px', borderRadius: '6px', background: '#241b16', color: '#ffd1a6', overflowWrap: 'anywhere' }}>{String(this.state.error?.message || 'Ocorreu uma falha inesperada.')}</p>
          <textarea ref={this.reportRef} readOnly aria-label="Relatório técnico do erro" value={this.state.report || String(this.state.error?.message || '')}
            style={{ width: '100%', minHeight: '150px', resize: 'vertical', padding: '10px', boxSizing: 'border-box', background: '#0c0c0c', color: '#c8c8c8', border: '1px solid #343434', borderRadius: '6px', font: '11px/1.5 Consolas, monospace' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '16px' }}>
            <button type="button" style={button} onClick={() => window.location.reload()}>Reiniciar aplicativo</button>
            <button type="button" style={{ ...button, background: '#292421', color: '#eee', borderColor: '#49413b' }} onClick={this.copyReport}>{this.state.copied ? 'Relatório copiado' : 'Copiar relatório técnico'}</button>
          </div>
          <p style={{ margin: '14px 0 0', color: '#8c827b', fontSize: '12px' }}>Se o erro persistir após reiniciar, envie o relatório técnico ao desenvolvedor.</p>
        </section>
      </main>
    );
  }
}

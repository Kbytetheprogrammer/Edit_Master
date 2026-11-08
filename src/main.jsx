import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AppErrorBoundary from "./AppErrorBoundary.jsx";
import { installRuntimeDiagnosticHandlers, captureRuntimeDiagnostic } from "./runtimeDiagnostics.js";
import "./styles.css";

installRuntimeDiagnosticHandlers();

const mountNode = document.getElementById("root");
if (!mountNode) {
  const error = new Error("O elemento raiz #root não existe em index.html.");
  captureRuntimeDiagnostic(error, { source: "application-entry" });
  const fallback = document.createElement("main");
  fallback.style.cssText = "min-height:100vh;display:grid;place-items:center;background:#101010;color:#f4f4f4;font:14px Segoe UI,Arial;padding:24px";
  fallback.textContent = "O Edit Master não encontrou a área de inicialização da interface. Verifique a instalação e tente reinstalar o aplicativo.";
  document.body.replaceChildren(fallback);
} else {
  createRoot(mountNode).render(
    <React.StrictMode>
      <AppErrorBoundary><App /></AppErrorBoundary>
    </React.StrictMode>
  );
}

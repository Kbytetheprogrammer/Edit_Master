import React from 'react';
const dictionaries = {
  en: {
    'Pronto para criar. Importe sua primeira mídia.':'Ready to create. Import your first media.',
    'Projeto sem título':'Untitled project','Configurações':'Settings','Ajuda':'Help',
    'Importar arquivos':'Import files','Novo projeto':'New project','Abrir projeto':'Open project',
    'Salvar projeto':'Save project','Biblioteca de mídia':'Media Library','BIBLIOTECA DE MÍDIA':'MEDIA LIBRARY',
    'Vídeos':'Videos','Áudios':'Audio','Imagens':'Images','Buscar mídia...':'Search media...',
    'Sua biblioteca está vazia':'Your library is empty',
    'Arraste arquivos para cá ou importe vídeos, imagens e áudios.':'Drag files here or import videos, images, and audio.',
    'Excluir mídia':'Delete media','Adicionar mídia':'Add media','Voltar ao início':'Back to Home',
    'Alterações não salvas':'Unsaved changes','Cancelar':'Cancel','Restaurar padrão':'Restore defaults',
    'Aplicar alterações':'Apply changes','Exportar':'Export','Exportar vídeo MP4':'Export MP4 video',
    'Renderizar a montagem para MP4':'Render timeline to MP4','Selecionar ffmpeg.exe':'Select ffmpeg.exe',
    'Predefinição':'Preset','Vídeo MP4':'MP4 video','Seu vídeo está pronto':'Your video is ready',
    'Configurações do aplicativo':'Application settings','Vídeos duplicados':'Duplicate videos',
    'Confirmar desinstalação':'Confirm uninstall','Confirmar atualização':'Confirm update',
    'Atualização local encontrada':'Local update found','Atualizar agora':'Update now',
    'Executar instalador e atualizar':'Run installer and update','Iniciando…':'Starting…',
    'Buscar':'Search','Baixar':'Download','Fechar':'Close','Salvar':'Save','Remover':'Remove',
    'Selecionar':'Select','Idioma':'Language','Inglês':'English','Espanhol':'Spanish',
    'Você poderá alterar o idioma a qualquer momento nas configurações.':'You can change the language at any time in Settings.',
    'PUBLICAÇÃO':'PUBLISHING','RENDERIZAÇÃO MP4':'MP4 RENDERING','EXPORTAÇÃO CONCLUÍDA':'EXPORT COMPLETE',
    'LIMPEZA DE MÍDIA':'MEDIA CLEANUP','CONFIRMAÇÃO':'CONFIRMATION','ATUALIZAÇÃO LOCAL':'LOCAL UPDATE'
  },
  es: {
    'Pronto para criar. Importe sua primeira mídia.':'Listo para crear. Importa tu primer archivo multimedia.',
    'Projeto sem título':'Proyecto sin título','Configurações':'Configuración','Ajuda':'Ayuda',
    'Importar arquivos':'Importar archivos','Novo projeto':'Nuevo proyecto','Abrir projeto':'Abrir proyecto',
    'Salvar projeto':'Guardar proyecto','Biblioteca de mídia':'Biblioteca multimedia','BIBLIOTECA DE MÍDIA':'BIBLIOTECA MULTIMEDIA',
    'Vídeos':'Vídeos','Áudios':'Audio','Imagens':'Imágenes','Buscar mídia...':'Buscar archivos...',
    'Sua biblioteca está vazia':'Tu biblioteca está vacía',
    'Arraste arquivos para cá ou importe vídeos, imagens e áudios.':'Arrastra archivos aquí o importa vídeos, imágenes y audio.',
    'Excluir mídia':'Eliminar archivo','Adicionar mídia':'Añadir archivo','Voltar ao início':'Volver al inicio',
    'Alterações não salvas':'Cambios sin guardar','Cancelar':'Cancelar','Restaurar padrão':'Restaurar valores predeterminados',
    'Aplicar alterações':'Aplicar cambios','Exportar':'Exportar','Exportar vídeo MP4':'Exportar vídeo MP4',
    'Renderizar a montagem para MP4':'Renderizar el montaje a MP4','Selecionar ffmpeg.exe':'Seleccionar ffmpeg.exe',
    'Predefinição':'Preajuste','Vídeo MP4':'Vídeo MP4','Seu vídeo está pronto':'Tu vídeo está listo',
    'Configurações do aplicativo':'Configuración de la aplicación','Vídeos duplicados':'Vídeos duplicados',
    'Confirmar desinstalação':'Confirmar desinstalación','Confirmar atualização':'Confirmar actualización',
    'Atualização local encontrada':'Actualización local encontrada','Atualizar agora':'Actualizar ahora',
    'Executar instalador e atualizar':'Ejecutar el instalador y actualizar','Iniciando…':'Iniciando…',
    'Buscar':'Buscar','Baixar':'Descargar','Fechar':'Cerrar','Salvar':'Guardar','Remover':'Quitar',
    'Selecionar':'Seleccionar','Idioma':'Idioma','Inglês':'Inglés','Espanhol':'Español',
    'Você poderá alterar o idioma a qualquer momento nas configurações.':'Puedes cambiar el idioma en cualquier momento desde Configuración.',
    'PUBLICAÇÃO':'PUBLICACIÓN','RENDERIZAÇÃO MP4':'RENDERIZADO MP4','EXPORTAÇÃO CONCLUÍDA':'EXPORTACIÓN COMPLETADA',
    'LIMPEZA DE MÍDIA':'LIMPIEZA DE ARCHIVOS','CONFIRMAÇÃO':'CONFIRMACIÓN','ATUALIZAÇÃO LOCAL':'ACTUALIZACIÓN LOCAL'
  }
};
export function translateText(value, language='pt-BR') {
  if (typeof value !== 'string' || language === 'pt-BR') return value;
  return dictionaries[language]?.[value] ?? value;
}
function translateNode(node, language) {
  if (node == null || typeof node === 'boolean' || typeof node === 'number') return node;
  if (typeof node === 'string') return translateText(node, language);
  if (Array.isArray(node)) return node.map(child => translateNode(child, language));
  if (!React.isValidElement(node)) return node;
  const props = {};
  for (const key of ['placeholder','title','aria-label','alt']) {
    if (typeof node.props[key] === 'string') props[key] = translateText(node.props[key], language);
  }
  if (node.props.children !== undefined) props.children = translateNode(node.props.children, language);
  return React.cloneElement(node, props);
}
export function LocalizedTree({language='pt-BR',children}) {
  return <>{translateNode(children,language)}</>;
}
export function withLocalization(Component) {
  function LocalizedComponent({language='pt-BR',...props}) {
    return <LocalizedTree language={language}><Component {...props}/></LocalizedTree>;
  }
  LocalizedComponent.displayName = `Localized(${Component.displayName || Component.name || 'Component'})`;
  return LocalizedComponent;
}
// Core editor vocabulary used throughout the workspace.
Object.assign(dictionaries.en, {
  'Tela inicial':'Home','Biblioteca':'Library','Monitor':'Preview monitor','Timeline':'Timeline',
  'Inspetor':'Inspector','Mídia':'Media','Propriedades':'Properties','Velocidade':'Speed',
  'Volume':'Volume','Opacidade':'Opacity','Rotação':'Rotation','Posição':'Position',
  'Escala':'Scale','Cortar':'Trim','Dividir':'Split','Desfazer':'Undo','Refazer':'Redo',
  'Reproduzir':'Play','Pausar':'Pause','Exportação':'Export','Qualidade':'Quality',
  'Resolução':'Resolution','Selecionar pasta':'Select folder','Verificar atualizações':'Check for updates',
  'Nenhum arquivo':'No files','Falha':'Failed','Concluído':'Completed','Carregando…':'Loading…',
  'Pasta':'Folder','Arquivo':'File','Projeto':'Project','Áudio':'Audio','Vídeo':'Video',
  'Imagem':'Image','Legenda':'Subtitle','Legendas':'Subtitles','Título':'Title',
  'Iniciar':'Start','Continuar':'Continue','Conectar':'Connect','Desconectar':'Disconnect',
  'Ativado':'Enabled','Desativado':'Disabled','Automático':'Automatic','Manual':'Manual',
  'Geral':'General','Desempenho':'Performance','Aparência':'Appearance','Tema':'Theme'
});
Object.assign(dictionaries.es, {
  'Tela inicial':'Inicio','Biblioteca':'Biblioteca','Monitor':'Monitor de vista previa','Timeline':'Línea de tiempo',
  'Inspetor':'Inspector','Mídia':'Medios','Propriedades':'Propiedades','Velocidade':'Velocidad',
  'Volume':'Volumen','Opacidade':'Opacidad','Rotação':'Rotación','Posição':'Posición',
  'Escala':'Escala','Cortar':'Recortar','Dividir':'Dividir','Desfazer':'Deshacer','Refazer':'Rehacer',
  'Reproduzir':'Reproducir','Pausar':'Pausar','Exportação':'Exportación','Qualidade':'Calidad',
  'Resolução':'Resolución','Selecionar pasta':'Seleccionar carpeta','Verificar atualizações':'Buscar actualizaciones',
  'Nenhum arquivo':'No hay archivos','Falha':'Error','Concluído':'Completado','Carregando…':'Cargando…',
  'Pasta':'Carpeta','Arquivo':'Archivo','Projeto':'Proyecto','Áudio':'Audio','Vídeo':'Vídeo',
  'Imagem':'Imagen','Legenda':'Subtítulo','Legendas':'Subtítulos','Título':'Título',
  'Iniciar':'Iniciar','Continuar':'Continuar','Conectar':'Conectar','Desconectar':'Desconectar',
  'Ativado':'Activado','Desativado':'Desactivado','Automático':'Automático','Manual':'Manual',
  'Geral':'General','Desempenho':'Rendimiento','Aparência':'Apariencia','Tema':'Tema'
});

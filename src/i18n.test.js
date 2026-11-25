import test from 'node:test';
import assert from 'node:assert/strict';
import { translateText } from './i18n.js';

test('translates core editor and media-storage labels into English', () => {
  assert.equal(translateText('Armazenamento de mídia', 'en'), 'Media storage');
  assert.equal(translateText('Copiar mídias já importadas', 'en'), 'Copy already imported media');
  assert.equal(translateText('Procurar vídeos duplicados', 'en'), 'Find duplicate videos');
  assert.equal(translateText('Volume e silêncio afetam a prévia e a exportação. Fade-in e fade-out são aplicados na exportação MP4.', 'en'), 'Volume and mute affect the preview and export. Fade-in and fade-out are applied to the exported MP4.');
  assert.equal(translateText('Enviar para o YouTube', 'en'), 'Upload to YouTube');
});

test('translates core editor and media-storage labels into Spanish', () => {
  assert.equal(translateText('Armazenamento de mídia', 'es'), 'Almacenamiento multimedia');
  assert.equal(translateText('Copiar mídias já importadas', 'es'), 'Copiar archivos multimedia ya importados');
  assert.equal(translateText('Procurar vídeos duplicados', 'es'), 'Buscar vídeos duplicados');
  assert.equal(translateText('Volume e silêncio afetam a prévia e a exportação. Fade-in e fade-out são aplicados na exportação MP4.', 'es'), 'El volumen y el silencio afectan a la vista previa y a la exportación. Los fundidos de entrada y salida se aplican al MP4 exportado.');
  assert.equal(translateText('Enviar para o YouTube', 'es'), 'Enviar a YouTube');
});

test('preserves dynamic values in translated inspector labels', () => {
  assert.equal(
    translateText('Brilho · 125%', 'en'),
    'Brightness · 125%'
  );
  assert.equal(
    translateText('Posição X · 42%', 'es'),
    'Posición X · 42%'
  );
});

test('keeps Portuguese as the source language and unknown text unchanged', () => {
  assert.equal(translateText('Armazenamento de mídia', 'pt-BR'), 'Armazenamento de mídia');
  assert.equal(translateText('Texto ainda não catalogado', 'en'), 'Texto ainda não catalogado');
});

test('translates the updated MP4 renderer limitations in both supported languages', () => {
  const lesson = 'A exportação aplica correções estáticas de brilho, contraste, saturação e aquecimento, além de posição, escala, opacidade e rotação. Keyframes animados, títulos/legendas e composição em múltiplas camadas ainda não são renderizados.';
  assert.equal(
    translateText(lesson, 'en'),
    'Export applies static brightness, contrast, saturation, and warmth adjustments, plus position, scale, opacity, and rotation. Animated keyframes, titles/subtitles, and multi-layer compositing are not rendered yet.'
  );
  assert.equal(
    translateText(lesson, 'es'),
    'La exportación aplica ajustes estáticos de brillo, contraste, saturación y calidez, además de posición, escala, opacidad y rotación. Los fotogramas clave animados, títulos/subtítulos y la composición multicapa aún no se renderizan.'
  );

  const note = 'Este curso descreve o comportamento da versão candidata. O instalador inclui FFmpeg/FFprobe e Whisper Tiny; a detecção automática desses recursos ainda precisa ser validada no Windows. A exportação MP4 aplica correções de cor e transformações estáticas; keyframes animados, títulos/legendas e composição em múltiplas camadas ainda não são renderizados. O atualizador pela internet também precisa ser implementado e validado antes do lançamento final.';
  assert.match(translateText(note, 'en'), /MP4 export applies color adjustments and static transforms/);
  assert.match(translateText(note, 'es'), /La exportación MP4 aplica ajustes de color y transformaciones estáticas/);
});

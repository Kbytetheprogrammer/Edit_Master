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

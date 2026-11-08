import test from 'node:test';
import assert from 'node:assert/strict';
import { createExportRequest } from './exportModel.js';

const media = [
  { id: 'v1', name: 'clip.mp4', type: 'video', sourcePath: 'C:/media/clip.mp4' },
  { id: 'a1', name: 'music.wav', type: 'audio', sourcePath: 'C:/media/music.wav' },
];
const clips = [
  { clipId: 'c1', mediaId: 'v1', name: 'clip.mp4', type: 'video', duration: 12, start: 0, end: 10 },
];

test('builds a Full HD 60 FPS MP4 request by default', () => {
  const result = createExportRequest(media, clips, 'C:/ffmpeg/bin/ffmpeg.exe', 'C:/out/video.mp4');
  assert.equal(result.ok, true);
  assert.equal(result.request.width, 1920);
  assert.equal(result.request.height, 1080);
  assert.equal(result.request.fps, 60);
  assert.equal(result.request.crf, 20);
});

test('rejects missing FFmpeg path', () => {
  const result = createExportRequest(media, clips, '', 'C:/out/video.mp4');
  assert.equal(result.ok, false);
  assert.match(result.reason, /ffmpeg/i);
});

test('rejects non-MP4 output path', () => {
  const result = createExportRequest(media, clips, 'ffmpeg.exe', 'C:/out/video.mov');
  assert.equal(result.ok, false);
  assert.match(result.reason, /mp4/i);
});

test('rejects an empty timeline', () => {
  const result = createExportRequest(media, [], 'ffmpeg.exe', 'video.mp4');
  assert.equal(result.ok, false);
  assert.match(result.reason, /vazia/i);
});

test('rejects clips without a permanent source path', () => {
  const result = createExportRequest([{ id: 'v1', name: 'clip.mp4', type: 'video' }], clips, 'ffmpeg.exe', 'video.mp4');
  assert.equal(result.ok, false);
  assert.match(result.reason, /caminho permanente/i);
});

test('rejects unsupported media types even when a valid visual clip exists', () => {
  const expandedMedia = [...media, { id: 'd1', name: 'file.bin', type: 'document', sourcePath: 'C:/media/file.bin' }];
  const mixedClips = [...clips, { clipId: 'c2', mediaId: 'd1', name: 'file.bin', type: 'document', duration: 5, start: 0, end: 5 }];
  const result = createExportRequest(expandedMedia, mixedClips, 'ffmpeg.exe', 'video.mp4');
  assert.equal(result.ok, false);
  assert.match(result.reason, /ainda não pode ser exportado/i);
});

test('rejects invalid clip ranges', () => {
  const badClips = [{ ...clips[0], start: 9, end: 9 }];
  const result = createExportRequest(media, badClips, 'ffmpeg.exe', 'video.mp4');
  assert.equal(result.ok, false);
  assert.match(result.reason, /duração inválida/i);
});

test('clamps custom export dimensions and frame rate at the native boundary', () => {
  const result = createExportRequest(media, clips, 'ffmpeg.exe', 'video.mp4', { width: 1280, height: 720, fps: 30 });
  assert.equal(result.ok, true);
  assert.equal(result.request.width, 1280);
  assert.equal(result.request.height, 720);
  assert.equal(result.request.fps, 30);
});

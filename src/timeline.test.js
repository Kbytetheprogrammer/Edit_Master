import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisualTimelineDuration } from './timeline.js';

test('calculates project duration from visual clips only', () => {
  const clips = [
    { type: 'video', duration: 12 },
    { type: 'audio', duration: 90 },
    { type: 'image', duration: 4 },
  ];
  assert.equal(getVisualTimelineDuration(clips), 16);
});

test('uses the editor fallback duration for visual clips with unknown duration', () => {
  assert.equal(getVisualTimelineDuration([{ type: 'video', duration: 0 }, { type: 'audio', duration: 30 }]), 5);
});

test('handles missing or invalid clip collections safely', () => {
  assert.equal(getVisualTimelineDuration(null), 0);
  assert.equal(getVisualTimelineDuration([{ type: 'audio', duration: 8 }, null]), 0);
});

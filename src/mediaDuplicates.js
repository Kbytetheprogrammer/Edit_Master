/** Return only explicitly selected duplicate files, never the copy chosen to keep. */
export function getSelectedDuplicateFiles(groups, keepPaths, selectedPaths) {
  const selected = new Set(selectedPaths || []);
  return (groups || []).flatMap((group) =>
    (group.files || [])
      .filter((file) => selected.has(file.path) && file.path !== keepPaths?.[group.key])
      .map((file) => ({ ...file, groupKey: group.key }))
  );
}

export function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value / 1024;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2)} ${units[unit]}`;
}

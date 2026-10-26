export const localChangeEvent = 'mo-money-local-change';
export const cloudAppliedEvent = 'mo-money-cloud-applied';
export const syncStatusEvent = 'mo-money-sync-status';
export const dirtyKey = 'mo-money-pending-sync';

export function notifyLocalChange(): void {
  localStorage.setItem(dirtyKey, String(Date.now()));
  window.dispatchEvent(new Event(localChangeEvent));
}

export function persistSyncedStorage(key: string, value: string): void {
  if (localStorage.getItem(key) === value) return;
  localStorage.setItem(key, value);
  notifyLocalChange();
}

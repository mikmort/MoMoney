import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { azureBlobService } from '../../services/azureBlobService';
import { syncStatusEvent } from '../../services/syncEvents';

export function useCloudSyncStatus() {
  const [status, setStatus] = useState(azureBlobService.getStatus);
  useEffect(() => {
    const update = () => setStatus(azureBlobService.getStatus());
    window.addEventListener(syncStatusEvent, update);
    update();
    return () => window.removeEventListener(syncStatusEvent, update);
  }, []);
  return status;
}

export const CloudSyncStatus: React.FC = () => {
  const status = useCloudSyncStatus();
  return (
    <div role="status" aria-live="polite" style={{ marginBottom: 16, fontSize: 13 }}>
      <Link to="/settings#cloud-sync" style={{ color: 'inherit' }}>{status.message}</Link>
      {status.pendingChanges > 0 && <div>{status.pendingChanges} pending record change{status.pendingChanges === 1 ? '' : 's'}</div>}
      {status.lastSavedAt && <div>Last cloud save: {new Date(status.lastSavedAt).toLocaleString()}</div>}
    </div>
  );
};

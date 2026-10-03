import React, { useState } from 'react';
import { Button } from '../../styles/globalStyles';
import { azureBlobService } from '../../services/azureBlobService';
import { db, RecoverySnapshot } from '../../services/db';
import { CloudVersion } from '../../utils/cloudSnapshot';
import { recoverInterruptedRestore, restoreSnapshot } from '../../services/cloudSnapshotService';
import { dataService } from '../../services/dataService';
import { useNotification } from '../../contexts/NotificationContext';

export const CloudRecovery: React.FC = () => {
  const [versions, setVersions] = useState<Omit<CloudVersion, 'data'>[]>([]);
  const [local, setLocal] = useState<RecoverySnapshot[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const { showConfirmation } = useNotification();

  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setStatus('');
    try { await action(); }
    catch (error) {
      console.error('[Recovery]', error);
      setStatus(error instanceof Error ? error.message : 'Recovery failed.');
    } finally { setBusy(false); }
  };

  const loadVersions = (cursor?: string) => perform(async () => {
    const result = await azureBlobService.listVersions(cursor);
    setVersions(previous => cursor ? [...previous, ...result.versions] : result.versions);
    setNext(result.next);
    if (!result.versions.length) setStatus('No cloud recovery versions yet.');
  });

  const restore = (revision: string, localSnapshot?: RecoverySnapshot) => perform(async () => {
    if (!await showConfirmation(
      'Replace local data with this recovery version? A snapshot of your current local data will be kept. The page will reload; the current cloud version is not changed until you explicitly upload.',
      { title: 'Restore recovery version', confirmText: 'Restore & Reload', danger: true }
    )) return;
    azureBlobService.stopSync();
    localStorage.setItem('mo_money_autosave_enabled', 'false');
    if (localSnapshot) {
      dataService.suspendPersistence();
      await restoreSnapshot(localSnapshot.data);
    } else {
      const result = await azureBlobService.forceDownload(revision);
      if (!result.success) throw new Error(result.message);
    }
    window.location.reload();
  });

  return (
    <div style={{ marginTop: 20 }}>
      <h4>Recovery versions</h4>
      <p>Cloud versions and pre-restore local snapshots are retained until deliberately removed by an administrator. Local snapshots exist only in this browser.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Button disabled={busy || !azureBlobService.isAvailable()} onClick={() => loadVersions()}>View cloud versions</Button>
        <Button disabled={busy} onClick={() => perform(async () => {
          const items = await db.recoverySnapshots.orderBy('createdAt').reverse().toArray();
          setLocal(items);
          if (!items.length) setStatus('No local recovery snapshots yet.');
        })}>Local recovery snapshots</Button>
        <Button disabled={busy} onClick={() => perform(async () => {
          if (!await showConfirmation('Recover the local copy from before the interrupted restore and reload?', { title: 'Recover interrupted restore' })) return;
          azureBlobService.stopSync();
          dataService.suspendPersistence();
          if (await recoverInterruptedRestore()) window.location.reload();
          else setStatus('No interrupted restore found. Reload before editing.');
        })}>Recover interrupted restore</Button>
      </div>
      {status && <p role="status">{status}</p>}
      {versions.map(version => (
        <p key={version.revision}>
          {new Date(version.createdAt).toLocaleString()} ({version.revision.slice(0, 8)}){' '}
          <Button disabled={busy} onClick={() => restore(version.revision)}>Restore cloud version</Button>
        </p>
      ))}
      {next && <Button disabled={busy} onClick={() => loadVersions(next)}>Load older versions</Button>}
      {local.map(snapshot => (
        <p key={snapshot.id}>
          {new Date(snapshot.createdAt).toLocaleString()} - {snapshot.data.transactions.length} transactions{' '}
          <Button disabled={busy} onClick={() => restore(snapshot.id, snapshot)}>Restore local snapshot</Button>
        </p>
      ))}
    </div>
  );
};

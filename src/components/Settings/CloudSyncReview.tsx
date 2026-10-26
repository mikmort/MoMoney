import React, { useEffect, useState } from 'react';
import { azureBlobService } from '../../services/azureBlobService';
import { ConflictChoice, mergeCloudSnapshots } from '../../utils/cloudMerge';
import { removedRecords } from '../../utils/cloudSnapshot';
import { useCloudSyncStatus } from '../shared/CloudSyncStatus';
import { Button } from '../../styles/globalStyles';

function valueText(value: unknown): string {
  if (value === undefined) return 'Delete this record';
  return JSON.stringify(value, null, 2);
}

export const CloudSyncReview: React.FC = () => {
  const status = useCloudSyncStatus();
  const review = azureBlobService.getReview();
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(0);
  const [confirmRemovals, setConfirmRemovals] = useState(false);
  useEffect(() => {
    setChoices({});
    setPage(0);
    setConfirmRemovals(false);
  }, [review]);
  if (!review) return <p role="status">{status.message}</p>;
  const merged = mergeCloudSnapshots(review.base, review.local, review.cloud, choices);
  const conflicts = [...new Map([...review.conflicts, ...merged.conflicts].map(conflict => [conflict.key, conflict])).values()];
  const removals = removedRecords(review.cloud, merged.data);
  const remaining = merged.conflicts.length;
  const apply = async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await azureBlobService.resolveReview(choices, review);
      setMessage(result.message);
    } finally { setBusy(false); }
  };
  return (
    <section aria-label="Cloud reconciliation review">
      <h4>{review.firstLink ? 'Link this device safely' : 'Review conflicting changes'}</h4>
      <p>Neither copy has been overwritten. Independent changes are combined automatically. Previous local data and cloud versions remain recoverable.</p>
      <p>Applying reconciliation refreshes this screen. Save any open forms first.</p>
      <p>This device: {review.local.transactions.length} transactions. Cloud: {review.cloud.transactions.length}. After reconciliation: {merged.data.transactions.length}.</p>
      <p>{conflicts.length} conflicts; {remaining} still need a choice. {removals} records would be removed from the current cloud version.</p>
      {conflicts.length > 1 && <p>
        <Button disabled={busy} onClick={() => { setChoices(Object.fromEntries(conflicts.filter(conflict => conflict.allowLocal !== false).map(conflict => [conflict.key, 'local']))); setConfirmRemovals(false); }}>Use this device for all conflicts</Button>{' '}
        <Button disabled={busy} onClick={() => { setChoices(Object.fromEntries(conflicts.filter(conflict => conflict.allowCloud !== false).map(conflict => [conflict.key, 'cloud']))); setConfirmRemovals(false); }}>Use cloud for all conflicts</Button>
      </p>}
      {conflicts.slice(page * 10, (page + 1) * 10).map(conflict => (
        <fieldset key={conflict.key} disabled={busy} style={{ marginBottom: 12 }}>
          <legend>{conflict.collection} / {conflict.recordId} / {conflict.field}</legend>
          <p>{conflict.reason}</p>
          <label>
            <input type="radio" name={conflict.key} disabled={conflict.allowLocal === false} checked={choices[conflict.key] === 'local'} onChange={() => { setChoices(previous => ({ ...previous, [conflict.key]: 'local' })); setConfirmRemovals(false); }} />
            Keep this device's version
          </label>
          <pre style={{ maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{valueText(conflict.local)}</pre>
          <label>
            <input type="radio" name={conflict.key} disabled={conflict.allowCloud === false} checked={choices[conflict.key] === 'cloud'} onChange={() => { setChoices(previous => ({ ...previous, [conflict.key]: 'cloud' })); setConfirmRemovals(false); }} />
            Keep cloud version
          </label>
          <pre style={{ maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{valueText(conflict.cloud)}</pre>
        </fieldset>
      ))}
      {conflicts.length > 10 && <div>
        <Button disabled={busy || page === 0} onClick={() => setPage(previous => previous - 1)}>Previous conflicts</Button>{' '}
        <Button disabled={busy || (page + 1) * 10 >= conflicts.length} onClick={() => setPage(previous => previous + 1)}>Next conflicts</Button>
      </div>}
      {removals > 0 && <p><label>
        <input type="checkbox" checked={confirmRemovals} onChange={event => setConfirmRemovals(event.target.checked)} />
        I confirm these {removals} removals are intentional. Recovery versions will be retained.
      </label></p>}
      <Button disabled={busy || remaining > 0 || (removals > 0 && !confirmRemovals)} onClick={apply}>
        {busy ? 'Reconciling...' : 'Apply reconciliation'}
      </Button>
      {message && <p role="status">{message}</p>}
    </section>
  );
};

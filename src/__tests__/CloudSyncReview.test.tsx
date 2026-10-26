import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CloudSyncReview } from '../components/Settings/CloudSyncReview';
import { azureBlobService, SyncReview } from '../services/azureBlobService';
import { CloudSnapshot } from '../utils/cloudSnapshot';
import { mergeCloudSnapshots } from '../utils/cloudMerge';

jest.mock('../services/azureBlobService', () => ({
  azureBlobService: { getStatus: jest.fn(), getReview: jest.fn(), resolveReview: jest.fn() }
}));

function data(ids = ['one']): CloudSnapshot {
  return {
    schemaVersion: 1,
    transactions: ids.map(id => ({ id, date: '2026-01-01', amount: 5, description: id, category: 'Salary', account: 'Checking', type: 'income' })),
    transactionHistory: [], preferences: [],
    storage: { 'mo-money-accounts': null, 'mo-money-categories': null, 'mo-money-category-rules': null, 'mo-money-budgets': null, 'mo-money-templates': null }
  };
}
function review(local: CloudSnapshot, cloud: CloudSnapshot, base?: CloudSnapshot): SyncReview {
  return { account: 'alice', revision: 'first', local, cloud, base, firstLink: !base, conflicts: mergeCloudSnapshots(base, local, cloud).conflicts };
}
beforeEach(() => {
  jest.mocked(azureBlobService.getStatus).mockReturnValue({ phase: 'attention', message: 'Review needed', pendingChanges: 1 });
  jest.mocked(azureBlobService.resolveReview).mockResolvedValue({ success: true, message: 'Saved to cloud' });
});

test('unrelated copies show union counts and require an explicit first-link approval', async () => {
  jest.mocked(azureBlobService.getReview).mockReturnValue(review(data(['local']), data(['cloud'])));
  render(<CloudSyncReview />);
  expect(screen.getByText(/After reconciliation: 2/)).toBeInTheDocument();
  expect(azureBlobService.resolveReview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Apply reconciliation' }));
  expect(await screen.findByText('Saved to cloud')).toBeInTheDocument();
  expect(azureBlobService.resolveReview).toHaveBeenCalledWith({}, azureBlobService.getReview());
});

test('deletion requires a conflict choice plus an explicit removal confirmation', async () => {
  jest.mocked(azureBlobService.getReview).mockReturnValue(review(data([]), data(), data()));
  render(<CloudSyncReview />);
  expect(screen.getByRole('button', { name: 'Apply reconciliation' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: /Keep this device/ }));
  expect(screen.getByRole('button', { name: 'Apply reconciliation' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /I confirm these 1 removals/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply reconciliation' }));
  expect(await screen.findByText('Saved to cloud')).toBeInTheDocument();
});

test('keeping the cloud record does not require deletion confirmation', () => {
  jest.mocked(azureBlobService.getReview).mockReturnValue(review(data([]), data(), data()));
  render(<CloudSyncReview />);
  fireEvent.click(screen.getByRole('radio', { name: 'Keep cloud version' }));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply reconciliation' })).toBeEnabled();
});

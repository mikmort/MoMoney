import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackupFilePicker } from '../components/Settings/BackupFilePicker';

test('uses a visible, keyboard-accessible native file input instead of a hidden scripted click', async () => {
  render(<BackupFilePicker disabled={false} onChange={jest.fn()} />);
  const input = screen.getByLabelText('Import Data (JSON backup)');
  expect(input).toBeVisible();
  expect(input).toHaveAttribute('type', 'file');
  await userEvent.tab();
  expect(input).toHaveFocus();
});

test('passes the selected JSON file to the import handler', async () => {
  const onChange = jest.fn();
  render(<BackupFilePicker disabled={false} onChange={onChange} />);
  const input = screen.getByLabelText<HTMLInputElement>('Import Data (JSON backup)');
  const file = new File(['{"version":"1.0"}'], 'backup.json', { type: 'application/json' });
  await userEvent.upload(input, file);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(input.files?.[0]).toBe(file);
});

test('does not select a file while an import is running', async () => {
  const onChange = jest.fn();
  render(<BackupFilePicker disabled onChange={onChange} />);
  const input = screen.getByLabelText('Import Data (JSON backup)');
  expect(input).toBeDisabled();
  await userEvent.upload(input, new File(['{}'], 'backup.json', { type: 'application/json' }));
  expect(onChange).not.toHaveBeenCalled();
});

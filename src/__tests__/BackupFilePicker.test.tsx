import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../styles/globalStyles';
import { BackupFilePicker } from '../components/Settings/BackupFilePicker';

const backup = new File(['{"version":"1.0","transactions":[]}'], 'backup.json', { type: 'application/json' });

function setup(onFileSelected = jest.fn<Promise<void>, [File]>().mockResolvedValue(undefined), disabled = false) {
  render(<ThemeProvider theme={lightTheme}><BackupFilePicker disabled={disabled} onFileSelected={onFileSelected} /></ThemeProvider>);
  return onFileSelected;
}

async function openDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'Import Data' }));
}

afterEach(() => jest.restoreAllMocks());

test('Import Data immediately opens an in-page dialog instead of depending on a native picker', async () => {
  setup();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await openDialog();
  expect(screen.getByRole('dialog', { name: 'Import backup' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Browse files' })).toHaveFocus();
  expect(screen.getByLabelText('Choose JSON backup')).not.toBeVisible();
});

test('Browse files calls showPicker synchronously from the click', async () => {
  setup();
  await openDialog();
  const input = screen.getByLabelText<HTMLInputElement>('Choose JSON backup');
  const showPicker = jest.fn();
  Object.defineProperty(input, 'showPicker', { value: showPicker, configurable: true });
  await userEvent.click(screen.getByRole('button', { name: 'Browse files' }));
  expect(showPicker).toHaveBeenCalledTimes(1);
});

test('browsers without showPicker use the file input click', async () => {
  setup();
  await openDialog();
  const input = screen.getByLabelText<HTMLInputElement>('Choose JSON backup');
  Object.defineProperty(input, 'showPicker', { value: undefined, configurable: true });
  const click = jest.spyOn(input, 'click').mockImplementation(() => {});
  await userEvent.click(screen.getByRole('button', { name: 'Browse files' }));
  expect(click).toHaveBeenCalledTimes(1);
});

test('selected files are passed to the same import preview handler', async () => {
  const onFileSelected = setup();
  await openDialog();
  await userEvent.upload(screen.getByLabelText('Choose JSON backup'), backup);
  expect(onFileSelected).toHaveBeenCalledWith(backup);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('drag-and-drop works without invoking any native picker', async () => {
  const onFileSelected = setup();
  await openDialog();
  fireEvent.drop(screen.getByRole('region', { name: 'Backup file drop area' }), { dataTransfer: { files: [backup] } });
  await waitFor(() => expect(onFileSelected).toHaveBeenCalledWith(backup));
});

test('multiple dropped files produce an actionable error without importing anything', async () => {
  const onFileSelected = setup();
  await openDialog();
  fireEvent.drop(screen.getByRole('region', { name: 'Backup file drop area' }), { dataTransfer: { files: [backup, backup] } });
  expect(screen.getByRole('alert')).toHaveTextContent('one JSON backup file at a time');
  expect(onFileSelected).not.toHaveBeenCalled();
});

test('a blocked browser picker surfaces alternatives and pasted JSON can still be reviewed', async () => {
  const onFileSelected = setup();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await openDialog();
  const input = screen.getByLabelText<HTMLInputElement>('Choose JSON backup');
  Object.defineProperty(input, 'showPicker', { value: () => { throw new DOMException('Blocked', 'NotAllowedError'); } });
  await userEvent.click(screen.getByRole('button', { name: 'Browse files' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Your browser could not open the file window');
  await userEvent.click(screen.getByText('Paste JSON instead'));
  const text = '{"version":"1.0","transactions":[]}';
  fireEvent.change(screen.getByLabelText('Backup JSON'), { target: { value: text } });
  await userEvent.click(screen.getByRole('button', { name: 'Review backup' }));
  expect(onFileSelected).toHaveBeenCalledTimes(1);
  const file = onFileSelected.mock.calls[0][0];
  expect(file.name).toBe('pasted-backup.json');
  const contents = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
  expect(contents).toBe(text);
});

test('invalid pasted data stays available to correct, with a visible error', async () => {
  setup(jest.fn<Promise<void>, [File]>().mockRejectedValue(new Error('This is not valid JSON.')));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await openDialog();
  await userEvent.click(screen.getByText('Paste JSON instead'));
  fireEvent.change(screen.getByLabelText('Backup JSON'), { target: { value: 'not json' } });
  await userEvent.click(screen.getByRole('button', { name: 'Review backup' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('not valid JSON');
  expect(screen.getByLabelText('Backup JSON')).toHaveValue('not json');
});

test('failed file selection can be retried with the same file', async () => {
  const onFileSelected = setup(jest.fn<Promise<void>, [File]>()
    .mockRejectedValueOnce(new Error('File was unavailable.')).mockResolvedValueOnce(undefined));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await openDialog();
  const input = screen.getByLabelText<HTMLInputElement>('Choose JSON backup');
  await userEvent.upload(input, backup);
  expect(await screen.findByRole('alert')).toHaveTextContent('File was unavailable');
  await userEvent.upload(input, backup);
  expect(onFileSelected).toHaveBeenCalledTimes(2);
});

test('duplicate submissions are blocked while a file is being read', async () => {
  let finish: () => void = () => {};
  const onFileSelected = setup(jest.fn<Promise<void>, [File]>().mockImplementation(() => new Promise<void>(resolve => { finish = resolve; })));
  await openDialog();
  const zone = screen.getByRole('region', { name: 'Backup file drop area' });
  fireEvent.drop(zone, { dataTransfer: { files: [backup] } });
  fireEvent.drop(zone, { dataTransfer: { files: [backup] } });
  expect(onFileSelected).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Browse files' })).toBeDisabled();
  await act(async () => { finish(); });
});

test('disabled import cannot open the dialog', async () => {
  const onFileSelected = setup(jest.fn<Promise<void>, [File]>(), true);
  await userEvent.click(screen.getByRole('button', { name: 'Import Data' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(onFileSelected).not.toHaveBeenCalled();
});

test('Escape closes the dialog and restores focus to the trigger', async () => {
  setup();
  await openDialog();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import Data' })).toHaveFocus();
});

test('Escape also closes the dialog when its header close button is focused', async () => {
  setup();
  await openDialog();
  await userEvent.tab({ shift: true });
  expect(screen.getByRole('button', { name: '×' })).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

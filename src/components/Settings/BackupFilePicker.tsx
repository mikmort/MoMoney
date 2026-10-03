import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Button } from '../../styles/globalStyles';
import Modal from '../shared/Modal';

const DropZone = styled.div<{ $dragging: boolean }>`
  border: 2px dashed ${props => props.$dragging ? props.theme.primary : props.theme.border};
  border-radius: 8px;
  background: ${props => props.$dragging ? props.theme.headerBackground : props.theme.cardBackground};
  padding: 24px;
  text-align: center;

  p { margin: 6px 0 16px; }
`;

const HelpText = styled.p`
  color: ${props => props.theme.textSecondary};
  font-size: 0.875rem;
  margin: 12px 0;
  line-height: 1.5;
`;

const PasteOption = styled.details`
  border-top: 1px solid ${props => props.theme.border};
  padding-top: 12px;
  margin-top: 18px;

  summary {
    cursor: pointer;
    color: ${props => props.theme.primary};
    font-weight: 600;
  }

  label { display: block; margin-top: 12px; }
  textarea {
    display: block;
    width: 100%;
    min-height: 140px;
    resize: vertical;
    font-family: monospace;
    margin: 8px 0 12px;
  }
`;

const ErrorText = styled.p`
  color: ${props => props.theme.error};
  margin-top: 12px;
`;

interface BackupFilePickerProps {
  disabled: boolean;
  onFileSelected: (file: File) => Promise<void>;
}

export const BackupFilePicker: React.FC<BackupFilePickerProps> = ({ disabled, onFileSelected }) => {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const browseRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const unavailable = disabled || reading;

  useEffect(() => {
    if (open) browseRef.current?.focus();
  }, [open]);

  const close = () => {
    if (busyRef.current) return;
    setOpen(false);
    setError('');
    setPasted('');
    setDragging(false);
    triggerRef.current?.focus();
  };

  const selectFile = async (file: File) => {
    if (disabled || busyRef.current) return;
    busyRef.current = true;
    setReading(true);
    setError('');
    try {
      await onFileSelected(file);
      setOpen(false);
      setPasted('');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not read this backup. Try another JSON file.';
      console.error('[Backup import]', message);
      setError(message);
    } finally {
      busyRef.current = false;
      setReading(false);
    }
  };

  const browse = () => {
    const input = inputRef.current;
    if (!input || unavailable) return;
    setError('');
    try {
      // Call synchronously from the user's click so transient user activation is retained.
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch {
      const message = 'Your browser could not open the file window. Drop a JSON backup here or use Paste JSON below.';
      console.warn('[Backup import]', message);
      setError(message);
    }
  };

  return (
    <>
      <Button ref={triggerRef} type="button" disabled={disabled} onClick={() => setOpen(true)}>
        Import Data
      </Button>
      {open && (
        <section role="dialog" aria-label="Import backup" aria-modal="true" aria-busy={reading}
          style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
            if (event.key === 'Tab') {
              const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), textarea:not(:disabled), summary'
              )).filter(element => element.getClientRects().length > 0);
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first && last) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last && first) {
                event.preventDefault();
                first.focus();
              }
            }
          }}>
          <Modal isOpen onClose={close} title="Import backup" maxWidth="560px">
          <HelpText>Choose a Mo Money JSON backup. You will review what to import before any data is replaced.</HelpText>
          <DropZone $dragging={dragging} role="region" aria-label="Backup file drop area"
            onDragOver={event => {
              event.preventDefault();
              if (!unavailable) setDragging(true);
            }}
            onDragLeave={event => {
              if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
            }}
            onDrop={event => {
              event.preventDefault();
              event.stopPropagation();
              setDragging(false);
              if (unavailable) return;
              if (event.dataTransfer.files.length !== 1) {
                setError('Drop one JSON backup file at a time.');
                return;
              }
              void selectFile(event.dataTransfer.files[0]);
            }}>
            <strong>Drop your JSON backup here</strong>
            <p>or select a file from your device.</p>
            <Button ref={browseRef} type="button" variant="outline" disabled={unavailable} onClick={browse}>
              Browse files
            </Button>
            <input ref={inputRef} type="file" accept=".json,application/json" hidden
              aria-label="Choose JSON backup" disabled={unavailable}
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void selectFile(file);
              }} />
          </DropZone>
          <HelpText>File window not opening? Drag the file here, or paste its contents below. Both work without a file picker.</HelpText>
          <PasteOption>
            <summary>Paste JSON instead</summary>
            <label>
              Backup JSON
              <textarea value={pasted} onChange={event => setPasted(event.target.value)}
                disabled={unavailable} spellCheck={false} placeholder="Paste the contents of your .json backup" />
            </label>
            <Button type="button" disabled={unavailable || !pasted.trim()}
              onClick={() => void selectFile(new File([pasted], 'pasted-backup.json', { type: 'application/json' }))}>
              Review backup
            </Button>
          </PasteOption>
          {reading && <HelpText role="status">Reading backup...</HelpText>}
          {error && <ErrorText role="alert">{error}</ErrorText>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <Button type="button" variant="outline" disabled={reading} onClick={close}>Cancel</Button>
          </div>
          </Modal>
        </section>
      )}
    </>
  );
};

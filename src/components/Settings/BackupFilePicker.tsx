import React from 'react';
import styled from 'styled-components';

const FileInput = styled.input`
  max-width: 100%;
  font: inherit;
  cursor: pointer;

  &::file-selector-button {
    background: #2196f3;
    border: 1px solid #2196f3;
    border-radius: 6px;
    color: white;
    cursor: pointer;
    padding: 10px 16px;
    margin-right: 8px;
    font: inherit;
  }

  &:focus-visible {
    outline: 2px solid #1565c0;
    outline-offset: 3px;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

interface BackupFilePickerProps {
  disabled: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}

export const BackupFilePicker: React.FC<BackupFilePickerProps> = ({ disabled, onChange }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '100%' }}>
    <span>Import Data (JSON backup)</span>
    <FileInput type="file" accept=".json,application/json" disabled={disabled} onChange={onChange} />
  </label>
);

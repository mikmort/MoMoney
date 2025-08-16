import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';

interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (selectedValues: string[]) => void;
  placeholder?: string;
}

const MultiSelectContainer = styled.div`
  position: relative;
  min-width: 140px;
`;

const MultiSelectButton = styled.button`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  text-align: left;
  cursor: pointer;
  font-size: 0.9rem;
  font-family: inherit;
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  &:hover {
    border-color: #999;
  }
  
  &:focus {
    outline: none;
    border-color: #2196f3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
  }
`;

const MultiSelectDropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
  margin-top: 2px;
`;

const MultiSelectOption = styled.label`
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 0.9rem;
  color: #333;
  
  &:hover {
    background: #f5f5f5;
  }
  
  input[type="checkbox"] {
    margin-right: 8px;
    cursor: pointer;
  }
`;

const SelectedCount = styled.span`
  background: #2196f3;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 0.75rem;
  margin-left: 4px;
`;

const ArrowIcon = styled.span.withConfig({
  shouldForwardProp: (prop) => prop !== 'isOpen'
})<{ isOpen: boolean }>`
  font-size: 0.8rem;
  transform: ${props => props.isOpen ? 'rotate(180deg)' : 'rotate(0deg)'};
  transition: transform 0.2s ease;
`;

export const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({
  label,
  options,
  selectedValues,
  onChange,
  placeholder = "Select options..."
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleOption = (option: string) => {
    if (selectedValues.includes(option)) {
      onChange(selectedValues.filter(value => value !== option));
    } else {
      onChange([...selectedValues, option]);
    }
  };

  const getDisplayText = () => {
    if (selectedValues.length === 0) {
      return placeholder;
    }
    if (selectedValues.length === 1) {
      return selectedValues[0];
    }
    return (
      <span>
        {selectedValues.length === options.length ? 'All' : selectedValues[0]}
        <SelectedCount>{selectedValues.length}</SelectedCount>
      </span>
    );
  };

  return (
    <MultiSelectContainer ref={containerRef}>
      <MultiSelectButton
        type="button"
        onClick={() => setIsOpen(!isOpen)}
      >
        {getDisplayText()}
        <ArrowIcon isOpen={isOpen}>▼</ArrowIcon>
      </MultiSelectButton>
      
      {isOpen && (
        <MultiSelectDropdown>
          {options.map(option => (
            <MultiSelectOption key={option}>
              <input
                type="checkbox"
                checked={selectedValues.includes(option)}
                onChange={() => handleToggleOption(option)}
              />
              {option}
            </MultiSelectOption>
          ))}
        </MultiSelectDropdown>
      )}
    </MultiSelectContainer>
  );
};
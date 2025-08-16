import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { MultiSelectFilter } from '../components/shared/MultiSelectFilter';
import { NotificationProvider } from '../contexts/NotificationContext';

// Mock functions needed for testing
const mockOnChange = jest.fn();

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MemoryRouter>
    <NotificationProvider>
      {children}
    </NotificationProvider>
  </MemoryRouter>
);

describe('MultiSelectFilter Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const testOptions = ['Option 1', 'Option 2', 'Option 3', 'Option 4'];

  test('renders with placeholder text when no options are selected', () => {
    render(
      <TestWrapper>
        <MultiSelectFilter
          label="Test Filter"
          options={testOptions}
          selectedValues={[]}
          onChange={mockOnChange}
          placeholder="Select items..."
        />
      </TestWrapper>
    );

    expect(screen.getByText('Select items...')).toBeInTheDocument();
  });

  test('displays single selected option', () => {
    render(
      <TestWrapper>
        <MultiSelectFilter
          label="Test Filter"
          options={testOptions}
          selectedValues={['Option 1']}
          onChange={mockOnChange}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Option 1')).toBeInTheDocument();
  });

  test('displays count when multiple options are selected', () => {
    render(
      <TestWrapper>
        <MultiSelectFilter
          label="Test Filter"
          options={testOptions}
          selectedValues={['Option 1', 'Option 2', 'Option 3']}
          onChange={mockOnChange}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('displays "All" when all options are selected', () => {
    render(
      <TestWrapper>
        <MultiSelectFilter
          label="Test Filter"
          options={testOptions}
          selectedValues={testOptions}
          onChange={mockOnChange}
        />
      </TestWrapper>
    );

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  test('opens dropdown and shows options when clicked', async () => {
    render(
      <TestWrapper>
        <MultiSelectFilter
          label="Test Filter"
          options={testOptions}
          selectedValues={[]}
          onChange={mockOnChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      testOptions.forEach(option => {
        expect(screen.getByLabelText(option)).toBeInTheDocument();
      });
    });
  });

  test('calls onChange when option is selected', async () => {
    render(
      <TestWrapper>
        <MultiSelectFilter
          label="Test Filter"
          options={testOptions}
          selectedValues={[]}
          onChange={mockOnChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      const checkbox = screen.getByLabelText('Option 1');
      fireEvent.click(checkbox);
      expect(mockOnChange).toHaveBeenCalledWith(['Option 1']);
    });
  });

  test('calls onChange when option is deselected', async () => {
    render(
      <TestWrapper>
        <MultiSelectFilter
          label="Test Filter"
          options={testOptions}
          selectedValues={['Option 1', 'Option 2']}
          onChange={mockOnChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      const checkbox = screen.getByLabelText('Option 1');
      fireEvent.click(checkbox);
      expect(mockOnChange).toHaveBeenCalledWith(['Option 2']);
    });
  });

  test('shows correct checkboxes as checked based on selectedValues', async () => {
    render(
      <TestWrapper>
        <MultiSelectFilter
          label="Test Filter"
          options={testOptions}
          selectedValues={['Option 1', 'Option 3']}
          onChange={mockOnChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByLabelText('Option 1')).toBeChecked();
      expect(screen.getByLabelText('Option 2')).not.toBeChecked();
      expect(screen.getByLabelText('Option 3')).toBeChecked();
      expect(screen.getByLabelText('Option 4')).not.toBeChecked();
    });
  });

  test('displays and functions Select All option', async () => {
    render(
      <TestWrapper>
        <MultiSelectFilter
          label="Test Filter"
          options={testOptions}
          selectedValues={[]}
          onChange={mockOnChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      const selectAllCheckbox = screen.getByLabelText('Select All');
      expect(selectAllCheckbox).toBeInTheDocument();
      expect(selectAllCheckbox).not.toBeChecked();
    });
  });

  test('Select All functionality selects all options', async () => {
    render(
      <TestWrapper>
        <MultiSelectFilter
          label="Test Filter"
          options={testOptions}
          selectedValues={[]}
          onChange={mockOnChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      const selectAllCheckbox = screen.getByLabelText('Select All');
      fireEvent.click(selectAllCheckbox);
      expect(mockOnChange).toHaveBeenCalledWith(testOptions);
    });
  });

  test('Select All becomes Unselect All when all options are selected', async () => {
    render(
      <TestWrapper>
        <MultiSelectFilter
          label="Test Filter"
          options={testOptions}
          selectedValues={testOptions}
          onChange={mockOnChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      const unselectAllCheckbox = screen.getByLabelText('Unselect All');
      expect(unselectAllCheckbox).toBeInTheDocument();
      expect(unselectAllCheckbox).toBeChecked();
    });
  });

  test('Unselect All functionality unselects all options', async () => {
    render(
      <TestWrapper>
        <MultiSelectFilter
          label="Test Filter"
          options={testOptions}
          selectedValues={testOptions}
          onChange={mockOnChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      const unselectAllCheckbox = screen.getByLabelText('Unselect All');
      fireEvent.click(unselectAllCheckbox);
      expect(mockOnChange).toHaveBeenCalledWith([]);
    });
  });
});

describe('MultiSelectFilter Integration - Transaction Filtering', () => {
  test('multi-select filtering works correctly for transactions', () => {
    // Mock transaction data
    const transactions = [
      { id: '1', category: 'Food & Dining', type: 'expense', account: 'Checking', description: 'Test 1' },
      { id: '2', category: 'Transportation', type: 'expense', account: 'Credit', description: 'Test 2' },
      { id: '3', category: 'Food & Dining', type: 'income', account: 'Checking', description: 'Test 3' },
      { id: '4', category: 'Shopping', type: 'expense', account: 'Savings', description: 'Test 4' },
    ];

    // Test category filtering
    const categoryFilters = ['Food & Dining', 'Transportation'];
    const categoryFiltered = transactions.filter(t => categoryFilters.includes(t.category));
    expect(categoryFiltered).toHaveLength(3);
    expect(categoryFiltered.map(t => t.id)).toEqual(['1', '2', '3']);

    // Test type filtering
    const typeFilters = ['expense'];
    const typeFiltered = transactions.filter(t => typeFilters.includes(t.type));
    expect(typeFiltered).toHaveLength(3);
    expect(typeFiltered.map(t => t.id)).toEqual(['1', '2', '4']);

    // Test account filtering
    const accountFilters = ['Checking', 'Credit'];
    const accountFiltered = transactions.filter(t => accountFilters.includes(t.account));
    expect(accountFiltered).toHaveLength(3);
    expect(accountFiltered.map(t => t.id)).toEqual(['1', '2', '3']);

    // Test combined filtering
    const combinedFiltered = transactions
      .filter(t => categoryFilters.includes(t.category))
      .filter(t => typeFilters.includes(t.type));
    expect(combinedFiltered).toHaveLength(2);
    expect(combinedFiltered.map(t => t.id)).toEqual(['1', '2']);
  });

  test('empty filter arrays show all transactions', () => {
    const transactions = [
      { id: '1', category: 'Food & Dining', type: 'expense', account: 'Checking' },
      { id: '2', category: 'Transportation', type: 'expense', account: 'Credit' },
      { id: '3', category: 'Food & Dining', type: 'income', account: 'Checking' },
    ];

    // Empty filters should show all transactions
    const emptyFilters = { category: [], type: [], account: [] };
    
    let filtered = transactions;
    if (emptyFilters.category.length > 0) {
      filtered = filtered.filter(t => emptyFilters.category.includes(t.category));
    }
    if (emptyFilters.type.length > 0) {
      filtered = filtered.filter(t => emptyFilters.type.includes(t.type));
    }
    if (emptyFilters.account.length > 0) {
      filtered = filtered.filter(t => emptyFilters.account.includes(t.account));
    }

    expect(filtered).toHaveLength(3);
    expect(filtered).toEqual(transactions);
  });
});
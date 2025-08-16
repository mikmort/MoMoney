import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SetBalanceModal } from '../components/Settings/SetBalanceModal';
import { Account } from '../types';

describe('SetBalanceModal', () => {
  const mockAccount: Account = {
    id: '1',
    name: 'Test Checking',
    type: 'checking',
    institution: 'Test Bank',
    currency: 'USD',
    balance: 1000,
    isActive: true,
    historicalBalance: 800,
    historicalBalanceDate: new Date('2024-01-01')
  };

  const mockProps = {
    account: mockAccount,
    isOpen: true,
    onClose: jest.fn(),
    onSave: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the modal when open', () => {
    render(<SetBalanceModal {...mockProps} />);
    
    expect(screen.getByText('Set Balance for Test Checking')).toBeInTheDocument();
    expect(screen.getByText('as of date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set Balance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(<SetBalanceModal {...mockProps} isOpen={false} />);
    
    expect(screen.queryByText('Set Balance for Test Checking')).not.toBeInTheDocument();
  });

  it('should show current balance information', () => {
    render(<SetBalanceModal {...mockProps} />);
    
    expect(screen.getByText(/Current Balance: \$1,000.00/)).toBeInTheDocument();
    expect(screen.getByText(/as of 1\/1\/2024/)).toBeInTheDocument();
  });

  it('should initialize form with current balance', () => {
    render(<SetBalanceModal {...mockProps} />);
    
    const balanceInput = screen.getByDisplayValue('1000');
    expect(balanceInput).toBeInTheDocument();
  });

  it('should call onSave with correct values when saving', async () => {
    render(<SetBalanceModal {...mockProps} />);
    
    const balanceInput = screen.getByRole('spinbutton');
    const dateInput = screen.getByDisplayValue(new Date().toISOString().split('T')[0]);
    const saveButton = screen.getByRole('button', { name: 'Set Balance' });
    
    fireEvent.change(balanceInput, { target: { value: '1500' } });
    fireEvent.change(dateInput, { target: { value: '2024-02-01' } });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockProps.onSave).toHaveBeenCalledWith(1500, new Date('2024-02-01'));
      expect(mockProps.onClose).toHaveBeenCalled();
    });
  });

  it('should call onClose when cancel is clicked', () => {
    render(<SetBalanceModal {...mockProps} />);
    
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);
    
    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('should validate balance input', async () => {
    // Mock alert
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    
    render(<SetBalanceModal {...mockProps} />);
    
    const balanceInput = screen.getByRole('spinbutton');
    const saveButton = screen.getByRole('button', { name: 'Set Balance' });
    
    fireEvent.change(balanceInput, { target: { value: 'invalid' } });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Please enter a valid balance amount');
      expect(mockProps.onSave).not.toHaveBeenCalled();
    });
    
    alertSpy.mockRestore();
  });

  it('should handle account without historical balance', () => {
    const accountWithoutHistory = {
      ...mockAccount,
      historicalBalance: undefined,
      historicalBalanceDate: undefined
    };
    
    render(<SetBalanceModal {...mockProps} account={accountWithoutHistory} />);
    
    expect(screen.getByText(/Current Balance: \$1,000.00/)).toBeInTheDocument();
    // The "as of date" label should still be in the form, but the historical balance date info should not be
    expect(screen.queryByText(/as of 1\/1\/2024/)).not.toBeInTheDocument();
  });
});
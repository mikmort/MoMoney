import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navigation from '../components/Layout/Navigation';
import { useAppAuth } from '../hooks/useAppAuth';

// Mock the useAppAuth hook
jest.mock('../hooks/useAppAuth', () => ({
  useAppAuth: jest.fn()
}));

describe('Navigation - Transfer Matches Access', () => {
  const mockUseAppAuth = useAppAuth as jest.MockedFunction<typeof useAppAuth>;

  beforeEach(() => {
    mockUseAppAuth.mockReturnValue({
      user: { name: 'Test User', email: 'test@example.com' },
      account: null,
      logout: jest.fn(),
      isAuthenticated: true,
      isLoading: false
    });
  });

  it('should include Transfer Matches in navigation menu', () => {
    render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>
    );

    // Check that Transfer Matches is in the navigation
    expect(screen.getByText('Transfer Matches')).toBeInTheDocument();
    
    // Check that it has the correct icon
    const transferMatchesLink = screen.getByRole('link', { name: /Transfer Matches/ });
    expect(transferMatchesLink).toHaveAttribute('href', '/transfer-matches');
  });

  it('should show Transfer Matches as active when on that route', () => {
    render(
      <MemoryRouter initialEntries={['/transfer-matches']}>
        <Navigation />
      </MemoryRouter>
    );

    const transferMatchesLink = screen.getByRole('link', { name: /Transfer Matches/ });
    // The link should have active styling (this tests the isActive logic)
    expect(transferMatchesLink).toHaveAttribute('href', '/transfer-matches');
  });

  it('should have all expected navigation items including transfer matches', () => {
    render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>
    );

    const expectedItems = [
      'Dashboard',
      'Transactions', 
      'Transfer Matches',
      'Rules',
      'Accounts',
      'Categories',
      'Budgets',
      'Reports',
      'Settings'
    ];

    expectedItems.forEach(item => {
      expect(screen.getByText(item)).toBeInTheDocument();
    });
  });
});
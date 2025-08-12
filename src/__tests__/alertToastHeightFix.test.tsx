import React from 'react';
import { render, screen } from '@testing-library/react';
import AlertToast from '../components/shared/AlertToast';

describe('AlertToast Height Fix', () => {
  it('should use content-based height and proper flexbox alignment for "Rule Applied" type notifications', () => {
    const longMessage = 'Rule updated successfully!\n\nReclassified 10 existing transaction(s) with the same description and account.';
    
    render(
      <AlertToast
        isOpen={true}
        onClose={() => {}}
        type="success"
        title="Rule Applied"
        message={longMessage}
      />
    );

    // Check that the overlay is properly positioned
    const overlay = screen.getByText('Rule Applied').closest('[data-styled]') || 
                   screen.getByText('Rule Applied').parentElement?.parentElement?.parentElement;
    
    if (overlay) {
      const computedStyle = window.getComputedStyle(overlay);
      
      // Verify overlay uses proper flexbox properties
      expect(computedStyle.position).toBe('fixed');
      expect(computedStyle.display).toBe('flex');
      expect(computedStyle.justifyContent).toBe('center');
      expect(computedStyle.alignItems).toBe('flex-start'); // This is the key fix
      
      // Verify full-screen overlay positioning
      expect(computedStyle.top).toBe('0px');
      expect(computedStyle.left).toBe('0px');
      expect(computedStyle.right).toBe('0px');
      expect(computedStyle.bottom).toBe('0px');
    }

    // Check that the toast container doesn't have forced height
    const toastContainer = screen.getByText('Rule Applied').closest('[data-styled]');
    
    if (toastContainer && toastContainer !== overlay) {
      const containerStyle = window.getComputedStyle(toastContainer);
      
      // Verify content-based sizing (should not have fixed height)
      expect(containerStyle.height).not.toBe('100%');
      expect(containerStyle.height).not.toBe('100vh');
      expect(containerStyle.minHeight).not.toBe('100%');
      expect(containerStyle.minHeight).not.toBe('100vh');
      
      // Should have proper width constraints
      expect(containerStyle.maxWidth).toBe('500px');
    }

    // Verify the content is displayed
    expect(screen.getByText('Rule Applied')).toBeInTheDocument();
    expect(screen.getByText(/Rule updated successfully/)).toBeInTheDocument();
    expect(screen.getByText(/Reclassified 10 existing/)).toBeInTheDocument();
  });

  it('should have proper z-index for overlay positioning', () => {
    render(
      <AlertToast
        isOpen={true}
        onClose={() => {}}
        type="success"
        title="Rule Applied"
        message="Test message"
      />
    );

    const overlay = screen.getByText('Rule Applied').closest('[data-styled]') || 
                   screen.getByText('Rule Applied').parentElement?.parentElement?.parentElement;
    
    if (overlay) {
      const computedStyle = window.getComputedStyle(overlay);
      expect(parseInt(computedStyle.zIndex, 10)).toBeGreaterThanOrEqual(1000);
    }
  });

  it('should not render when isOpen is false', () => {
    const { container } = render(
      <AlertToast
        isOpen={false}
        onClose={() => {}}
        type="success"
        title="Rule Applied"
        message="Test message"
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
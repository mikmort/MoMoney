import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { menuStateManager } from '../../utils/menuStateManager';

const MenuContainer = styled.div`
  position: relative;
  display: inline-block;
  z-index: 20000; /* sit above grids and headers */
  pointer-events: auto; /* ensure clicks reach the trigger */
`;

const MenuButton = styled.button`
  background: white;
  border: 1px solid ${props => props.theme?.primary || '#1976d2'};
  border-radius: 4px;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.theme?.primary || '#1976d2'};
  transition: all 0.2s ease;
  z-index: 20001; /* above container */
  position: relative;
  pointer-events: auto;
  user-select: none;
  
  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &:active {
    background: #e0e0e0;
  }

`;

export interface MenuAction {
  icon: string;
  label: string;
  onClick: () => void;
  variant?: 'danger';
}

interface ActionsMenuProps {
  actions: MenuAction[];
  menuId: string; // Unique identifier for this menu instance
}

const ActionsMenuComponent: React.FC<ActionsMenuProps> = ({ actions, menuId }) => {
  // Use a combination of external state manager and local state for re-rendering
  const [, forceRender] = useState(0);
  const isOpen = menuStateManager.isMenuOpen(menuId);
  const menuPosition = menuStateManager.getMenuPosition(menuId);
  const menuRef = useRef<HTMLDivElement>(null);

  // Function to trigger re-render when external state changes
  const updateState = useCallback((newIsOpen: boolean) => {
    if (newIsOpen && menuRef.current) {
      // Calculate position when opening
      const rect = menuRef.current.getBoundingClientRect();
      const menuWidth = 150;
      const menuHeight = actions.length * 40; // Estimate menu height
      
      let left = rect.right - menuWidth; // Align to right edge of button
      let top = rect.bottom;
      
      // Adjust if menu would go off the right edge of viewport
      if (left + menuWidth > window.innerWidth - 10) {
        left = rect.left - menuWidth; // Show on left side of button
      }
      
      // Adjust if menu would go off the bottom edge of viewport
      if (top + menuHeight > window.innerHeight - 10) {
        top = rect.top - menuHeight; // Show above button
      }
      
      // Ensure minimum margins
      left = Math.max(10, left);
      top = Math.max(10, top);
      
      // For fixed positioning, we don't need to add scroll offset
      const position = {
        top: top, // Remove window.scrollY since we're using position: fixed
        left: left // Remove window.scrollX since we're using position: fixed
      };
      menuStateManager.setMenuPosition(menuId, position);
    }
    menuStateManager.setMenuOpen(menuId, newIsOpen);
    forceRender(prev => prev + 1); // Force re-render
  }, [actions.length, menuId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        // Also check if the click was on the portal menu
        const target = event.target as Element;
        const isMenuClick = target.closest('[data-menu-portal]');
        if (!isMenuClick) {
          updateState(false);
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, menuId, updateState]);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // onClick is a no-op (we toggle on mousedown) to avoid double toggles
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Open/close on mousedown so AG Grid or parents don't swallow the click
    e.preventDefault();
    e.stopPropagation();
    const next = !isOpen;
    // slight deferral to avoid any immediate outside-click handlers
    setTimeout(() => updateState(next), 0);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // Prevent bubbling to grid/cell handlers
    e.preventDefault();
    e.stopPropagation();
  };

  const handleActionClick = (action: MenuAction) => {
    action.onClick();
    updateState(false);
  };

  return (
    <MenuContainer ref={menuRef}>
      <MenuButton 
        onClick={handleMenuClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        type="button"
        aria-label="Open actions menu"
      >
        ⋯
      </MenuButton>
      
      {/* Render menu in a portal to escape any container constraints */}
      {isOpen && createPortal(
        <div 
          data-menu-portal="true"
          style={{
            position: 'fixed', // Fixed positioning relative to viewport
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 999999,
            minWidth: '150px',
            maxHeight: '300px',
            overflowY: 'auto'
          }}
        >
          {actions.map((action, index) => (
            <button
              key={index}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                background: 'white',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: action.variant === 'danger' ? '#f44336' : '#333',
                borderBottom: index < actions.length - 1 ? '1px solid #eee' : 'none'
              }}
              onClick={() => handleActionClick(action)}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.background = action.variant === 'danger' ? '#fff5f5' : '#f5f5f5';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.background = 'white';
              }}
            >
              <span>{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </MenuContainer>
  );
};

export const ActionsMenu = React.memo(ActionsMenuComponent);

export default ActionsMenu;

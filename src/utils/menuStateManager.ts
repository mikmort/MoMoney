// Global menu state manager to persist menu states across component re-renders
class MenuStateManager {
  private menuStates = new Map<string, boolean>();
  private menuPositions = new Map<string, { top: number; left: number }>();

  setMenuOpen(menuId: string, isOpen: boolean) {
    this.menuStates.set(menuId, isOpen);
    if (!isOpen) {
      // Clear position when menu closes
      this.menuPositions.delete(menuId);
    }
  }

  isMenuOpen(menuId: string): boolean {
    return this.menuStates.get(menuId) || false;
  }

  setMenuPosition(menuId: string, position: { top: number; left: number }) {
    this.menuPositions.set(menuId, position);
  }

  getMenuPosition(menuId: string): { top: number; left: number } {
    return this.menuPositions.get(menuId) || { top: 0, left: 0 };
  }

  closeAllMenus() {
    this.menuStates.clear();
    this.menuPositions.clear();
  }

  closeMenu(menuId: string) {
    this.menuStates.delete(menuId);
    this.menuPositions.delete(menuId);
  }
}

export const menuStateManager = new MenuStateManager();

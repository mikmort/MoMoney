import { UserPreferences } from '../types';
import { db } from './db';
import { mockUser } from '../config/devConfig';

class UserPreferencesService {
  private preferences: UserPreferences | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Try to load preferences from database
      this.preferences = await db.getUserPreferences();
      
      // If no preferences exist, initialize with defaults
      if (!this.preferences) {
        this.preferences = { ...mockUser.preferences };
        await this.savePreferences(this.preferences);
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize user preferences:', error);
      // Fallback to default preferences
      this.preferences = { ...mockUser.preferences };
      this.isInitialized = true;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  async getPreferences(): Promise<UserPreferences> {
    await this.ensureInitialized();
    return { ...this.preferences! };
  }

  async updatePreferences(updates: Partial<UserPreferences>): Promise<UserPreferences> {
    await this.ensureInitialized();
    
    this.preferences = {
      ...this.preferences!,
      ...updates
    };
    
    await this.savePreferences(this.preferences);
    return { ...this.preferences };
  }

  async getDefaultCurrency(): Promise<string> {
    const preferences = await this.getPreferences();
    return preferences.currency;
  }

  async setDefaultCurrency(currency: string): Promise<void> {
    await this.updatePreferences({ currency });
  }

  private async savePreferences(preferences: UserPreferences): Promise<void> {
    try {
      await db.saveUserPreferences(preferences);
    } catch (error) {
      console.error('Failed to save user preferences:', error);
      throw error;
    }
  }

  // Get common currency options for the UI
  getCurrencyOptions(): Array<{ value: string; label: string; symbol: string }> {
    return [
      { value: 'USD', label: 'US Dollar', symbol: '$' },
      { value: 'EUR', label: 'Euro', symbol: '€' },
      { value: 'GBP', label: 'British Pound', symbol: '£' },
      { value: 'CAD', label: 'Canadian Dollar', symbol: 'C$' },
      { value: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
      { value: 'JPY', label: 'Japanese Yen', symbol: '¥' },
      { value: 'CHF', label: 'Swiss Franc', symbol: 'CHF' },
      { value: 'CNY', label: 'Chinese Yuan', symbol: '¥' },
      { value: 'INR', label: 'Indian Rupee', symbol: '₹' },
      { value: 'KRW', label: 'South Korean Won', symbol: '₩' },
      { value: 'MXN', label: 'Mexican Peso', symbol: 'MX$' },
      { value: 'BRL', label: 'Brazilian Real', symbol: 'R$' },
      { value: 'SEK', label: 'Swedish Krona', symbol: 'kr' },
      { value: 'NOK', label: 'Norwegian Krone', symbol: 'kr' },
      { value: 'DKK', label: 'Danish Krone', symbol: 'kr' }
    ];
  }

  // Get currency symbol for display
  getCurrencySymbol(currencyCode: string): string {
    const currency = this.getCurrencyOptions().find(c => c.value === currencyCode);
    return currency?.symbol || currencyCode;
  }

  // Get available AI model options for the UI
  getAIModelOptions(): Array<{ value: string; label: string; description: string }> {
    return [
      { 
        value: 'gpt-5-chat', 
        label: 'GPT-5 Chat', 
        description: 'Advanced conversational AI model (default)' 
      },
      { 
        value: 'gpt-5-mini', 
        label: 'GPT-5 Mini', 
        description: 'Lightweight version of GPT-5 for faster processing' 
      }
    ];
  }

  // Get the user's selected AI model or default
  async getSelectedAIModel(): Promise<string> {
    const preferences = await this.getPreferences();
    return preferences.aiModel || 'gpt-5-chat';
  }

  // Set the user's preferred AI model
  async setSelectedAIModel(model: string): Promise<void> {
    await this.updatePreferences({ aiModel: model });
  }
}

// Export singleton instance
export const userPreferencesService = new UserPreferencesService();
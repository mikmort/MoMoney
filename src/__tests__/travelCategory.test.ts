import { defaultCategories } from '../data/defaultCategories';
import { Category } from '../types';

describe('Travel Category', () => {
  let travelCategory: Category | undefined;

  beforeAll(() => {
    // Find the travel category
    travelCategory = defaultCategories.find(category => category.id === 'travel');
  });

  test('should have a travel category', () => {
    expect(travelCategory).toBeDefined();
    expect(travelCategory?.name).toBe('Travel');
    expect(travelCategory?.type).toBe('expense');
  });

  test('should have appropriate visual properties', () => {
    expect(travelCategory?.color).toBeDefined();
    expect(travelCategory?.icon).toBeDefined();
  });

  test('should have essential travel subcategories', () => {
    const subcategoryIds = travelCategory?.subcategories.map(sub => sub.id) || [];
    const subcategoryNames = travelCategory?.subcategories.map(sub => sub.name) || [];

    // Check for key travel expense subcategories
    expect(subcategoryIds).toContain('travel-hotels');
    expect(subcategoryIds).toContain('travel-airfare');
    expect(subcategoryIds).toContain('travel-rental-car');

    expect(subcategoryNames).toContain('Hotels');
    expect(subcategoryNames).toContain('Airfare');
    expect(subcategoryNames).toContain('Rental Car');
  });

  test('should have keywords for AI classification', () => {
    const subcategories = travelCategory?.subcategories || [];

    // Check that key subcategories have appropriate keywords
    const hotelsSub = subcategories.find(sub => sub.id === 'travel-hotels');
    expect(hotelsSub?.keywords).toBeDefined();
    expect(hotelsSub?.keywords).toContain('hotel');

    const airfareSub = subcategories.find(sub => sub.id === 'travel-airfare');
    expect(airfareSub?.keywords).toBeDefined();
    expect(airfareSub?.keywords).toContain('airline');

    const rentalCarSub = subcategories.find(sub => sub.id === 'travel-rental-car');
    expect(rentalCarSub?.keywords).toBeDefined();
    expect(rentalCarSub?.keywords).toContain('rental car');
  });

  test('should have descriptions for all subcategories', () => {
    const subcategories = travelCategory?.subcategories || [];
    
    subcategories.forEach(subcategory => {
      expect(subcategory.description).toBeDefined();
      expect(subcategory.description?.length).toBeGreaterThan(0);
    });
  });

  test('should not conflict with existing transportation business travel', () => {
    const transportCategory = defaultCategories.find(category => category.id === 'transportation');
    const businessTravelSub = transportCategory?.subcategories.find(sub => sub.id === 'transport-business');
    
    // Ensure business travel still exists in transportation
    expect(businessTravelSub).toBeDefined();
    expect(businessTravelSub?.name).toBe('Business Travel');
  });
});
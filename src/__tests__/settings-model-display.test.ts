/**
 * Test to verify Settings page displays the correct model name
 */
import { azureOpenAIService } from '../services/azureOpenAIService';

describe('Settings Model Display', () => {
  test('Azure OpenAI service returns configured deployment name', async () => {
    // Get service info which is displayed on Settings page
    const serviceInfo = await azureOpenAIService.getServiceInfo();
    
    // Should have status, model, and initialized properties
    expect(serviceInfo).toHaveProperty('status');
    expect(serviceInfo).toHaveProperty('model'); 
    expect(serviceInfo).toHaveProperty('initialized');
    
    // Model should be a string (either from env var or default)
    expect(typeof serviceInfo.model).toBe('string');
    expect(serviceInfo.model.length).toBeGreaterThan(0);
    
    // Should match common deployment names
    expect(['gpt-5-chat', 'gpt-4o', 'gpt-4'].some(name => 
      serviceInfo.model.includes(name)
    )).toBe(true);
  });

  test('Service should be initialized and ready', async () => {
    const serviceInfo = await azureOpenAIService.getServiceInfo();
    
    expect(serviceInfo.initialized).toBe(true);
    expect(serviceInfo.status).toBe('ready');
  });

  test('Model name should be consistent across calls', async () => {
    const serviceInfo1 = await azureOpenAIService.getServiceInfo();
    const serviceInfo2 = await azureOpenAIService.getServiceInfo();
    
    expect(serviceInfo1.model).toBe(serviceInfo2.model);
  });
});
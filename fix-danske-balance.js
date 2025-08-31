// Quick fix script to set proper historical balance for Danske Individual account
// Run this in the browser console while on the application

console.log('🔧 Fixing Danske Individual account historical balance...');

// Get the current data
const currentData = localStorage.getItem('mo_money_data');
if (!currentData) {
  console.error('❌ No data found in localStorage');
} else {
  const data = JSON.parse(currentData);
  
  // Find the Danske Individual account
  const danskeAccount = data.accounts?.find(acc => acc.name === 'Danske Individual');
  
  if (danskeAccount) {
    console.log('📊 Current Danske Individual account:', danskeAccount);
    
    // Set a reasonable historical balance based on the last positive month (May 2024)
    danskeAccount.historicalBalance = 154286.09; // DKK amount from May 2024
    danskeAccount.historicalBalanceDate = '2024-05-31T00:00:00.000Z'; // End of May 2024
    
    console.log('✅ Updated account with historical balance:', {
      historicalBalance: danskeAccount.historicalBalance,
      historicalBalanceDate: danskeAccount.historicalBalanceDate
    });
    
    // Save back to localStorage
    localStorage.setItem('mo_money_data', JSON.stringify(data));
    
    console.log('💾 Saved to localStorage. Refresh the page to see the changes.');
    
    // Trigger a page refresh
    window.location.reload();
  } else {
    console.error('❌ Danske Individual account not found');
    console.log('Available accounts:', data.accounts?.map(a => a.name));
  }
}

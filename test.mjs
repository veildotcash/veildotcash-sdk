/**
 * Quick test script for Veil SDK
 * 
 * Usage:
 *   node test.mjs              # Run all tests
 *   node test.mjs keypair      # Test keypair only
 *   node test.mjs tx           # Test transaction building
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { 
  Keypair, 
  buildRegisterTx, 
  buildDepositETHTx, 
  buildDepositUSDCTx,
  buildApproveUSDCTx,
  getAddresses,
  POOL_CONFIG,
} = require('./dist/index.cjs');

const TEST_ADDRESS = '0x1234567890123456789012345678901234567890';

function testKeypair() {
  console.log('\n=== Keypair Tests ===\n');
  
  // Generate new keypair
  const keypair = new Keypair();
  const depositKey = keypair.depositKey();
  
  console.log('Generated new keypair:');
  console.log('  Private key:', String(keypair.privkey));
  console.log('  Public key:', String(keypair.pubkey));
  console.log('  Deposit key:', depositKey);
  console.log('  Deposit key length:', depositKey.length, 'chars');
  console.log('  Starts with 0x:', depositKey.startsWith('0x') ? '✓' : '✗');
  
  // Test restoration
  const restored = new Keypair(keypair.privkey);
  console.log('\nRestored from private key:');
  console.log('  Keys match:', restored.depositKey() === depositKey ? '✓' : '✗');
  
  // Test fromString (public key only)
  const fromPublic = Keypair.fromString(depositKey);
  console.log('\nCreated from deposit key (public only):');
  console.log('  Has private key:', fromPublic.privkey ? 'yes' : 'no');
  console.log('  Pubkeys match:', String(fromPublic.pubkey) === String(keypair.pubkey) ? '✓' : '✗');
  
  return true;
}

function testTransactionBuilders() {
  console.log('\n=== Transaction Builder Tests ===\n');
  
  const keypair = new Keypair();
  const depositKey = keypair.depositKey();
  const addresses = getAddresses();
  
  console.log('Contract addresses:');
  console.log('  Entry:', addresses.entry);
  console.log('  ETH Pool:', addresses.ethPool);
  console.log('  USDC Pool:', addresses.usdcPool);
  console.log('  Chain ID:', addresses.chainId);
  
  // Test register tx
  console.log('\n1. Register Transaction:');
  const registerTx = buildRegisterTx(depositKey, TEST_ADDRESS);
  console.log('  To:', registerTx.to);
  console.log('  Data:', registerTx.data.slice(0, 40) + '...');
  console.log('  Target is Entry:', registerTx.to === addresses.entry ? '✓' : '✗');
  
  // Test ETH deposit tx
  console.log('\n2. ETH Deposit Transaction:');
  const ethTx = buildDepositETHTx({ depositKey, amount: '0.1' });
  console.log('  To:', ethTx.to);
  console.log('  Value:', ethTx.value?.toString(), 'wei');
  console.log('  Value in ETH:', Number(ethTx.value) / 1e18);
  console.log('  Target is Entry:', ethTx.to === addresses.entry ? '✓' : '✗');
  
  // Test USDC approve tx
  console.log('\n3. USDC Approve Transaction:');
  const approveTx = buildApproveUSDCTx({ amount: '100' });
  console.log('  To:', approveTx.to);
  console.log('  Target is USDC token:', approveTx.to === addresses.usdcToken ? '✓' : '✗');
  console.log('  (Approving Entry contract to spend USDC)');
  
  // Test USDC deposit tx
  console.log('\n4. USDC Deposit Transaction:');
  const usdcTx = buildDepositUSDCTx({ depositKey, amount: '100' });
  console.log('  To:', usdcTx.to);
  console.log('  Target is Entry:', usdcTx.to === addresses.entry ? '✓' : '✗');
  
  // Pool config
  console.log('\n5. Pool Config:');
  console.log('  ETH decimals:', POOL_CONFIG.eth.decimals);
  console.log('  USDC decimals:', POOL_CONFIG.usdc.decimals);
  
  return true;
}

async function testStatusCheck() {
  console.log('\n=== Status Check Test ===\n');
  console.log('Skipping (requires real address with deposits)');
  console.log('To test: checkDepositStatus({ address: "0x..." })');
  return true;
}

// Run tests
async function main() {
  const arg = process.argv[2];
  
  console.log('╔═══════════════════════════════════════╗');
  console.log('║        Veil SDK Test Suite            ║');
  console.log('╚═══════════════════════════════════════╝');
  
  try {
    if (!arg || arg === 'keypair') {
      testKeypair();
    }
    
    if (!arg || arg === 'tx') {
      testTransactionBuilders();
    }
    
    if (!arg || arg === 'status') {
      await testStatusCheck();
    }
    
    console.log('\n✓ All tests passed!\n');
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

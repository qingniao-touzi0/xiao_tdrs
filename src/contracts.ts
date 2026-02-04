// BSC 主网合约地址
const BSC_CONTRACTS = {
  token: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  pair: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  taxFeeReceiver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  burnDividend: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  performanceNFT: '0x9Fa9620784C9691F4Df5d2e16fb2851D7132dB3E' as `0x${string}`,
  nftDividend: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  nftSubscription: '0xC1Cc75899e689d117e6Bc942C4c4Cb508b194B7C' as `0x${string}`,
  lossDividend: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  burnToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
};

// 本地网络合约地址
const LOCAL_CONTRACTS = {
  token: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  pair: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  taxFeeReceiver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  burnDividend: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  performanceNFT: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  nftDividend: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  nftSubscription: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  lossDividend: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  burnToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
};

// 根据 chainId 获取合约地址
export const getContracts = (chainId?: number) => {
  // 如果明确是本地网络，才返回本地合约
  if (chainId === 31337 || chainId === 1337) {
    return LOCAL_CONTRACTS;
  }
  // 其他情况（包括 undefined, 1, 56 等）默认返回 BSC 合约
  // 这样即使用户连错网络，也能看到 BSC 上的数据
  return BSC_CONTRACTS;
};

// 默认导出（用于兼容旧代码）
export const CONTRACTS = LOCAL_CONTRACTS;

// 网络配置
export const BSC_RPC = 'https://bsc-dataseed1.binance.org';
export const BSC_CHAIN_ID = 56;
export const LOCAL_RPC = 'http://127.0.0.1:8545';
export const LOCAL_CHAIN_ID = 31337;

// ERC20 ABI (简化版)
export const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

// BurnToken ABI
export const BURN_TOKEN_ABI = [
  'function token() view returns (address)',
  'function rootInviter() view returns (address)',
  'function inviterOf(address) view returns (address)',
  'function burnedValueOf(address) view returns (uint256)',
  'function totalBurnedValue() view returns (uint256)',
  'function inviteeCount(address) view returns (uint256)',
  'function minBurnValue() view returns (uint256)',
  'function burn(uint256 amount, address inviter)',
];

// BurnDividend ABI
export const BURN_DIVIDEND_ABI = [
  'function getUnpaidDividendBNB(address) view returns (uint256)',
  'function getUnpaidDividendToken(address) view returns (uint256)',
  'function claimBNB()',
  'function claimToken()',
];

// LossDividend ABI
export const LOSS_DIVIDEND_ABI = [
  'function token() view returns (address)',
  'function pool() view returns (address)',
  'function minTokenReserve() view returns (uint256)',
  'function minBnbReserve() view returns (uint256)',
  'function userSnapshots(address) view returns (uint256 costBasis, uint256 soldValue, uint256 dividendReceived)',
  'function getCachedLoss(address) view returns (uint256 loss, bool valid)',
  'function getUnpaidDividend(address user, uint256 cachedLoss) view returns (uint256)',
  'function totalDividendsAllocated() view returns (uint256)',
  'function totalDividendsClaimed() view returns (uint256)',
  'function claim()',
];

// NFTDividend ABI
export const NFT_DIVIDEND_ABI = [
  'function getUserInfo(address) view returns (uint256 performance, uint256 nftCount, uint256 totalDividends, uint256 pendingDividends)',
  'function getClaimableNFTCount(address) view returns (uint256)',
  'function claim()',
  'function claimNFT()',
];

// NFTSubscription ABI
export const NFT_SUBSCRIPTION_ABI = [
  'function pricePerShare() view returns (uint256)',
  'function getTwoLevelSubscribed(address) view returns (uint256)',
  'function teamSubscribed(address) view returns (uint256)',
  'function inviterOf(address) view returns (address)',
  'function rootInviter() view returns (address)',
  'function subscribe(uint256 shares, address inviter) payable',
];

// Pair ABI
export const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
];

import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { bsc } from '@reown/appkit/networks';

// 获取 WalletConnect Project ID: https://cloud.walletconnect.com/
// 这里使用一个公共的 Project ID，建议你去官网申请自己的
const projectId = '3a8170812b534d0ff9d794f19a901d64';

// 定义本地网络
// const localhost = {
//   id: 31337,
//   name: 'Localhost',
//   nativeCurrency: {
//     decimals: 18,
//     name: 'Ether',
//     symbol: 'ETH',
//   },
//   rpcUrls: {
//     default: { http: ['http://127.0.0.1:8545'] },
//     public: { http: ['http://127.0.0.1:8545'] },
//   },
//   blockExplorers: {
//     default: { name: 'Local', url: 'http://localhost:8545' },
//   },
//   testnet: true,
// };

// 创建 Ethers 适配器
const ethersAdapter = new EthersAdapter();

// 元数据
const metadata = {
  name: 'FLAP BURN',
  description: 'FLAP Token Burn DApp',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://flapburn.com',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

// 创建 AppKit 实例
createAppKit({
  adapters: [ethersAdapter],
  networks: [bsc], // networks: [bsc, localhost],
  defaultNetwork: bsc, // defaultNetwork: localhost,
  metadata,
  projectId,
  features: {
    analytics: false,
    email: false,
    socials: [],
    onramp: false,
  },
  themeMode: 'light',
  themeVariables: {
    '--w3m-accent': '#3b82f6',
    '--w3m-border-radius-master': '12px',
  },
  enableWalletConnect: false, // 禁用 WalletConnect 云服务
});

export { ethersAdapter };

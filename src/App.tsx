import { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers, BrowserProvider, JsonRpcSigner } from 'ethers';
import { Globe, Copy } from 'lucide-react';
import { useAppKitAccount, useAppKitProvider, useAppKitNetwork, useAppKit } from '@reown/appkit/react';
import { bsc } from '@reown/appkit/networks';
import type { Provider } from '@reown/appkit-adapter-ethers';
import { translations, LangType } from './locales';
import {
  getContracts,
  BSC_RPC,
  ERC20_ABI,
  BURN_TOKEN_ABI,
  BURN_DIVIDEND_ABI,
  LOSS_DIVIDEND_ABI,
  NFT_DIVIDEND_ABI,
  NFT_SUBSCRIPTION_ABI,
  PAIR_ABI,
} from './contracts';

// 格式化 BNB 显示
const formatBNB = (value: bigint | undefined, digits = 4) => {
  if (value === undefined || value === null) return '0';
  const num = Number(ethers.formatEther(value));
  if (!Number.isFinite(num)) return '0';
  if (num === 0) return '0';
  
  // 对于非常小的数值，自动增加小数位数以显示有效数字
  let actualDigits = digits;
  if (num < 0.01 && num > 0) {
    actualDigits = 6; // 显示更多小数位
  }
  
  const fixed = num.toFixed(actualDigits);
  // 移除尾部多余的 0，但保留至少有意义的数字
  const trimmed = fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return trimmed || '0';
};

function App() {
  const [lang, setLang] = useState<LangType>('zh');
  const t = translations[lang];

  // AppKit hooks
  const { address, isConnected } = useAppKitAccount();
  const { chainId, switchNetwork } = useAppKitNetwork();
  const { walletProvider } = useAppKitProvider<Provider>('eip155');
  const { open } = useAppKit();

  // 根据 chainId 获取当前网络的合约地址
  const CONTRACTS = useMemo(() => getContracts(typeof chainId === 'number' ? chainId : undefined), [chainId]);

  // 根据 chainId 获取 API 路径
  const MONITOR_API_BASE = useMemo(() => {
    return chainId === 56 
      ? 'https://tdrs.web3shopcn.com/api' 
      : 'http://127.0.0.1:3001/api';
  }, [chainId]);

  // 进页面自动检查连接
  useEffect(() => {
    // 延迟检查，避免与自动重连冲突。且只执行一次。
    setTimeout(() => {
      // 这里的逻辑有点 tricky，因为闭包原因直接读 isConnected 可能不准。
      // 但绝大多数 Web3Modal 适配器在挂载时如果已授权会很快变更为 connecting/connected。
      // 如果 1 秒后仍在 disconnected，则弹窗。
      // 为了获取最新状态，我们可以利用 ref 或者简单地假定大多数用户进此时需要连接
      // 更安全的方式其实是检查 DOM 或者相信 AppKit 的内部状态，但这里暂用简单逻辑：
      // 直接调用 open({ view: 'Connect' })，AppKit 内部通常会判断
      // 如果已经连接，open() 默认是打开 Account 视图，我们可以通过 view 参数强制 Connect?
      // Reown AppKit 的 open() 可能不接受 view 参数或者行为不同。
      // 让我们尝试使用一个 Ref 来阻断后续的自动弹窗，防止用户断开后反复弹。
    }, 1000);
  }, []);

  // 使用一个 Effect 监听状态变化来决定是否弹窗，但限制只弹一次
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  
  useEffect(() => {
    if (!hasAutoOpened && !isConnected) {
        // 设置一个短暂延时，如果过了一会儿还是未连接，就弹窗
        const timer = setTimeout(() => {
            if (!isConnected) { // 这里依赖了 isConnected 的最新值（因为在 deps 里）? 
                // 不，setTimeout 里的 isConnected 是闭包捕获的... 
                // 等等，如果在 useEffect Deps 包含 isConnected，每次变化都会重置 timer。
                // 如果 isConnected 变成了 true，effect 重新执行，!isConnected 为 false，不进这里。
                // 如果 isConnected 初始 false， timer 启动。
                // 1秒后，如果还没变 true（即 effect 没被销毁/重跑），说明一直 false。
                // 此时执行 open()。
                open();
                setHasAutoOpened(true);
            }
        }, 800);
        return () => clearTimeout(timer);
    }
  }, [isConnected, hasAutoOpened, open]);

  // 内部 signer 状态 (用于合约交互)
  const [signer, setSigner] = useState<ethers.Signer | null>(null);

  // 合约数据状态
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>('TOKEN');
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [inviterOnchain, setInviterOnchain] = useState<string | null>(null);
  const [nftInviterOnchain, setNftInviterOnchain] = useState<string | null>(null);
  const [rootInviter, setRootInviter] = useState<string | null>(null);
  const [myBurnedValue, setMyBurnedValue] = useState<bigint>(0n);
  const [totalBurnedValue, setTotalBurnedValue] = useState<bigint>(0n);
  const [inviteeCount, setInviteeCount] = useState<bigint>(0n);
  const [minBurnValue, setMinBurnValue] = useState<bigint>(0n);
  const [tokenReserve, setTokenReserve] = useState<bigint>(0n);
  const [bnbReserve, setBnbReserve] = useState<bigint>(0n);

  // NFT Subscription
  const [nftSubPrice, setNftSubPrice] = useState<bigint>(0n);
  const [nftSubTwoLevel, setNftSubTwoLevel] = useState<bigint>(0n);
  const [nftSubTeam, setNftSubTeam] = useState<bigint>(0n);
  const [nftSubInviter] = useState<string>('');
  const [nftSubRootInviter, setNftSubRootInviter] = useState<string>('');

  // 从 URL 读取邀请人地址
  const inviterFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const inviter = params.get('ref'); // 使用 ref 参数
    if (inviter && ethers.isAddress(inviter)) {
      return inviter;
    }
    return '';
  }, []);

  // Burn Dividend
  const [burnUnpaidBNB, setBurnUnpaidBNB] = useState<bigint>(0n);
  const [burnUnpaidToken, setBurnUnpaidToken] = useState<bigint>(0n);

  // Loss Dividend
  const [lossSnapshot, setLossSnapshot] = useState<{ costBasis: bigint; soldValue: bigint; dividendReceived: bigint }>({
    costBasis: 0n, soldValue: 0n, dividendReceived: 0n
  });
  const [cachedLoss, setCachedLoss] = useState<{ loss: bigint; valid: boolean }>({ loss: 0n, valid: false });
  const [lossPendingDividend, setLossPendingDividend] = useState<bigint>(0n);
  const [lossContractBalance, setLossContractBalance] = useState<bigint>(0n);
  const [holdingValue, setHoldingValue] = useState<bigint>(0n);

  type OffchainStatus = {
    costBasis?: string;
    soldValue?: string;
    currentHoldingValue?: string;
    lossAmount?: string;
    canClaim?: boolean;
    thresholds?: {
      minHoldingValue?: string;
      minLossValue?: string;
    };
  };

  const [offchainStatus, setOffchainStatus] = useState<OffchainStatus | null>(null);

  const parseWeiString = (value?: string) => {
    if (!value) return 0n;
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  };

  // 独立出来的 offchain 数据获取逻辑
  const fetchOffchainStatus = useCallback(async () => {
    // API 接口已关闭
    setOffchainStatus(null);
    /*
    if (!address) {
      setOffchainStatus(null);
      return;
    }
    try {
      const res = await fetch(`${MONITOR_API_BASE}/user-status/${address}`);
      if (res.ok) {
        const data = await res.json();
        setOffchainStatus(data);
      } else {
        console.warn('offchain fetch failed');
      }
    } catch (e) {
      console.error('offchain fetch error', e);
    }
    */
  }, [address, MONITOR_API_BASE]);

  // NFT Dividend
  const [nftUserInfo, setNftUserInfo] = useState<{ performance: bigint; nftCount: bigint; pendingDividends: bigint }>({
    performance: 0n, nftCount: 0n, pendingDividends: 0n
  });
  const [claimableNfts, setClaimableNfts] = useState<bigint>(0n);

  // UI 状态
  const [burnAmount, setBurnAmount] = useState('');
  const [inviter, setInviter] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const isLocalChain = chainId === 31337 || chainId === 1337;
  const readRpc = isLocalChain ? 'http://localhost:8545' : BSC_RPC;

  // 当钱包连接状态变化时更新 signer
  useEffect(() => {
    const updateSigner = async () => {
      if (isConnected && walletProvider && address) {
        try {
          const provider = new BrowserProvider(walletProvider, chainId);
          const walletSigner = new JsonRpcSigner(provider, address);
          setSigner(walletSigner);
        } catch (err) {
          console.error('获取 signer 失败:', err);
          setSigner(null);
        }
      } else {
        setSigner(null);
      }
    };
    updateSigner();
  }, [isConnected, walletProvider, address, chainId]);

  useEffect(() => {
    fetchOffchainStatus();
  }, [fetchOffchainStatus]);

  // 加载合约数据
  const loadContractData = useCallback(async () => {
    // 每次加载合约数据时，同时也刷新链下数据
    fetchOffchainStatus();

//     console.log('🌐 当前网络 chainId:', chainId);
//     console.log('📍 使用的合约地址集:', chainId === 56 ? 'BSC主网' : '本地网络');

    if (!address) return;
    const readProvider = new ethers.JsonRpcProvider(readRpc);


    try {
      let tokenAddr = ethers.ZeroAddress;

      // BurnToken 合约
      if (CONTRACTS.burnToken && CONTRACTS.burnToken !== ethers.ZeroAddress) {
        const code = await readProvider.getCode(CONTRACTS.burnToken);
        if (code !== '0x') {
          const burnToken = new ethers.Contract(CONTRACTS.burnToken, BURN_TOKEN_ABI, readProvider);
          const [tAddr, rootInv, inviterAddr, burnedVal, totalBurned, invCount, minBurn] = await Promise.all([
            burnToken.token().catch(() => ethers.ZeroAddress),
            burnToken.rootInviter().catch(() => null),
            burnToken.inviterOf(address).catch(() => ethers.ZeroAddress),
            burnToken.burnedValueOf(address).catch(() => 0n),
            burnToken.totalBurnedValue().catch(() => 0n),
            burnToken.inviteeCount(address).catch(() => 0n),
            burnToken.minBurnValue().catch(() => 0n),
          ]);

          tokenAddr = tAddr;
          setTokenAddress(tAddr);
          setRootInviter(rootInv);
          setInviterOnchain(inviterAddr);
          setMyBurnedValue(burnedVal);
          setTotalBurnedValue(totalBurned);
          setInviteeCount(invCount);
          setMinBurnValue(minBurn);
        } else {
          // console.warn('BurnToken 合约不存在');
        }
      }

      // Token 合约
      if (tokenAddr && tokenAddr !== ethers.ZeroAddress) {
        // 使用 CONTRACTS.token 而不是 tokenAddr，或者确保它们一致
        const token = new ethers.Contract(tokenAddr, ERC20_ABI, readProvider);
        const [symbol, balance, allow] = await Promise.all([
          token.symbol().catch(() => 'TOKEN'),
          token.balanceOf(address).catch(() => 0n),
          token.allowance(address, CONTRACTS.burnToken).catch(() => 0n),
        ]);
        setTokenSymbol(symbol);
        setTokenBalance(balance);
        setAllowance(allow);
        
        // 调试日志，帮助排查授权问题
        // console.log('Token Info:', {
        //      address: tokenAddr,
        //      spender: CONTRACTS.burnToken,
        //      balance: ethers.formatEther(balance),
        //      allowance: ethers.formatEther(allow)
        // });
      }

      // BurnDividend 合约
      try {
        const burnDividend = new ethers.Contract(CONTRACTS.burnDividend, BURN_DIVIDEND_ABI, readProvider);
        const [unpaidBNB, unpaidToken] = await Promise.all([
          burnDividend.getUnpaidDividendBNB(address).catch(() => 0n),
          burnDividend.getUnpaidDividendToken(address).catch(() => 0n),
        ]);
        setBurnUnpaidBNB(unpaidBNB);
        setBurnUnpaidToken(unpaidToken);
      } catch (e) {
        // console.log('BurnDividend 合约调用失败:', e);
      }

      // NFTSubscription 合约
      try {
        // console.log('🔍 检查 NFTSubscription:', CONTRACTS.nftSubscription);
        if (CONTRACTS.nftSubscription && CONTRACTS.nftSubscription !== ethers.ZeroAddress) {
          const code = await readProvider.getCode(CONTRACTS.nftSubscription);
          // console.log('📝 NFTSubscription 合约代码长度:', code.length);
          if (code !== '0x') {
            const nftSubscription = new ethers.Contract(CONTRACTS.nftSubscription, NFT_SUBSCRIPTION_ABI, readProvider);
            const [price, twoLevel, team, rootInv, nftInviter] = await Promise.all([
              nftSubscription.pricePerShare().catch((e: Error) => { console.error('pricePerShare 错误:', e); return 0n; }),
              address ? nftSubscription.getTwoLevelSubscribed(address).catch((e: Error) => { console.error('getTwoLevelSubscribed 错误:', e); return 0n; }) : 0n,
              address ? nftSubscription.teamSubscribed(address).catch((e: Error) => { console.error('teamSubscribed 错误:', e); return 0n; }) : 0n,
              nftSubscription.rootInviter().catch(() => ''),
              address ? nftSubscription.inviterOf(address).catch(() => ethers.ZeroAddress) : ethers.ZeroAddress,
            ]);
            // console.log('💰 NFT 认购数据:', {
            //   price: ethers.formatEther(price),
            //   twoLevel: twoLevel.toString(),
            //   team: team.toString(),
            //   rootInv,
            //   nftInviter
            // });
            setNftSubPrice(price);
            setNftSubTwoLevel(twoLevel);
            setNftSubTeam(team);
            setNftSubRootInviter(rootInv);
            setNftInviterOnchain(nftInviter);
          } else {
            console.warn('⚠️ NFTSubscription 合约未部署');
          }
        } else {
          console.warn('⚠️ NFTSubscription 地址无效');
        }
      } catch (e) {
        console.error('❌ NFTSubscription 合约调用失败:', e);
      }

      // LossDividend 合约
      try {
        if (CONTRACTS.lossDividend && CONTRACTS.lossDividend !== ethers.ZeroAddress) {
          const lossDividend = new ethers.Contract(CONTRACTS.lossDividend, LOSS_DIVIDEND_ABI, readProvider);
          const [snapshot, cached, contractBalance, totalAllocated, totalClaimed] = await Promise.all([
            lossDividend.userSnapshots(address).catch(() => [0n, 0n, 0n]),
            lossDividend.getCachedLoss(address).catch(() => [0n, false]),
            readProvider.getBalance(CONTRACTS.lossDividend).catch(() => 0n),
            lossDividend.totalDividendsAllocated().catch(() => 0n),
            lossDividend.totalDividendsClaimed().catch(() => 0n),
          ]);
          
          setLossSnapshot({
            costBasis: snapshot[0] || 0n,
            soldValue: snapshot[1] || 0n,
            dividendReceived: snapshot[2] || 0n,
          });
          setCachedLoss({ loss: cached[0] || 0n, valid: cached[1] || false });
          
          // 计算未分配余额: (contractBalance + totalClaimed) - totalAllocated
          const totalReceived = BigInt(contractBalance) + BigInt(totalClaimed);
          const totalAllocatedBigInt = BigInt(totalAllocated);
          const availableBalance = totalReceived > totalAllocatedBigInt ? totalReceived - totalAllocatedBigInt : 0n;
          setLossContractBalance(availableBalance);

          // 计算待领取分红
          // 优先使用缓存的亏损值，如果缓存失效则尝试使用 offchain 数据
          let currentLoss = 0n;
          if (cached[1]) {
            currentLoss = cached[0];
          }
          
          if (currentLoss > 0n) {
            const pending = await lossDividend.getUnpaidDividend(address, currentLoss).catch(() => 0n);
            setLossPendingDividend(pending);
          } else {
            // 如果没有有效的亏损数据，待领取设为 0
            setLossPendingDividend(0n);
          }

          // 计算持有价值
          try {
            const poolAddr = await lossDividend.pool().catch(() => ethers.ZeroAddress);
            if (poolAddr && poolAddr !== ethers.ZeroAddress && tokenAddr && tokenAddr !== ethers.ZeroAddress) {
              const pair = new ethers.Contract(poolAddr, PAIR_ABI, readProvider);
              const [reserves, token0] = await Promise.all([
                pair.getReserves().catch(() => [0n, 0n]),
                pair.token0().catch(() => ethers.ZeroAddress),
              ]);
              if (token0 === ethers.ZeroAddress) throw new Error("Invalid pair");
              
              const isToken0 = token0.toLowerCase() === tokenAddr.toLowerCase();
              const tokenReserve = isToken0 ? reserves[0] : reserves[1];
              const bnbReserve = isToken0 ? reserves[1] : reserves[0];
              // 保存储备量供燃烧价值计算使用
              setTokenReserve(tokenReserve);
              setBnbReserve(bnbReserve);
              if (tokenReserve > 0n) {
                const price = (bnbReserve * BigInt(1e18)) / tokenReserve;
                const token = new ethers.Contract(tokenAddr, ERC20_ABI, readProvider);
                const bal = await token.balanceOf(address);
                setHoldingValue((bal * price) / BigInt(1e18));
              }
            }
          } catch (e) {
            // console.log('计算持有价值失败:', e);
          }
        } else {
          // 合约地址无效时，重置所有相关数据
           setLossSnapshot({
            costBasis: 0n,
            soldValue: 0n,
            dividendReceived: 0n,
          });
          setCachedLoss({ loss: 0n, valid: false });
          setLossContractBalance(0n);
          setLossPendingDividend(0n);
          // 不重置持有价值，因为可能会从 offchain 读取
        }
      } catch (e) {
         console.warn('LossDividend error:', e);
      }

      // NFTDividend 合约
      try {
        const nftDividend = new ethers.Contract(CONTRACTS.nftDividend, NFT_DIVIDEND_ABI, readProvider);
        const [userInfo, claimable] = await Promise.all([
          nftDividend.getUserInfo(address).catch(() => [0n, 0n, 0n, 0n]),
          nftDividend.getClaimableNFTCount(address).catch(() => 0n),
        ]);
        setNftUserInfo({
          performance: userInfo[0] || 0n,
          nftCount: userInfo[1] || 0n,
          pendingDividends: userInfo[3] || 0n,
        });
        setClaimableNfts(claimable);
      } catch (e) {
        // console.log('NFTDividend 合约调用失败:', e);
      }

    } catch (err) {
      console.error('加载合约数据失败:', err);
    }
  }, [address, fetchOffchainStatus, readRpc]);

  const offchainCostBasis = offchainStatus ? parseWeiString(offchainStatus.costBasis) : 0n;
  const offchainSoldValue = offchainStatus ? parseWeiString(offchainStatus.soldValue) : 0n;
  const offchainHoldingValue = offchainStatus ? parseWeiString(offchainStatus.currentHoldingValue) : 0n;
  const offchainLossAmount = offchainStatus ? parseWeiString(offchainStatus.lossAmount) : 0n;

  const effectiveCostBasis = offchainStatus ? offchainCostBasis : lossSnapshot.costBasis;
  const effectiveSoldValue = offchainStatus ? offchainSoldValue : lossSnapshot.soldValue;
  const effectiveHoldingValue = offchainStatus ? offchainHoldingValue : holdingValue;
  const effectiveLossAmount = offchainStatus ? offchainLossAmount : (cachedLoss.valid ? cachedLoss.loss : 0n);

  // 加载数据
  useEffect(() => {
    loadContractData();
    const interval = setInterval(loadContractData, 15000);
    return () => clearInterval(interval);
  }, [loadContractData]);

  // URL 参数处理
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && ref.startsWith('0x')) setInviter(ref);
  }, []);

  // 交易操作
  const parsedBurnAmount = useMemo(() => {
    try {
      return burnAmount ? ethers.parseEther(burnAmount) : 0n;
    } catch {
      return 0n;
    }
  }, [burnAmount]);
  
  const isApproveNeeded = useMemo(() => {
    // 只有当有燃烧金额，且授权额度小于燃烧金额时，才需要授权
    if (parsedBurnAmount <= 0n) return false;
    return allowance < parsedBurnAmount;
  }, [parsedBurnAmount, allowance]);

  // 计算燃烧价值（考虑滑点，使用 PancakeSwap getAmountOut 公式）
  const calculateBurnValue = useCallback((amountIn: bigint): bigint => {
    if (amountIn <= 0n || tokenReserve <= 0n || bnbReserve <= 0n) return 0n;
    try {
      // getAmountOut formula: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
      const amountInWithFee = amountIn * 997n;
      const numerator = amountInWithFee * bnbReserve;
      const denominator = tokenReserve * 1000n + amountInWithFee;
      return numerator / denominator;
    } catch {
      return 0n;
    }
  }, [tokenReserve, bnbReserve]);

  // 计算满足最小燃烧价值所需的 token 数量
  const calculateMinTokenAmount = useCallback((minValue: bigint): bigint => {
    if (minValue <= 0n || tokenReserve <= 0n || bnbReserve <= 0n) return 0n;
    try {
      // 反推公式: amountIn = (reserveIn * minValue) / ((reserveOut - minValue) * 997) * 1000
      // 为了安全，增加 1% 余量
      const numerator = tokenReserve * minValue * 1000n;
      const denominator = (bnbReserve - minValue) * 997n;
      const minAmount = numerator / denominator;
      return minAmount * 101n / 100n; // 增加 1% 余量
    } catch {
      return 0n;
    }
  }, [tokenReserve, bnbReserve]);

  // 检查燃烧金额是否满足最小价值
  const burnValueCheck = useMemo(() => {
    if (parsedBurnAmount <= 0n) return { isValid: false, message: '' };
    const burnValue = calculateBurnValue(parsedBurnAmount);
    if (burnValue < minBurnValue) {
      const minTokens = calculateMinTokenAmount(minBurnValue);
      return {
        isValid: false,
        message: `燃烧价值不足！当前 ${formatBNB(burnValue)} BNB < 最小要求 ${formatBNB(minBurnValue)} BNB\n最少需要燃烧 ${ethers.formatEther(minTokens).split('.')[0]} ${tokenSymbol}`
      };
    }
    return { isValid: true, message: '' };
  }, [parsedBurnAmount, minBurnValue, calculateBurnValue, calculateMinTokenAmount, tokenSymbol]);

  const handleApprove = async () => {
    if (!signer || !tokenAddress) return;
    setIsPending(true);
    setLastAction('approve');
    try {
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      const tx = await token.approve(CONTRACTS.burnToken, ethers.MaxUint256);
      await tx.wait();
      await loadContractData();
      // 授权完成后立即执行燃烧
      await handleBurn();
    } catch (err) {
      console.error('授权失败:', err);
      setIsPending(false);
      setLastAction(null);
    }
  };

  const handleBurn = async () => {
    if (!signer) return;
    
    // 双重检查授权状态
    if (tokenAddress) {
       try {
         const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
         // 实时获取最新授权额度，防止状态滞后
         const currentAllowance = await token.allowance(address, CONTRACTS.burnToken);
         if (currentAllowance < parsedBurnAmount) {
             // 如果确实授权不足，转为执行授权
             // console.log('检测到授权不足，自动转为授权流程', { current: currentAllowance, needed: parsedBurnAmount });
             handleApprove();
             return;
         }
       } catch (e) {
         console.error('Check allowance failed', e);
       }
    }

    setIsPending(true);
    setLastAction('burn');
    try {
      const inviterAddr = inviter && inviter.startsWith('0x')
        ? inviter
        : (inviterOnchain && inviterOnchain !== ethers.ZeroAddress)
          ? inviterOnchain
          : (rootInviter && rootInviter !== ethers.ZeroAddress)
            ? rootInviter
            : ethers.ZeroAddress;

      // console.log('执行燃烧交易:', {
      //   amount: parsedBurnAmount.toString(),
      //   inviter: inviterAddr,
      //   minBurn: minBurnValue.toString()
      // });

      const burnToken = new ethers.Contract(CONTRACTS.burnToken, BURN_TOKEN_ABI, signer);
      
      // 添加 gasLimit 估算，如果估算失败通常意味着交易会失败
      // 手动指定 gasLimit 可以有时绕过部分节点检查，但如果合约逻辑 revert 依然会挂
      // 这里我们更希望捕获错误
      const tx = await burnToken.burn(parsedBurnAmount, inviterAddr);
      await tx.wait();
      setBurnAmount('');
      await loadContractData();
    } catch (err: any) {
      console.error('燃烧失败:', err);
      // 解析 revert reason
      const msg = err?.reason || err?.message || JSON.stringify(err);
      if (msg.includes('BELOW_MIN_BURN_VALUE')) {
        alert(
          `燃烧失败：燃烧价值不足 ${ethers.formatEther(minBurnValue)} BNB。\n\n` +
          `原因：虽然您的账面持有价值显示高于此数值，但合约计算的是考虑【交易滑点】后的实际价值。\n` +
          `当前流动性深度下，一次性燃烧大量代币会导致估值大幅缩水，从而低于最小门槛。`
        );
      } else if (msg.includes('PancakeLibrary: INSUFFICIENT_INPUT_AMOUNT')) {
        alert('交易失败: 无法计算兑换价值。通常是因为流动性池资金不足，或输入金额相对于池子太小。');
      } else if (msg.includes('exceeds allowance')) {
         alert('交易失败: 授权额度不足，请等待授权生效或刷新重试。');
      } else {
         alert(`交易失败: ${msg.slice(0, 100)}... 请检查控制台`);
      }
    } finally {
      setIsPending(false);
      setLastAction(null);
    }
  };

  const handleClaimBurnBNB = async () => {
    if (!signer) return;
    setIsPending(true);
    setLastAction('claimBurnBNB');
    try {
      const burnDividend = new ethers.Contract(CONTRACTS.burnDividend, BURN_DIVIDEND_ABI, signer);
      const tx = await burnDividend.claimBNB();
      await tx.wait();
      await loadContractData();
    } catch (err) {
      console.error('领取失败:', err);
    } finally {
      setIsPending(false);
      setLastAction(null);
    }
  };

  const handleClaimBurnToken = async () => {
    if (!signer) return;
    setIsPending(true);
    setLastAction('claimBurnToken');
    try {
      const burnDividend = new ethers.Contract(CONTRACTS.burnDividend, BURN_DIVIDEND_ABI, signer);
      const tx = await burnDividend.claimToken();
      await tx.wait();
      await loadContractData();
    } catch (err) {
      console.error('领取失败:', err);
    } finally {
      setIsPending(false);
      setLastAction(null);
    }
  };

  const handleClaimLossDiv = async () => {
    if (!signer) return;
    setIsPending(true);
    setLastAction('claimLoss');
    try {
      const lossDividend = new ethers.Contract(CONTRACTS.lossDividend, LOSS_DIVIDEND_ABI, signer);
      const tx = await lossDividend.claim();
      await tx.wait();
      await loadContractData();
    } catch (err) {
      console.error('领取失败:', err);
    } finally {
      setIsPending(false);
      setLastAction(null);
    }
  };

  const handleClaimNftDiv = async () => {
    if (!signer) return;
    setIsPending(true);
    setLastAction('claimNft');
    try {
      const nftDividend = new ethers.Contract(CONTRACTS.nftDividend, NFT_DIVIDEND_ABI, signer);
      const tx = await nftDividend.claim();
      await tx.wait();
      await loadContractData();
    } catch (err) {
      console.error('领取失败:', err);
    } finally {
      setIsPending(false);
      setLastAction(null);
    }
  };

  const handleClaimNFT = async () => {
    if (!signer) return;
    setIsPending(true);
    setLastAction('claimNftMint');
    try {
      const nftDividend = new ethers.Contract(CONTRACTS.nftDividend, NFT_DIVIDEND_ABI, signer);
      const tx = await nftDividend.claimNFT();
      await tx.wait();
      await loadContractData();
    } catch (err) {
      console.error('领取失败:', err);
    } finally {
      setIsPending(false);
      setLastAction(null);
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}?ref=${address}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        alert(t.copy_success);
        return;
      }
    } catch (err) {
      console.warn('clipboard write failed, fallback to execCommand', err);
    }

    const input = document.createElement('input');
    input.value = url;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.top = '-1000px';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    input.setSelectionRange(0, input.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(input);
    if (ok) alert(t.copy_success);
    else alert('复制失败，请手动复制链接');
  };

  // Loading spinner component
  const Spinner = () => (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );

  const handleSubscribe = async () => {
    if (!isConnected) {
      open();
      return;
    }

    if (chainId !== 56) {
      try {
        await switchNetwork(bsc);
      } catch (e) {
        alert(lang === 'zh' ? '请切换至 BSC 网络' : 'Please switch to BSC network');
      }
      return;
    }
    
    if (!signer) return;
    if (!address) return;

    try {
      const provider = new ethers.JsonRpcProvider(readRpc);
      const balance = await provider.getBalance(address);
      if (balance < nftSubPrice) {
        alert(lang === 'zh' ? 'BNB 余额不足，无法支付认购费用' : 'Insufficient BNB balance');
        return;
      }
    } catch (e) {
      console.error('Check balance failed:', e);
    }

    setIsPending(true);
    setLastAction('subscribe');
    try {
      if (!CONTRACTS.nftSubscription || CONTRACTS.nftSubscription === ethers.ZeroAddress) {
        throw new Error("Subscription contract not configured");
      }
      const contract = new ethers.Contract(CONTRACTS.nftSubscription, NFT_SUBSCRIPTION_ABI, signer);
      
      // 确定邀请人地址，逻辑参考 BurnTokenWithReferral.sol
      let inviterAddress = ethers.ZeroAddress;
      
      // 1. 如果用户已有链上邀请人，使用已绑定的
      if (nftInviterOnchain && nftInviterOnchain !== ethers.ZeroAddress) {
        inviterAddress = nftInviterOnchain;
      } else {
        // 2. 优先使用用户手动输入的邀请人
        if (nftSubInviter && ethers.isAddress(nftSubInviter)) {
          inviterAddress = nftSubInviter;
        } 
        // 3. 其次使用 URL 参数中的邀请人
        else if (inviterFromUrl) {
          inviterAddress = inviterFromUrl;
        }
        // 4. 如果没有明确邀请人，尝试使用 RootInviter
        else if (nftSubRootInviter && ethers.isAddress(nftSubRootInviter)) {
           inviterAddress = nftSubRootInviter;
        }
        // 5. 都没有则使用零地址（如果合约不支持将会失败）
      }
      
      console.log('Subscribe with inviter:', inviterAddress);
      
      const tx = await contract.subscribe(1, inviterAddress, { value: nftSubPrice });
      await tx.wait();
      
      alert(lang === 'zh' ? '认购成功！' : 'Subscription Successful!');

      // Refresh data
      const [twoLevel, team] = await Promise.all([
         contract.getTwoLevelSubscribed(address),
         contract.teamSubscribed(address)
      ]);
      setNftSubTwoLevel(twoLevel);
      setNftSubTeam(team);

    } catch (e: any) {
      console.error('Subscribe failed:', e);
      // alert(e.reason || e.message || "Subscription failed");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-20">
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white shadow-sm z-50 h-16 flex items-center justify-center relative px-4 gap-3">
        {/* Network Switcher */}
        {isConnected && chainId !== 56 && (
          <button
            onClick={() => switchNetwork(bsc)}
            className="flex items-center gap-2 bg-red-100 text-red-600 px-3 py-1.5 rounded-full text-sm font-bold animate-pulse hover:bg-red-200 transition"
          >
            <span>Wrong Network</span>
            <span className="hidden sm:inline text-xs bg-white/50 px-2 py-0.5 rounded">Switch to BSC</span>
          </button>
        )}

        {/* Wallet Button - 使用 AppKit 自带的按钮 */}
        <div className="transform scale-90 sm:scale-100">
          <appkit-button />
        </div>
        
        {/* Lang Switcher */}
        <button 
          onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')}
          className="absolute right-4 flex items-center gap-1 text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full hover:bg-gray-200 transition"
        >
          <Globe className="w-4 h-4" />
          {t.switch_lang}
        </button>
      </header>

      {/* Spacer */}
      <div className="h-20" />

      <main className="max-w-lg mx-auto px-4 space-y-6">

        {/* NFT Subscription Module */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold border-l-4 border-purple-500 pl-3 mb-6">{t.nft_subscription}</h2>
          
          <div className="space-y-6">
            {/* Price Card */}
            <div className="flex flex-col items-center justify-center p-8 bg-purple-50 rounded-2xl border border-purple-100 text-center">
               <div className="text-purple-500 text-base font-medium mb-2">{t.subscription_price}</div>
               <div className="text-4xl font-extrabold text-purple-900 mb-2">{formatBNB(nftSubPrice)} <span className="text-xl font-bold text-purple-500">BNB</span></div>
               <div className="text-sm text-purple-400 font-light">{t.referral_desc_long}</div>
            </div>

            {/* Inviter Display or Input */}
            {nftInviterOnchain && nftInviterOnchain !== ethers.ZeroAddress ? (
              <div className="bg-purple-50 rounded-xl px-4 py-3 border border-purple-100">
                <div className="text-sm text-purple-600 font-medium mb-1">
                  {t.inviter_bound || '已绑定邀请人'}
                </div>
                <div className="text-xs text-gray-600 font-mono break-all">
                  {nftInviterOnchain}
                </div>
              </div>
            ) : inviterFromUrl ? (
              <div className="bg-purple-50 rounded-xl px-4 py-3 border border-purple-100">
                <div className="text-sm text-purple-600 font-medium mb-1">
                  {t.inviter_from_url || '已从邀请链接读取邀请人地址'}
                </div>
                <div className="text-xs text-gray-600 font-mono break-all">
                  {inviterFromUrl}
                </div>
              </div>
            ) : null}

            {/* Subscribe Button */}
            <button 
              onClick={handleSubscribe}
              disabled={isPending || !isConnected}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-lg py-4 rounded-xl shadow-lg shadow-purple-200 active:scale-[0.96] transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
            >
              {isPending && lastAction === 'subscribe' ? <Spinner /> : t.subscribe_now}
            </button>

            {/* Stats List */}
            <div className="bg-gray-50 rounded-xl px-5 py-4 space-y-4 border border-gray-100">
               <div className="flex items-center justify-between text-base">
                 <span className="text-gray-500">{t.two_level_subscribed}</span>
                 <span className="font-bold text-gray-900">{formatBNB(nftSubTwoLevel)} BNB</span>
               </div>
               <div className="h-px bg-gray-200/50 w-full"></div>
               <div className="flex items-center justify-between text-base">
                 <span className="text-gray-500">{t.team_subscribed_8}</span>
                 <span className="font-bold text-gray-900">{formatBNB(nftSubTeam)} BNB</span>
               </div>
            </div>
          </div>
        </section>
        
        {/* Floor Data Module */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-6">
          <h2 className="text-xl font-bold border-l-4 border-blue-500 pl-3">{t.floor_data}</h2>
          
          <div className="grid grid-cols-2 gap-y-6 gap-x-2">
            <div className="min-w-0">
              <div className="text-gray-500 text-sm mb-1">{t.my_floor_cost}</div>
              <div className="font-bold text-2xl truncate">{formatBNB(effectiveCostBasis)} <span className="text-sm font-normal text-gray-400">BNB</span></div>
            </div>
            <div className="min-w-0">
              <div className="text-gray-500 text-sm mb-1">{t.current_holding_value}</div>
              <div className="font-bold text-2xl truncate">{formatBNB(effectiveHoldingValue)} <span className="text-sm font-normal text-gray-400">BNB</span></div>
            </div>
            <div className="min-w-0">
              <div className="text-gray-500 text-sm mb-1">{t.sold_value}</div>
              <div className="font-bold text-2xl truncate">{formatBNB(effectiveSoldValue)} <span className="text-sm font-normal text-gray-400">BNB</span></div>
            </div>
            <div className="min-w-0">
              <div className="text-gray-500 text-sm mb-1">{t.dividend_bnb_value}</div>
              <div className="font-bold text-2xl truncate">{formatBNB(lossSnapshot.dividendReceived + lossPendingDividend)} <span className="text-sm font-normal text-gray-400">BNB</span></div>
            </div>
            <div className="min-w-0">
              <div className="text-gray-500 text-sm mb-1">{t.my_floor_amount}</div>
              <div className="font-bold text-2xl truncate">{formatBNB(effectiveLossAmount)} <span className="text-sm font-normal text-gray-400">BNB</span></div>
            </div>
            <div className="min-w-0">
              <div className="text-gray-500 text-sm mb-1">{t.dividend_reserve_bnb}</div>
              <div className="font-bold text-2xl truncate">{formatBNB(lossContractBalance)} <span className="text-sm font-normal text-gray-400">BNB</span></div>
            </div>
          </div>

          {/* Dividend Claim */}
          <div className="bg-blue-50 p-4 rounded-xl flex items-center justify-between mt-4">
            <div>
              <div className="text-sm text-blue-600 font-bold mb-1">{t.my_floor_dividend}</div>
              <div className="text-3xl font-bold text-blue-800">{formatBNB(lossPendingDividend)} <span className="text-sm font-normal">BNB</span></div>
            </div>
            <button 
              onClick={handleClaimLossDiv} 
              disabled={!isConnected || isPending || lossPendingDividend < 1000000000000000n} // 0.001 BNB
              className="bg-blue-600 text-white px-6 py-2 rounded-lg text-base font-bold shadow-md active:scale-95 disabled:opacity-50 hover:bg-blue-700 transition"
            >
              {isPending && lastAction === 'claimLoss' ? (
                <span className="inline-flex items-center gap-2"><Spinner /> {t.claiming}</span>
              ) : t.claim}
            </button>
          </div>
        </section>

        {/* Burn Data Module */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
          <h2 className="text-xl font-bold border-l-4 border-orange-500 pl-3">{t.burn_data}</h2>
          
          <div className="border-b border-gray-200 pb-4 space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{t.burn_amount}</span>
              <span 
                className="text-orange-500 font-semibold cursor-pointer active:opacity-70"
                onClick={() => {
                  if (tokenBalance) {
                    setBurnAmount(ethers.formatEther(tokenBalance).split('.')[0]);
                  }
                }}
              >{t.max}</span>
            </div>
            <input 
              type="number" 
              placeholder="0.0"
              value={burnAmount}
              min={0}
              inputMode="decimal"
              onChange={e => {
                const val = e.target.value;
                if (!val.startsWith('-')) setBurnAmount(val);
              }}
              className="bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 w-full text-2xl font-bold focus:ring-2 focus:ring-orange-500 outline-none" 
            />
            <div className="text-right text-sm text-gray-400">
              {t.holding_amount}: {tokenBalance ? ethers.formatEther(tokenBalance).split('.')[0] : '0'}
            </div>
          </div>

          <button 
            onClick={() => {
              if (burnAmount) {
                // 先检查燃烧价值是否满足最小要求
                if (!burnValueCheck.isValid) {
                  alert(burnValueCheck.message);
                  return;
                }
                if (isApproveNeeded) handleApprove();
                else handleBurn();
              }
            }}
            disabled={isPending || !isConnected || parsedBurnAmount <= 0n || tokenBalance === 0n}
            className="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white py-4 rounded-xl shadow-lg font-bold text-xl active:scale-[0.98] transition-all disabled:opacity-70"
          >
            {isPending
              ? (lastAction === 'approve' ? t.approving : lastAction === 'burn' ? t.burning : t.start_burning)
              : (isApproveNeeded ? t.approve : t.start_burning)
            }
          </button>
          
          {/* Burn Dividend Rows */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-xl border border-orange-100">
              <div>
                <div className="text-sm text-orange-800 opacity-70 mb-1">{t.burn_dividend_bnb}</div>
                <div className="font-bold text-xl text-orange-900">{formatBNB(burnUnpaidBNB)}</div>
              </div>
              <button 
                onClick={handleClaimBurnBNB} 
                disabled={isPending || !isConnected || burnUnpaidBNB <= 0n} 
                className="border-2 border-orange-500 text-orange-600 px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-orange-100 transition disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                {isPending && lastAction === 'claimBurnBNB' ? <span className="inline-flex items-center gap-2"><Spinner /> {t.claiming}</span> : t.claim}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-xl border border-orange-100">
              <div>
                <div className="text-sm text-orange-800 opacity-70 mb-1">{t.burn_dividend_floor}</div>
                <div className="font-bold text-xl text-orange-900">{formatBNB(burnUnpaidToken)}</div>
              </div>
              <button 
                onClick={handleClaimBurnToken} 
                disabled={isPending || !isConnected || burnUnpaidToken <= 0n} 
                className="border-2 border-orange-500 text-orange-600 px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-orange-100 transition disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                {isPending && lastAction === 'claimBurnToken' ? <span className="inline-flex items-center gap-2"><Spinner /> {t.claiming}</span> : t.claim}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-500 mb-1">{t.my_burned_value}</div>
              <div className="font-bold text-xl">{formatBNB(myBurnedValue)} <span className="text-xs text-gray-400 font-normal">BNB</span></div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-500 mb-1">{t.network_burned_value}</div>
              <div className="font-bold text-xl">{formatBNB(totalBurnedValue, 2)} <span className="text-xs text-gray-400 font-normal">BNB</span></div>
            </div>
          </div>
        </section>

        {/* Team Data Module */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-6">
          <h2 className="text-xl font-bold border-l-4 border-purple-500 pl-3">{t.team_data}</h2>
          
          <div className="bg-purple-50 p-5 rounded-xl text-center">
            <div className="text-base text-purple-700 font-medium">{t.direct_burn_value}</div>
            <div className="text-3xl font-bold text-purple-900 mt-2">{formatBNB(nftUserInfo.performance)} <span className="text-base font-normal">BNB</span></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm text-gray-500 mb-1">
                <span>{t.claimable_nft}</span>
                <button 
                  onClick={handleClaimNFT} 
                  disabled={!isConnected || isPending || claimableNfts === 0n}
                  className="text-purple-600 font-bold border border-purple-200 px-2 rounded text-xs h-6 flex items-center disabled:opacity-50 enabled:hover:bg-purple-50 transition"
                >
                  {isPending && lastAction === 'claimNftMint' ? <Spinner /> : t.claim}
                </button>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg text-center text-2xl font-bold text-gray-700">
                {claimableNfts.toString()} <span className="text-sm font-normal text-gray-400">个</span>
              </div>
              <div className="text-sm text-gray-400 mt-2">{t.my_nft}: {nftUserInfo.nftCount.toString()} 个</div>
            </div>

            <div className="bg-purple-50 rounded-xl p-4 flex flex-col justify-between space-y-2">
              <div className="text-sm text-purple-700 font-medium">{t.nft_dividend_bnb}</div>
              <div className="text-2xl font-bold text-purple-900 my-1">{formatBNB(nftUserInfo.pendingDividends)}</div>
              <button 
                onClick={handleClaimNftDiv} 
                disabled={!isConnected || isPending} 
                className="w-full bg-white text-purple-600 text-sm py-2 rounded-lg shadow-sm font-bold border border-purple-100 disabled:opacity-50 hover:bg-purple-50 transition"
              >
                {isPending && lastAction === 'claimNft' ? <span className="inline-flex items-center justify-center gap-2"><Spinner /> {t.claiming}</span> : t.claim}
              </button>
            </div>
          </div>

          {/* 退出销毁按钮 */}
          <button 
            disabled={true}
            className="w-full bg-gray-100 text-gray-400 text-sm py-3 rounded-xl font-medium border border-gray-200 cursor-not-allowed"
          >
            {t.exit_burn || '退出销毁'}
          </button>
        </section>

        {/* Referral Info */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
          <h2 className="text-xl font-bold border-l-4 border-green-500 pl-3">{t.referral_rewards}</h2>
          <p className="text-gray-500 text-sm">{t.referral_desc}</p>
          
          <div className="space-y-3">
            <div className="text-sm text-gray-500">{t.invite_link}</div>
            <div className="flex gap-2">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm truncate font-mono text-gray-600 flex items-center">
                {address ? `${window.location.origin}?ref=${address}` : 'Connect Wallet to see link'}
              </div>
              <button 
                onClick={copyLink}
                disabled={!isConnected}
                className="bg-green-500 text-white px-5 py-2 rounded-lg text-base font-bold shadow-green-200 shadow-md flex items-center gap-1 active:scale-95 hover:bg-green-600 transition"
              >
                <Copy className="w-5 h-5" />
                {t.copy}
              </button>
            </div>
          </div>
          
          <div className="text-base font-medium text-gray-600">
            {t.invited_count}: <span className="text-green-600 text-2xl font-bold ml-2">{inviteeCount.toString()}</span>
          </div>
        </section>
        
        {/* Footer */}
        <footer className="pt-4 pb-2">
          <div className="max-w-xl mx-auto bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 text-gray-700 text-base font-semibold mb-6">
              <Globe className="w-5 h-5 text-gray-500" />
              {t.contact_us}
            </div>
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">TG群组</span>
                <a className="text-gray-700 hover:underline" href="https://t.me/UTl2026" target="_blank" rel="noreferrer">https://t.me/UTl2026</a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">官方推特</span>
                <a className="text-gray-700 hover:underline" href="https://x.com/utlbnb?s=11" target="_blank" rel="noreferrer">https://x.com/utlbnb</a>
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-400 text-center mt-4">© 2026 FLAP BURN.</p>
        </footer>

      </main>
    </div>
  );
}

export default App;

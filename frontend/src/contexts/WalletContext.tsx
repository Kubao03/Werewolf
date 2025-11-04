'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ethers } from 'ethers';

interface WalletContextType {
  provider: ethers.BrowserProvider | null;
  account: string;
  chainId: number | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnected: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [account, setAccount] = useState<string>('');
  const [chainId, setChainId] = useState<number | null>(null);

  // Initialize provider
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      setProvider(new ethers.BrowserProvider((window as any).ethereum));
    }
  }, []);

  // Listen to account and chain changes
  useEffect(() => {
    const eth = (typeof window !== 'undefined' && (window as any).ethereum) || null;
    if (!eth) return;

    const onAcc = (accs: string[]) => setAccount(accs?.[0] || '');
    const onChain = () => {
      if (!provider) return;
      provider.getNetwork().then((n) => setChainId(Number(n.chainId)));
    };

    eth.on?.('accountsChanged', onAcc);
    eth.on?.('chainChanged', onChain);

    return () => {
      eth.removeListener?.('accountsChanged', onAcc);
      eth.removeListener?.('chainChanged', onChain);
    };
  }, [provider]);

  const connect = async () => {
    try {
      if (!provider) throw new Error('Please install/enable MetaMask');
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      setAccount(await signer.getAddress());
      const net = await provider.getNetwork();
      setChainId(Number(net.chainId));
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  };

  const disconnect = () => {
    setAccount('');
    setChainId(null);
  };

  const value: WalletContextType = {
    provider,
    account,
    chainId,
    connect,
    disconnect,
    isConnected: !!account,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}


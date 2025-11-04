'use client';

import React from 'react';
import Link from 'next/link';
import { useWallet } from '@/contexts/WalletContext';

export default function HomePage() {
  const { account, chainId, connect, isConnected } = useWallet();
  const [error, setError] = React.useState<string>('');
  const container: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '24px',
  };

  const card: React.CSSProperties = {
    background: 'white',
    borderRadius: '24px',
    padding: '48px',
    maxWidth: '600px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
  };

  const title: React.CSSProperties = {
    fontSize: '48px',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '16px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };

  const subtitle: React.CSSProperties = {
    fontSize: '18px',
    textAlign: 'center',
    color: '#666',
    marginBottom: '48px',
  };

  const buttonContainer: React.CSSProperties = {
    display: 'grid',
    gap: '20px',
    gridTemplateColumns: '1fr 1fr',
    marginTop: '24px',
  };

  const button: React.CSSProperties = {
    padding: '24px 32px',
    borderRadius: '16px',
    border: '2px solid #eee',
    background: 'white',
    cursor: 'pointer',
    transition: 'all 0.3s',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  };

  const buttonIcon: React.CSSProperties = {
    fontSize: '48px',
  };

  const buttonTitle: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: '600',
    color: '#333',
  };

  const buttonDesc: React.CSSProperties = {
    fontSize: '14px',
    color: '#666',
    textAlign: 'center',
  };

  const footer: React.CSSProperties = {
    marginTop: '32px',
    textAlign: 'center',
    fontSize: '14px',
    color: '#999',
  };

  const connectBtn: React.CSSProperties = {
    padding: '16px 48px',
    borderRadius: '16px',
    border: 'none',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    fontSize: '18px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s',
  };

  const walletInfo: React.CSSProperties = {
    marginTop: '8px',
    padding: '16px',
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '12px',
    fontSize: '14px',
  };

  const errorBox: React.CSSProperties = {
    marginTop: '16px',
    padding: '12px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '12px',
    fontSize: '14px',
    color: '#7f1d1d',
  };

  const handleConnect = async () => {
    try {
      setError('');
      await connect();
    } catch (e: any) {
      setError(e.message || 'Failed to connect wallet');
    }
  };

  return (
    <main style={container}>
      <div style={card}>
        <h1 style={title}>🐺 Werewolf Game</h1>
        <p style={subtitle}>Blockchain-based Social Deduction Game</p>

        {!isConnected ? (
          <>
            <div style={{ textAlign: 'center', margin: '32px 0' }}>
              <p style={{ fontSize: '16px', color: '#666', marginBottom: '24px' }}>
                Connect your wallet to get started
              </p>
              <button onClick={handleConnect} style={connectBtn} className="hover-scale">
                🦊 Connect MetaMask
              </button>
            </div>
            {error && <div style={errorBox}>{error}</div>}
          </>
        ) : (
          <>
            <div style={walletInfo}>
              <div style={{ fontWeight: '600', marginBottom: '8px' }}>✅ Wallet Connected</div>
              <div style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                Address: {account.slice(0, 10)}...{account.slice(-8)}
              </div>
              {chainId && (
                <div style={{ fontSize: '13px', marginTop: '4px' }}>Chain ID: {chainId}</div>
              )}
            </div>

            <div style={buttonContainer}>
              <Link href="/host" style={button} className="hover-scale">
                <div style={buttonIcon}>🎮</div>
                <div style={buttonTitle}>Host</div>
                <div style={buttonDesc}>Create and manage games</div>
              </Link>

              <Link href="/player" style={button} className="hover-scale">
                <div style={buttonIcon}>👤</div>
                <div style={buttonTitle}>Player</div>
                <div style={buttonDesc}>Join and play games</div>
              </Link>
            </div>
          </>
        )}

        <div style={footer}>
          Built on Ethereum · Powered by Smart Contracts
        </div>
      </div>

      <style jsx global>{`
        .hover-scale {
          transition: all 0.3s ease;
        }
        .hover-scale:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
          border-color: #667eea;
        }
      `}</style>
    </main>
  );
}

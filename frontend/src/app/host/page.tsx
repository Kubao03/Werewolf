'use client';

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import Link from 'next/link';
import { useWallet } from '@/contexts/WalletContext';
import { FACTORY_ABI, GAME_ABI } from '@/lib/gameAbi';
import GameHeader from '@/components/GameHeader';
import PlayerList from '@/components/PlayerList';
import HostControl from '@/components/HostControl';
import VoteTally from '@/components/VoteTally';

// Helper functions for localStorage
const getSavedGameKey = (account: string) => `werewolf_host_game_${account.toLowerCase()}`;
const saveGameAddress = (account: string, gameAddress: string) => {
  if (account && ethers.isAddress(gameAddress)) {
    localStorage.setItem(getSavedGameKey(account), gameAddress);
  }
};
const loadGameAddress = (account: string): string | null => {
  if (!account) return null;
  const saved = localStorage.getItem(getSavedGameKey(account));
  return saved && ethers.isAddress(saved) ? saved : null;
};

export default function HostPage() {
  const { provider, account, chainId, isConnected } = useWallet();

  const [factoryAddress, setFactoryAddress] = useState<string>('0xB2061AED53426B9e8C620111AF9b870BA0403D0A');
  const [gameAddress, setGameAddress] = useState<string>('');
  const [manualGameAddress, setManualGameAddress] = useState<string>('');

  // Game configuration
  const [minPlayers, setMinPlayers] = useState('3');
  const [maxPlayers, setMaxPlayers] = useState('5');
  const [wolves, setWolves] = useState('1');
  const [stake, setStake] = useState('0');
  const [tSetup, setTSetup] = useState('1');
  const [tNightCommit, setTNightCommit] = useState('1');
  const [tNightReveal, setTNightReveal] = useState('1');
  const [tDayVote, setTDayVote] = useState('1');

  const [message, setMessage] = useState<string>('');
  const [msgType, setMsgType] = useState<'ok' | 'err' | 'muted' | ''>('');
  const [showRoles, setShowRoles] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const toast = (s: string, t: 'ok' | 'err' | 'muted' | '' = '') => {
    setMessage(s);
    setMsgType(t);
  };

  const createGame = async () => {
    try {
      if (!provider) throw new Error('Please connect wallet');
      if (!ethers.isAddress(factoryAddress))
        throw new Error('Please enter a valid Factory contract address');

      const signer = await provider.getSigner();
      const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, signer);

      const cfg = {
        minPlayers: parseInt(minPlayers),
        maxPlayers: parseInt(maxPlayers),
        wolves: parseInt(wolves),
        stake: ethers.parseEther(stake),
        tSetup: parseInt(tSetup),
        tNightCommit: parseInt(tNightCommit),
        tNightReveal: parseInt(tNightReveal),
        tDayVote: parseInt(tDayVote),
      };

      toast('Creating game...', 'muted');
      const tx = await factory.createGame(cfg);
      const receipt = await tx.wait();

      // Parse GameCreated event
      const event = receipt.logs
        .map((log: any) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e: any) => e?.name === 'GameCreated');

      if (event) {
        const newGameAddress = event.args.game;
        setGameAddress(newGameAddress);
        // Save to localStorage
        if (account) {
          saveGameAddress(account, newGameAddress);
        }
        toast(`Game created at: ${newGameAddress}`, 'ok');
      } else {
        toast('Game created, but could not find address in events', 'err');
      }
    } catch (e: any) {
      toast(e.message || String(e), 'err');
    }
  };

  // Auto-load functionality removed - user must manually restore game via "Restore Previous Game" button

  // Verify if account is the host of a game and load it
  const verifyAndLoadGame = async (gameAddr: string) => {
    if (!provider || !account || !ethers.isAddress(gameAddr)) return;
    
    try {
      const game = new ethers.Contract(gameAddr, GAME_ABI, provider);
      const host = await game.host();
      
      if (host.toLowerCase() === account.toLowerCase()) {
        setGameAddress(gameAddr);
        toast('Restored previous game', 'ok');
      } else {
        // Not the host, clear saved address
        localStorage.removeItem(getSavedGameKey(account));
        toast('Saved game is not hosted by this account', 'muted');
      }
    } catch (e) {
      // Game might not exist or invalid, clear saved address
      localStorage.removeItem(getSavedGameKey(account));
    }
  };

  // Manual restore game
  const restoreGame = async () => {
    if (!manualGameAddress || !ethers.isAddress(manualGameAddress)) {
      toast('Please enter a valid game address', 'err');
      return;
    }
    await verifyAndLoadGame(manualGameAddress);
  };

  const card: React.CSSProperties = {
    border: '1px solid #eee',
    borderRadius: 16,
    padding: 16,
    background: '#fafafa',
  };

  const btn: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid #ddd',
    background: '#fff',
    cursor: 'pointer',
  };

  const btnPrimary: React.CSSProperties = {
    ...btn,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    fontWeight: 600,
  };

  const input: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid #e3e3e8',
    width: '100%',
  };

  const label: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
  };

  const gridTwo: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  };

  return (
    <main style={{ minHeight: '100dvh', background: '#f9fafb' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>🎮 Werewolf Game — Host Dashboard</h1>
          <Link href="/" style={{ ...btn, textDecoration: 'none' }}>
            ← Home
          </Link>
        </div>

        {!isConnected ? (
          <div style={{ ...card, background: '#fef2f2', border: '1px solid #fecaca' }}>
            <div style={{ fontSize: 14, color: '#7f1d1d' }}>
              ⚠️ Wallet not connected. Please <Link href="/" style={{ color: '#667eea', fontWeight: 600 }}>return to homepage</Link> and connect your wallet first.
            </div>
          </div>
        ) : (
          <div style={{ ...card, background: '#f0fdf4', border: '1px solid #86efac' }}>
            <div style={{ fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>✅ Connected:</span>{' '}
              <span style={{ fontFamily: 'monospace' }}>{account.slice(0, 10)}...{account.slice(-8)}</span>
              {chainId !== null && <span style={{ marginLeft: 12, color: '#666' }}>Chain ID: {chainId}</span>}
            </div>
          </div>
        )}

        {!gameAddress ? (
          <>
            {/* Restore Previous Game */}
            <div style={card}>
              <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 16 }}>
                Restore Previous Game
              </div>
              <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>
                Enter a game address to restore management of a game you previously created.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  placeholder="0x... Game contract address"
                  value={manualGameAddress}
                  onChange={(e) => setManualGameAddress(e.target.value.trim())}
                  style={input}
                />
                <button onClick={restoreGame} style={btnPrimary}>
                  Restore Game
                </button>
              </div>
            </div>

            {/* Create New Game */}
            <div style={card}>
              <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 16 }}>
                Create New Game
              </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={label}>WerewolfFactory Contract Address</label>
                <input
                  placeholder="0x... Factory address"
                  value={factoryAddress}
                  onChange={(e) => setFactoryAddress(e.target.value.trim())}
                  style={input}
                />
              </div>

              <div style={gridTwo}>
                <div>
                  <label style={label}>Min Players</label>
                  <input
                    type="number"
                    value={minPlayers}
                    onChange={(e) => setMinPlayers(e.target.value)}
                    style={input}
                  />
                </div>
                <div>
                  <label style={label}>Max Players</label>
                  <input
                    type="number"
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(e.target.value)}
                    style={input}
                  />
                </div>
              </div>

              <div style={gridTwo}>
                <div>
                  <label style={label}>Wolves</label>
                  <input
                    type="number"
                    value={wolves}
                    onChange={(e) => setWolves(e.target.value)}
                    style={input}
                  />
                </div>
                <div>
                  <label style={label}>Stake (ETH)</label>
                  <input
                    type="text"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    style={input}
                  />
                </div>
              </div>

              {/* Advanced Settings Toggle */}
              <button
                type="button"
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                style={{
                  ...btn,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  marginTop: '8px',
                  background: '#f5f5f5',
                  border: '1px solid #e0e0e0',
                }}
              >
                <span style={{ fontWeight: 600 }}>Time Limits (seconds)</span>
                <span
                  style={{
                    transform: showAdvancedSettings ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s',
                    fontSize: '18px',
                  }}
                >
                  ▼
                </span>
              </button>

              {/* Advanced Settings (Collapsible) */}
              <div
                style={{
                  maxHeight: showAdvancedSettings ? '500px' : '0',
                  overflow: 'hidden',
                  transition: 'max-height 0.3s ease-out, opacity 0.3s ease-out',
                  opacity: showAdvancedSettings ? 1 : 0,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gap: 16,
                    marginTop: 16,
                  }}
                >
                  <div style={gridTwo}>
                    <div>
                      <label style={label}>Setup Time</label>
                      <input
                        type="number"
                        value={tSetup}
                        onChange={(e) => setTSetup(e.target.value)}
                        style={input}
                      />
                    </div>
                    <div>
                      <label style={label}>Night Commit</label>
                      <input
                        type="number"
                        value={tNightCommit}
                        onChange={(e) => setTNightCommit(e.target.value)}
                        style={input}
                      />
                    </div>
                  </div>

                  <div style={gridTwo}>
                    <div>
                      <label style={label}>Night Reveal</label>
                      <input
                        type="number"
                        value={tNightReveal}
                        onChange={(e) => setTNightReveal(e.target.value)}
                        style={input}
                      />
                    </div>
                    <div>
                      <label style={label}>Day Vote</label>
                      <input
                        type="number"
                        value={tDayVote}
                        onChange={(e) => setTDayVote(e.target.value)}
                        style={input}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button onClick={createGame} style={btnPrimary}>
                Create Game
              </button>
            </div>
            </div>
          </>
        ) : (
          <>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                    Game Contract Address
                  </div>
                  <div
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      fontSize: 16,
                      fontWeight: 600,
                    }}
                  >
                    {gameAddress}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(gameAddress);
                      toast('Address copied!', 'ok');
                    }}
                    style={btn}
                  >
                    Copy Address
                  </button>
                  <button
                    onClick={() => {
                      setGameAddress('');
                      setManualGameAddress('');
                    }}
                    style={btn}
                  >
                    Create New Game
                  </button>
                </div>
              </div>
            </div>

            <GameHeader gameAddress={gameAddress} />

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
              <div>
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showRoles}
                      onChange={(e) => setShowRoles(e.target.checked)}
                    />
                    <span style={{ fontSize: 14 }}>Show Roles (Host view)</span>
                  </label>
                </div>
                <PlayerList
                  gameAddress={gameAddress}
                  provider={provider}
                  showRoles={showRoles}
                />
                <VoteTally gameAddress={gameAddress} provider={provider} />
              </div>

              <HostControl gameAddress={gameAddress} provider={provider} onMessage={toast} />
            </div>
          </>
        )}

        {message && (
          <div
            style={{
              border: '1px solid',
              borderColor: msgType === 'ok' ? '#B7F7D0' : msgType === 'err' ? '#FECACA' : '#e5e7eb',
              background: msgType === 'ok' ? '#ECFDF5' : msgType === 'err' ? '#FEF2F2' : '#fff',
              color: msgType === 'ok' ? '#065F46' : msgType === 'err' ? '#7F1D1D' : '#333',
              borderRadius: 16,
              padding: 12,
              fontSize: 14,
            }}
          >
            {message}
          </div>
        )}
      </div>
    </main>
  );
}


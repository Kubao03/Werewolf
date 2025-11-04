'use client';

import React, { useEffect } from 'react';
import { ethers } from 'ethers';
import Link from 'next/link';
import { useWallet } from '@/contexts/WalletContext';
import GameHeader from '@/components/GameHeader';
import PlayerNight from '@/components/PlayerNight';
import PlayerDay from '@/components/PlayerDay';
import PlayerHunter from '@/components/PlayerHunter';
import PlayerEnd from '@/components/PlayerEnd';
import { GAME_ABI, PHASE_NAMES, ROLE_NAMES } from '@/lib/gameAbi';

// Helper functions for localStorage
const getSavedGameKey = (account: string) => `werewolf_player_game_${account.toLowerCase()}`;
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

export default function PlayerPage() {
  const { provider, account, chainId, isConnected } = useWallet();
  const [gameAddress, setGameAddress] = React.useState<string>('');
  const [hasJoined, setHasJoined] = React.useState<boolean>(false);
  const [phase, setPhase] = React.useState<number>(0);
  const [host, setHost] = React.useState<string>('');
  const [yourSeat1B, setYourSeat1B] = React.useState<number>(0);

  const [message, setMessage] = React.useState<string>('');
  const [msgType, setMsgType] = React.useState<'ok' | 'err' | 'muted' | ''>('');

  const toast = (s: string, t: 'ok' | 'err' | 'muted' | '' = '') => {
    setMessage(s); setMsgType(t);
  };

  const loadOnce = async () => {
    try {
      if (!provider) throw new Error('Please connect wallet first');
      if (!ethers.isAddress(gameAddress)) throw new Error('Please enter a valid WerewolfGame address');
      const game = new ethers.Contract(gameAddress, GAME_ABI, provider);
      const [p, h] = await Promise.all([game.phase(), game.host()]);
      setPhase(Number(p));
      setHost(String(h));
      if (account) {
        const seat1 = Number(await game.seatOf(account));
        setYourSeat1B(seat1);
      }
      toast('Game info loaded.', 'ok');
    } catch (e: any) { toast(e.message || String(e), 'err'); }
  };

  React.useEffect(() => {
    if (!provider || !ethers.isAddress(gameAddress)) return;
    let timer: any;
    const loop = async () => {
      try {
        const game = new ethers.Contract(gameAddress, GAME_ABI, provider);
        const [p, h] = await Promise.all([game.phase(), game.host()]);
        setPhase(Number(p));
        setHost(String(h));
        if (account) {
          const seat1 = Number(await game.seatOf(account));
          setYourSeat1B(seat1);
        } else {
          setYourSeat1B(0);
        }
      } catch { /* ignore */ }
      timer = setTimeout(loop, 3000);
    };
    loop();
    return () => clearTimeout(timer);
  }, [provider, gameAddress, account]);

  const join = async () => {
    try {
      if (!provider) throw new Error('Please connect wallet');
      if (!ethers.isAddress(gameAddress)) throw new Error('Please enter a valid WerewolfGame address');

      const signer = await provider.getSigner();
      const me = await signer.getAddress();
      const gameRO = new ethers.Contract(gameAddress, GAME_ABI, provider);

      const [p, h, seat1, cfg] = await Promise.all([
        gameRO.phase(),
        gameRO.host(),
        gameRO.seatOf(me),
        gameRO.cfg(),
      ]);

      // Check if already joined this game
      if (Number(seat1) > 0) {
        // Already joined, just load the game
        toast('Rejoining game...', 'muted');
        setHasJoined(true);
        await loadOnce();
        return;
      }

      // Check if can join (new player)
      if (Number(p) !== 0) throw new Error('Not in Lobby phase, cannot join');
      if (String(h).toLowerCase() === me.toLowerCase()) throw new Error('Host cannot join the game');

      const game = new ethers.Contract(gameAddress, GAME_ABI, signer);
      const stake: bigint = BigInt(cfg.stake);
      toast('Sending join transaction...');
      const tx = await game.join({ value: stake });
      await tx.wait();

      toast('Joined successfully!', 'ok');
      // Save to localStorage
      if (account) {
        saveGameAddress(account, gameAddress);
      }
      setHasJoined(true);
      await loadOnce();
    } catch (e: any) { toast(e.message || String(e), 'err'); }
  };

  // Verify if account has joined a game and load it
  const verifyAndLoadGame = React.useCallback(async (gameAddr: string) => {
    if (!provider || !account || !ethers.isAddress(gameAddr)) return;
    
    try {
      const game = new ethers.Contract(gameAddr, GAME_ABI, provider);
      const seat1 = Number(await game.seatOf(account));
      
      if (seat1 > 0) {
        // Player has joined this game
        setGameAddress(gameAddr);
        setHasJoined(true);
        toast('Restored previous game', 'ok');
      } else {
        // Not joined, clear saved address
        localStorage.removeItem(getSavedGameKey(account));
        toast('Saved game: You have not joined this game', 'muted');
      }
    } catch (e) {
      // Game might not exist or invalid, clear saved address
      localStorage.removeItem(getSavedGameKey(account));
    }
  }, [provider, account]);

  // Auto-load saved game address when account is available
  useEffect(() => {
    if (account && !gameAddress && provider) {
      const saved = loadGameAddress(account);
      if (saved) {
        // Verify if this account has joined the saved game
        verifyAndLoadGame(saved);
      }
    }
  }, [account, gameAddress, provider, verifyAndLoadGame]);

  const viewMyRole = async () => {
    try {
      if (!provider) throw new Error('Please connect wallet');
      if (!account) throw new Error('No account connected');
      if (!ethers.isAddress(gameAddress)) throw new Error('Please enter a valid WerewolfGame address');

      const signer = await provider.getSigner();
      const game = new ethers.Contract(gameAddress, GAME_ABI, signer);
      const me = await signer.getAddress();

      const seat1: number = Number(await game.seatOf(me));
      if (seat1 === 0) {
        toast('You have not joined the game yet (no seat)', 'err');
        return;
      }

      const [phaseRaw, dayRaw] = await Promise.all([game.phase(), game.dayCount()]);
      const phaseNum = Number(phaseRaw);
      const dayNum = Number(dayRaw as bigint);
      if (phaseNum < 2 || dayNum === 0) {
        toast('Roles not assigned yet. Please wait for host to assign roles.', 'muted');
        return;
      }

      const r: number = await game.roleOf(me);
      toast(`Your role: ${ROLE_NAMES[r as 0|1|2|3|4] ?? `Unknown(${r})`}`, 'ok');
    } catch (e: any) { toast(e.message || String(e), 'err'); }
  };

  const card: React.CSSProperties = { border: '1px solid #eee', borderRadius: 16, padding: 16, background: '#fafafa' };
  const btn: React.CSSProperties = { padding: '10px 14px', borderRadius: 12, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' };
  const btnDisabled: React.CSSProperties = { ...btn, opacity: 0.6, cursor: 'not-allowed' };
  const btnPrimary: React.CSSProperties = { ...btn, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', fontWeight: 600 };
  const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' };
  const input: React.CSSProperties = { padding: '10px 12px', borderRadius: 12, border: '1px solid #e3e3e8', width: '100%' };
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 4 };

  const canAct = provider && ethers.isAddress(gameAddress);
  const isLobby = phase === 0;
  const isHost = account && host && account.toLowerCase() === host.toLowerCase();
  const alreadyJoined = yourSeat1B > 0;
  // Allow joining if address is valid and wallet is connected - validation happens in join() function
  const canJoin = Boolean(canAct);

  return (
    <main style={{ minHeight: '100dvh', background: '#f9fafb' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>🐺 Werewolf Game — Player Dashboard</h1>
          <Link href="/" style={{ ...btn, textDecoration: 'none' }}>← Home</Link>
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

        {!hasJoined ? (
          <div style={card}>
            <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 16 }}>Join Game</div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>
              Enter the game contract address to join a new game or rejoin an existing one.
            </div>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <input
                  type="text"
                  placeholder="0x... contract address"
                  value={gameAddress}
                  onChange={(e) => setGameAddress(e.target.value.trim())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault(); // Prevent form submission or auto-trigger
                    }
                  }}
                  autoComplete="off"
                  autoFocus={false}
                  style={input}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={loadOnce} style={btn}>Load Config</button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (canJoin) {
                      join();
                    }
                  }}
                  style={canJoin ? btn : btnDisabled}
                  disabled={!canJoin}
                  title={
                    !canAct ? 'Please enter valid address and connect wallet' : 'Click to join or rejoin the game'
                  }
                >
                  Join/Rejoin Game
                </button>
                <button type="button" onClick={viewMyRole} style={canAct ? btn : btnDisabled} disabled={!canAct}>View My Role</button>
                {account && loadGameAddress(account) && (
                  <button
                    type="button"
                    onClick={() => {
                      const saved = loadGameAddress(account);
                      if (saved) {
                        setGameAddress(saved);
                        verifyAndLoadGame(saved);
                      }
                    }}
                    style={btnPrimary}
                  >
                    Restore Previous Game
                  </button>
                )}
              </div>
              {host && (
                <div style={{ fontSize: 13, color: '#666', paddingTop: 8, borderTop: '1px solid #eee' }}>
                  Game Host: <span style={mono}>{host.slice(0, 10)}...{host.slice(-8)}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Game Info Card */}
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
                      setHasJoined(false);
                    }}
                    style={btn}
                  >
                    Join New Game
                  </button>
                </div>
              </div>
            </div>

            <GameHeader gameAddress={gameAddress} />

            {phase === 0 && (
              <div style={card}>
                Current phase: <b>{PHASE_NAMES[phase]}</b>. Non-host players can join. Waiting for host to start and assign roles.
              </div>
            )}

            {(phase === 2 || phase === 3 || phase === 7) && (
              <div style={card}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Night Phase</div>
                <PlayerNight key={`${gameAddress}:${account}:night`} gameAddress={gameAddress} />
              </div>
            )}

            {phase === 5 && (
              <div style={card}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Day Voting</div>
                <PlayerDay key={`${gameAddress}:${account}:day`} gameAddress={gameAddress} />
              </div>
            )}

            {phase === 8 && (
              <div style={card}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Hunter's Turn</div>
                <PlayerHunter key={`${gameAddress}:${account}:hunter`} gameAddress={gameAddress} />
              </div>
            )}

            {phase === 6 && (
              <div style={card}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Game Over</div>
                <PlayerEnd key={`${gameAddress}:end`} gameAddress={gameAddress} />
              </div>
            )}

            {[1, 4].includes(phase) && (
              <div style={card}>
                Current phase: <b>{PHASE_NAMES[phase]}</b> (read-only). Phase progression is controlled by <span style={{ fontWeight: 600 }}>host</span>.
              </div>
            )}
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

        <div style={{ ...card, background: '#f9fafb', border: '1px solid #e5e7eb', padding: 12 }}>
          <p style={{ fontSize: 12, color: '#666', margin: 0, lineHeight: 1.6 }}>
            <strong>Note:</strong> Join is only available in <span style={mono as any}>Lobby</span> phase and you must not be the <span style={mono as any}>host</span>.
            Before game ends, <span style={mono as any}>roleOf</span> only allows querying your own role. Phase progression is controlled by the host.
          </p>
        </div>
      </div>
    </main>
  );
}


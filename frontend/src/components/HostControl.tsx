'use client';

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { GAME_ABI, PHASE_NAMES, ROLE_NAMES } from '@/lib/gameAbi';

interface HostControlProps {
  gameAddress: string;
  provider: ethers.BrowserProvider | null;
  onMessage: (msg: string, type: 'ok' | 'err' | 'muted') => void;
}

export default function HostControl({ gameAddress, provider, onMessage }: HostControlProps) {
  const [phase, setPhase] = React.useState<number>(0);
  const [dayCount, setDayCount] = React.useState<number>(0);
  const [seatsCount, setSeatsCount] = React.useState<number>(0);
  const [roles, setRoles] = useState<string>('');

  const refresh = async () => {
    if (!provider || !ethers.isAddress(gameAddress)) return;
    try {
      const game = new ethers.Contract(gameAddress, GAME_ABI, provider);
      const [p, d, s] = await Promise.all([
        game.phase(),
        game.dayCount(),
        game.seatsCount(),
      ]);
      setPhase(Number(p));
      setDayCount(Number(d));
      setSeatsCount(Number(s));
    } catch (e) {
      console.error('Failed to refresh:', e);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [provider, gameAddress]);

  const startGame = async () => {
    try {
      if (!provider) throw new Error('Please connect wallet');
      const signer = await provider.getSigner();
      const game = new ethers.Contract(gameAddress, GAME_ABI, signer);
      
      onMessage('Starting game...', 'muted');
      const tx = await game.start();
      await tx.wait();
      onMessage('Game started!', 'ok');
      await refresh();
    } catch (e: any) {
      onMessage(e.message || String(e), 'err');
    }
  };

  const assignRoles = async () => {
    try {
      if (!provider) throw new Error('Please connect wallet');
      if (!roles) throw new Error('Please enter role assignments (e.g., 0,1,2,3,4)');
      
      const roleArray = roles.split(',').map(r => parseInt(r.trim()));
      if (roleArray.length !== seatsCount) {
        throw new Error(`Role count (${roleArray.length}) must match seats count (${seatsCount})`);
      }
      
      const signer = await provider.getSigner();
      const game = new ethers.Contract(gameAddress, GAME_ABI, signer);
      
      onMessage('Assigning roles...', 'muted');
      const tx = await game.assignRoles(roleArray);
      await tx.wait();
      onMessage('Roles assigned!', 'ok');
      await refresh();
    } catch (e: any) {
      onMessage(e.message || String(e), 'err');
    }
  };

  const advancePhase = async (action: string) => {
    try {
      if (!provider) throw new Error('Please connect wallet');
      const signer = await provider.getSigner();
      const game = new ethers.Contract(gameAddress, GAME_ABI, signer);
      
      onMessage(`Executing ${action}...`, 'muted');
      let tx;
      
      switch (action) {
        case 'advanceToNightReveal':
          tx = await game.advanceToNightReveal();
          break;
        case 'advanceToNightResolve':
          tx = await game.advanceToNightResolve();
          break;
        case 'resolveNight':
          tx = await game.resolveNight();
          break;
        case 'resolveWitch':
          tx = await game.resolveWitch();
          break;
        case 'resolveDay':
          tx = await game.resolveDay();
          break;
        default:
          throw new Error('Unknown action');
      }
      
      await tx.wait();
      onMessage(`${action} completed!`, 'ok');
      await refresh();
    } catch (e: any) {
      onMessage(e.message || String(e), 'err');
    }
  };

  const card: React.CSSProperties = {
    border: '1px solid #eee',
    borderRadius: 12,
    padding: 16,
    background: '#fafafa',
  };

  const btn: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid #ddd',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 14,
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
    fontSize: 14,
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Game Status</div>
        <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
          <div>
            <strong>Phase:</strong> {PHASE_NAMES[phase]} (#{phase})
          </div>
          <div>
            <strong>Day:</strong> {dayCount}
          </div>
          <div>
            <strong>Players:</strong> {seatsCount}
          </div>
        </div>
      </div>

      {phase === 0 && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Start Game</div>
          <button onClick={startGame} style={btnPrimary}>
            Start Game
          </button>
        </div>
      )}

      {phase === 1 && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Assign Roles</div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
            Enter role IDs separated by commas (0=Villager, 1=Wolf, 2=Seer, 3=Hunter, 4=Witch)
          </div>
          <input
            type="text"
            placeholder="e.g., 0,1,2,3,4"
            value={roles}
            onChange={(e) => setRoles(e.target.value)}
            style={input}
          />
          <div style={{ fontSize: 12, color: '#999', marginTop: 4, marginBottom: 12 }}>
            Example for {seatsCount} players: {Array(seatsCount).fill(0).map((_, i) => i % 5).join(',')}
          </div>
          <button onClick={assignRoles} style={btnPrimary}>
            Assign Roles
          </button>
        </div>
      )}

      {phase === 2 && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Night Commit Phase</div>
          <button onClick={() => advancePhase('advanceToNightReveal')} style={btn}>
            Advance to Night Reveal
          </button>
        </div>
      )}

      {phase === 3 && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Night Reveal Phase</div>
          <button onClick={() => advancePhase('advanceToNightResolve')} style={btn}>
            Advance to Night Resolve
          </button>
        </div>
      )}

      {phase === 4 && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Night Resolve Phase</div>
          <button onClick={() => advancePhase('resolveNight')} style={btn}>
            Resolve Night
          </button>
        </div>
      )}

      {phase === 7 && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Witch Phase</div>
          <button onClick={() => advancePhase('resolveWitch')} style={btn}>
            Resolve Witch Actions
          </button>
        </div>
      )}

      {phase === 5 && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Day Vote Phase</div>
          <button onClick={() => advancePhase('resolveDay')} style={btn}>
            Resolve Day Vote
          </button>
        </div>
      )}

      {phase === 6 && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: '#16a34a' }}>🎉 Game Over</div>
          <div style={{ fontSize: 14 }}>
            The game has ended. Check the results in the player list.
          </div>
        </div>
      )}
    </div>
  );
}


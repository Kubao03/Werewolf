'use client';

import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { GAME_ABI } from '@/lib/gameAbi';

interface VoteTallyProps {
  gameAddress: string;
  provider: ethers.BrowserProvider | null;
}

export default function VoteTally({ gameAddress, provider }: VoteTallyProps) {
  const [seatsCount, setSeatsCount] = useState<number>(0);
  const [tally, setTally] = useState<number[]>([]);
  const [alive, setAlive] = useState<boolean[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!provider || !ethers.isAddress(gameAddress)) return;
    setLoading(true);
    try {
      const game = new ethers.Contract(gameAddress, GAME_ABI, provider);
      const [phase, count] = await Promise.all([
        game.phase(),
        game.seatsCount(),
      ]);
      
      // Only load tally if in Day Vote phase
      if (Number(phase) === 5) {
        const n = Number(count);
        const [tallyArr, aliveArr] = await Promise.all([
          Promise.all([...Array(n)].map(async (_, i) => {
            const v = await game.dayTally(i);
            return Number(v as bigint);
          })),
          Promise.all([...Array(n)].map(async (_, i) => {
            const seat = await game.seats(i);
            return Boolean(seat.alive);
          })),
        ]);
        setTally(tallyArr);
        setAlive(aliveArr);
        setSeatsCount(n);
      } else {
        setTally([]);
        setAlive([]);
        setSeatsCount(0);
      }
    } catch (e) {
      console.error('Failed to load vote tally:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [provider, gameAddress]);

  const card: React.CSSProperties = {
    border: '1px solid #eee',
    borderRadius: 12,
    padding: 16,
    background: '#fafafa',
    marginTop: 16,
  };

  if (seatsCount === 0 || tally.length === 0) {
    return null; // Don't show if not in Day Vote phase or no players
  }

  const maxVotes = Math.max(...tally);

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Vote Tally</div>
        <button
          onClick={refresh}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid #ddd',
            background: '#fff',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {[...Array(seatsCount)].map((_, i) => {
          const votes = tally[i] || 0;
          const isLeader = votes === maxVotes && votes > 0;
          const tieCount = tally.filter(v => v === maxVotes && maxVotes > 0).length;
          
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'center',
                padding: '10px 12px',
                background: isLeader ? (tieCount > 1 ? '#fff7ed' : '#f0fdf4') : '#fff',
                borderRadius: 8,
                border: isLeader ? (tieCount > 1 ? '1px solid #fdba74' : '1px solid #86efac') : '1px solid #eee'
              }}
            >
              <div style={{ fontWeight: 600, minWidth: 40 }}>#{i}</div>
              <div style={{ minWidth: 80 }}>
                {alive[i] ? (
                  <span style={{ color: '#065f46' }}>🟢 Alive</span>
                ) : (
                  <span style={{ color: '#666' }}>⚫️ Dead</span>
                )}
              </div>
              <div style={{ minWidth: 80 }}>
                Votes: <b style={{ fontSize: 16 }}>{votes}</b>
              </div>
              {isLeader && tieCount === 1 && (
                <div style={{ color: '#065f46', fontWeight: 600 }}>← Winner</div>
              )}
              {isLeader && tieCount > 1 && (
                <div style={{ color: '#b45309', fontWeight: 600 }}>← Tied ({tieCount} players)</div>
              )}
            </div>
          );
        })}
      </div>

      {maxVotes === 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#666', padding: 8, background: '#f9fafb', borderRadius: 8 }}>
          No votes cast yet
        </div>
      )}
    </div>
  );
}


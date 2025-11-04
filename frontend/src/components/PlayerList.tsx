'use client';

import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { GAME_ABI, ROLE_NAMES } from '@/lib/gameAbi';

interface Player {
  address: string;
  seat: number;
  alive: boolean;
  role: number | null;
}

interface PlayerListProps {
  gameAddress: string;
  provider: ethers.BrowserProvider | null;
  showRoles?: boolean;
}

export default function PlayerList({ gameAddress, provider, showRoles = false }: PlayerListProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!provider || !ethers.isAddress(gameAddress)) return;
    setLoading(true);
    try {
      const game = new ethers.Contract(gameAddress, GAME_ABI, provider);
      const count = Number(await game.seatsCount());
      
      const playersList: Player[] = [];
      for (let i = 0; i < count; i++) {
        const seat = await game.seats(i);
        // Role is already included in the seat struct from the contract
        // We can read it directly without needing roleOf() function
        const role = showRoles ? Number(seat.role) : null;
        
        playersList.push({
          address: String(seat.player),
          seat: i,
          alive: Boolean(seat.alive),
          role,
        });
      }
      
      setPlayers(playersList);
    } catch (e) {
      console.error('Failed to load players:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [provider, gameAddress, showRoles]);

  const card: React.CSSProperties = {
    border: '1px solid #eee',
    borderRadius: 12,
    padding: 16,
    background: '#fafafa',
  };

  const table: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
  };

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: '2px solid #ddd',
    fontWeight: 600,
    fontSize: 14,
  };

  const td: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid #eee',
    fontSize: 14,
  };

  const mono: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  };

  if (loading && players.length === 0) {
    return <div style={card}>Loading players...</div>;
  }

  if (players.length === 0) {
    return <div style={card}>No players joined yet.</div>;
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>Players ({players.length})</div>
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

      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Seat</th>
            <th style={th}>Address</th>
            <th style={th}>Status</th>
            {showRoles && <th style={th}>Role</th>}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.seat}>
              <td style={td}>#{player.seat}</td>
              <td style={{ ...td, ...mono }}>
                {player.address.slice(0, 10)}...{player.address.slice(-8)}
              </td>
              <td style={td}>
                {player.alive ? '🟢 Alive' : '⚫ Dead'}
              </td>
              {showRoles && (
                <td style={td}>
                  {player.role !== null ? ROLE_NAMES[player.role] : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


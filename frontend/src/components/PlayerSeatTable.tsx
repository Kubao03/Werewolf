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

interface PlayerSeatTableProps {
  gameAddress: string;
  provider: ethers.BrowserProvider | null;
  account: string;
  phase: number;
  yourSeat0Based: number;
}

export default function PlayerSeatTable({ gameAddress, provider, account, phase, yourSeat0Based }: PlayerSeatTableProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [myRole, setMyRole] = useState<number | null>(null);

  const refresh = async () => {
    if (!provider || !ethers.isAddress(gameAddress)) return;
    setLoading(true);
    try {
      const game = new ethers.Contract(gameAddress, GAME_ABI, provider);
      const count = Number(await game.seatsCount());
      
      const playersList: Player[] = [];
      for (let i = 0; i < count; i++) {
        const seat = await game.seats(i);
        const isMe = String(seat.player).toLowerCase() === account.toLowerCase();
        
        // Only show role for yourself (before game ends) or for everyone (after game ends)
        let role: number | null = null;
        if (phase === 6) {
          // Game ended, everyone can see all roles
          role = Number(seat.role);
        } else if (isMe && phase >= 2) {
          // Game in progress, try to get own role only
          try {
            const signer = await provider.getSigner();
            const gameWithSigner = new ethers.Contract(gameAddress, GAME_ABI, signer);
            const roleNum = Number(await gameWithSigner.roleOf(account));
            role = roleNum;
            setMyRole(roleNum);
          } catch {
            // Role not available yet (might not be assigned)
            role = null;
          }
        } else {
          // Other players' roles are hidden during game
          role = null;
        }
        
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
  }, [provider, gameAddress, account, phase]);

  const card: React.CSSProperties = {
    border: '1px solid #eee',
    borderRadius: 16,
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
        <div style={{ fontWeight: 600, fontSize: 16 }}>Players ({players.length})</div>
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
            <th style={th}>Role</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const isMe = player.seat === yourSeat0Based;
            return (
              <tr
                key={player.seat}
                style={{
                  background: isMe ? '#f0f9ff' : 'transparent',
                  borderLeft: isMe ? '3px solid #667eea' : 'none',
                }}
              >
                <td style={td}>
                  #{player.seat}
                  {isMe && <span style={{ marginLeft: 8, color: '#667eea', fontSize: 12 }}>(You)</span>}
                </td>
                <td style={{ ...td, ...mono }}>
                  {player.address.slice(0, 10)}...{player.address.slice(-8)}
                </td>
                <td style={td}>
                  {player.alive ? <span style={{ color: '#065f46', fontWeight: 600 }}>🟢 Alive</span> : <span style={{ color: '#666' }}>⚫ Dead</span>}
                </td>
                <td style={td}>
                  {player.role !== null ? (
                    <span style={{ fontWeight: isMe ? 600 : 400, color: isMe ? '#667eea' : '#333' }}>
                      {ROLE_NAMES[player.role]}
                    </span>
                  ) : (
                    <span style={{ color: '#999' }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


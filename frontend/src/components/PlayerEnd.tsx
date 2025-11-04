// File: src/components/PlayerEnd.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { GAME_ABI, ROLE_NAMES } from '@/lib/gameAbi';
import { getBrowserProvider } from '@/lib/ethersHelpers';

/** Simple batch reader for concurrent reads, preventing RPC overload */
async function batchMap<T, R>(arr: T[], fn: (t: T, i: number) => Promise<R>, batchSize = 10): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < arr.length; i += batchSize) {
    const slice = arr.slice(i, i + batchSize);
    const res = await Promise.all(slice.map((t, j) => fn(t, i + j)));
    out.push(...res);
  }
  return out;
}

export default function PlayerEnd({ gameAddress }: { gameAddress: string }) {
  const provider = useMemo(getBrowserProvider, []);
  const game = useMemo(
    () => (provider ? new ethers.Contract(gameAddress, GAME_ABI, provider) : null),
    [provider, gameAddress]
  );

  type Row = { player: string; alive: boolean; role?: number };

  const [rows, setRows] = useState<Row[]>([]);
  const [seatsCount, setSeatsCount] = useState<number>(0);
  const [dayCount, setDayCount] = useState<number>(0);
  const [phase, setPhase] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string>('');

  const refresh = async () => {
    if (!game) return;
    setLoading(true);
    setErr('');
    try {
      // Read basic info
      const [nRaw, pRaw, dRaw] = await Promise.all([
        game.seatsCount(), // uint256 -> bigint
        game.phase(),      // uint8
        game.dayCount(),   // uint64 -> bigint
      ]);
      const n = Number(nRaw as bigint);
      const d = Number(dRaw as bigint);
      setSeatsCount(n);
      setPhase(Number(pRaw));
      setDayCount(Number.isFinite(d) ? d : 0);

      if (n === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // Read seats list
      const base = await batchMap(
        Array.from({ length: n }, (_, i) => i),
        async (i) => {
          const s = await game.seats(i);
          return { player: String(s.player), alive: Boolean(s.alive) } as Row;
        }
      );

      // Ended phase allows revealing roles for any address
      const revealed = await batchMap(base, async (r) => {
        try {
          const roleU8: number = Number(await game.roleOf(r.player));
          return { ...r, role: roleU8 };
        } catch {
          return r;
        }
      });

      setRows(revealed);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, gameAddress]);

  // Statistics
  const aliveCount = rows.filter((r) => r.alive).length;
  const deadCount = rows.length - aliveCount;
  const wolves = rows.filter((r) => r.role === 1).length; // Role.Wolf = 1
  const goods = rows.filter((r) => r.role != null && r.role !== 1).length;

  // Styles
  const section: React.CSSProperties = { border: '1px solid #eee', borderRadius: 12, padding: 12 };
  const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', wordBreak: 'break-all' };
  const btn: React.CSSProperties = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 10, background: '#fff', cursor: 'pointer' };

  return (
    <div style={section}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}>Final Results & Role Reveal</div>
        <button onClick={refresh} style={btn} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div style={{ fontSize: 13, color: '#444', marginBottom: 8 }}>
        Phase: <b>{phase}</b> (should be Ended=6) | Day: <span style={mono}>{dayCount}</span> | Seats: <span style={mono}>{seatsCount}</span>
      </div>

      <div style={{ fontSize: 13, marginBottom: 10 }}>
        Alive: <b>{aliveCount}</b> / {rows.length}; Dead: <b>{deadCount}</b>.
        {rows.some((r) => r.role != null) && (
          <>
            <span style={{ margin: '0 8px' }}>|</span>
            Faction Stats (based on roles): Wolves <b>{wolves}</b>, Villagers <b>{goods}</b>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 12, alignItems: 'center' }}>
            <div># {i}</div>
            <div style={mono}>{r.player}</div>
            <div>{r.alive ? '🟢 alive' : '⚫️ dead'}</div>
            <div>
              {r.role != null ? ROLE_NAMES[r.role] ?? `Unknown(${r.role})` : '—'}
            </div>
          </div>
        ))}
      </div>

      {err && (
        <div
          style={{
            marginTop: 10,
            border: '1px solid #FECACA',
            background: '#FEF2F2',
            color: '#7F1D1D',
            borderRadius: 10,
            padding: 10,
            fontSize: 13,
          }}
        >
          Load failed: {err}
        </div>
      )}
    </div>
  );
}

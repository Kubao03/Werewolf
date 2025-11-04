// File: src/components/PlayerHunter.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { GAME_ABI } from '@/lib/gameAbi';
import { getBrowserProvider, getSignerRequired } from '@/lib/ethersHelpers';

export default function PlayerHunter({ gameAddress }: { gameAddress: string }) {
  const provider = useMemo(getBrowserProvider, []);
  const gameRO = useMemo(
    () => (provider ? new ethers.Contract(gameAddress, GAME_ABI, provider) : null),
    [provider, gameAddress]
  );

  const [account, setAccount] = useState<string>('');

  // On-chain state
  const [hunterToShoot1B, setHunterToShoot1B] = useState<number>(0); // 1-based, 0=none
  const [yourSeat1B, setYourSeat1B] = useState<number>(0);           // 1-based, 0=not joined
  const [seatsCount, setSeatsCount] = useState<number>(0);
  const [alive, setAlive] = useState<boolean[]>([]);

  // Local input
  const [target, setTarget] = useState<number>(0);

  // UI
  const [status, setStatus] = useState<string>('');

  const refresh = async () => {
    if (!gameRO) return;
    try {
      const [nRaw, hRaw] = await Promise.all([
        gameRO.seatsCount(),     // uint256 -> bigint
        gameRO.hunterToShoot(),  // uint8 -> bigint
      ]);
      const n = Number(nRaw as bigint);
      const hunter1B = Number(hRaw as bigint);
      setSeatsCount(n);
      setHunterToShoot1B(hunter1B);

      // Read alive list
      const aliveArr = await Promise.all(
        [...Array(n)].map(async (_, i) => {
          const s = await gameRO.seats(i);
          return Boolean(s.alive);
        })
      );
      setAlive(aliveArr);

      if (account) {
        const seat1 = Number(await gameRO.seatOf(account)); // uint8 -> number
        setYourSeat1B(seat1);
      }
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  };

  // Initialize account + Polling
  useEffect(() => {
    if (!provider) return;
    (async () => {
      try {
        await provider.send('eth_requestAccounts', []);
        const s = await provider.getSigner();
        setAccount(await s.getAddress());
      } finally {
        refresh();
      }
    })();

    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, gameAddress]);

  const iAmTheHunterToShoot = yourSeat1B > 0 && yourSeat1B === hunterToShoot1B;
  const canShoot = iAmTheHunterToShoot && seatsCount > 0;

  const validateTarget = (t: number) => {
    if (!Number.isInteger(t) || t < 0 || t >= seatsCount) {
      throw new Error(`Invalid target seat: should be in [0, ${Math.max(0, seatsCount - 1)}]`);
    }
    if (!alive[t]) {
      throw new Error('Target is dead, cannot shoot dead players');
    }
  };

  const shoot = async () => {
    try {
      if (!canShoot) {
        throw new Error('You don't have hunter shooting rights (only executed hunters can shoot in this phase)');
      }
      validateTarget(target);

      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
      await (await gw.hunterShoot(target)).wait();

      setStatus('Shot confirmed on-chain');
      refresh();
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  };

  // Styles（inline）
  const section: React.CSSProperties = { border: '1px solid #eee', borderRadius: 12, padding: 12 };
  const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
  const inputStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #e3e3e8', borderRadius: 10 };
  const btn: React.CSSProperties = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 10, background: '#fff', cursor: 'pointer' };
  const btnDisabled: React.CSSProperties = { ...btn, opacity: 0.6, cursor: 'not-allowed' };
  const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' };

  return (
    <div style={section}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Hunter's Shot</div>

      <div style={{ marginBottom: 6, fontSize: 13, color: '#444' }}>
        Your seat(1-based)：<span style={mono}>{yourSeat1B || 'Not joined'}</span>，
        Current hunter seat(1-based)：<span style={mono}>{hunterToShoot1B || 'None'}</span>
      </div>

      <div style={row}>
        <input
          placeholder="target seat（0-based）"
          value={target}
          onChange={(e) => setTarget(Number(e.target.value) || 0)}
          style={inputStyle}
        />
        <button onClick={shoot} style={canShoot ? btn : btnDisabled} disabled={!canShoot}>
          hunterShoot
        </button>
      </div>

      {/* Alive overview (optional) */}
      {seatsCount > 0 && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          Alive overview:
          <span style={{ marginLeft: 6 }}>
            {alive.map((a, i) => (
              <span key={i} style={{ marginRight: 8 }}>
                #{i}:{a ? '🟢' : '⚫️'}
              </span>
            ))}
          </span>
        </div>
      )}

      {status && <div style={{ marginTop: 8, border: '1px solid #eee', borderRadius: 10, padding: 10 }}>{status}</div>}
    </div>
  );
}

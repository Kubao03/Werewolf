'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { GAME_ABI, PHASE_NAMES } from '@/lib/gameAbi';
import { getBrowserProvider } from '@/lib/ethersHelpers';

export default function GameHeader({ gameAddress }: { gameAddress: string }) {
  const provider = useMemo(getBrowserProvider, []);
  const [cfg, setCfg] = useState<{
    minPlayers: bigint;
    maxPlayers: bigint;
    wolves: bigint;
    stake: bigint;
    tSetup: bigint;
    tNightCommit: bigint;
    tNightReveal: bigint;
    tDayVote: bigint;
  } | null>(null);

  const [phase, setPhase] = useState<number>(0);
  const [dayCount, setDayCount] = useState<number>(0);
  const [host, setHost] = useState<string>('');
  const [error, setError] = useState<string>('');

  const refresh = async () => {
    if (!provider || !ethers.isAddress(gameAddress)) return;
    try {
      const game = new ethers.Contract(gameAddress, GAME_ABI, provider);
      const [cfgRaw, phaseRaw, dayRaw, hostAddr] = await Promise.all([
        game.cfg(),
        game.phase(),
        game.dayCount(), // uint64 -> bigint
        game.host(),
      ]);

      setCfg(cfgRaw);
      setPhase(Number(phaseRaw));
      setHost(String(hostAddr));

      const dayNum = Number(dayRaw as bigint);
      setDayCount(Number.isFinite(dayNum) ? dayNum : 0);

      setError('');
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, gameAddress]);

  const mono: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    wordBreak: 'break-all',
  };

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 16, padding: 16, background: '#fafafa' }}>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
        Game Address
      </div>
      <div
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 16,
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        {gameAddress}
      </div>

      <div style={{ fontSize: 14, color: '#333', marginBottom: 8 }}>
        phase: <b>{PHASE_NAMES[phase] ?? phase}</b>
        {dayCount > 0 && (
          <>
            <span style={{ margin: '0 8px' }}>|</span>
            Current Day: <span style={mono}>{dayCount}</span>
          </>
        )}
      </div>

      {cfg && (
        <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>
          min/max: {Number(cfg.minPlayers)}/{Number(cfg.maxPlayers)}; wolves: {Number(cfg.wolves)}; stake: {ethers.formatEther(cfg.stake)} ETH
        </div>
      )}

      {host && (
        <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>
          Host: <span style={mono}>{host}</span> (Phase progression controlled by host)
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 8,
            border: '1px solid #FECACA',
            background: '#FEF2F2',
            color: '#7F1D1D',
            borderRadius: 12,
            padding: 10,
            fontSize: 13,
          }}
        >
          Load failed: {error}
        </div>
      )}
    </div>
  );
}

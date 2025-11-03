// File: src/components/GameHeader.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { GAME_ABI, PHASE_NAMES } from '@/lib/gameAbi';
import { getBrowserProvider } from '@/lib/ethersHelpers';

function fmtHMS(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

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
  const [deadline, setDeadline] = useState<number>(0); // seconds since epoch
  const [dayCount, setDayCount] = useState<number>(0);
  const [error, setError] = useState<string>('');

  const refresh = async () => {
    if (!provider || !ethers.isAddress(gameAddress)) return;
    try {
      const game = new ethers.Contract(gameAddress, GAME_ABI, provider);
      const [cfgRaw, phaseRaw, dlRaw, dayRaw] = await Promise.all([
        game.cfg(),
        game.phase(),
        game.deadline(), // bigint (uint64)
        game.dayCount(), // bigint (uint64)
      ]);

      setCfg(cfgRaw);
      setPhase(Number(phaseRaw));

      // ethers v6 返回 bigint；这里转换为 number 仅用于 UI 倒计时，足够安全（秒级时间 < 2^53）
      const dlNum = Number(dlRaw as bigint);
      const dayNum = Number(dayRaw as bigint);
      setDeadline(Number.isFinite(dlNum) ? dlNum : 0);
      setDayCount(Number.isFinite(dayNum) ? dayNum : 0);

      setError('');
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  useEffect(() => {
    // 进来先刷一次
    refresh();
    // 每 5 秒轮询一遍（轻量）
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, gameAddress]);

  // 剩余时间（秒）
  const nowSec = Math.floor(Date.now() / 1000);
  const remain = Math.max(0, (deadline || 0) - nowSec);

  const mono: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    wordBreak: 'break-all',
  };

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 16, padding: 16, marginBottom: 12, background: '#fafafa' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        游戏地址：<span style={mono}>{gameAddress}</span>
      </div>

      <div style={{ fontSize: 14 }}>
        phase：<b>{PHASE_NAMES[phase] ?? phase}</b>
        {dayCount > 0 && (
          <>
            <span style={{ margin: '0 8px' }}>|</span>
            当前天数：<span style={mono}>{dayCount}</span>
          </>
        )}
        <span style={{ margin: '0 8px' }}>|</span>
        剩余时间：<span style={mono}>{fmtHMS(remain)}</span>
      </div>

      {cfg && (
        <div style={{ fontSize: 13, marginTop: 6 }}>
          min/max：{Number(cfg.minPlayers)}/{Number(cfg.maxPlayers)}；
          wolves：{Number(cfg.wolves)}；
          stake：{ethers.formatEther(cfg.stake)} ETH
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
          读取失败：{error}
        </div>
      )}
    </div>
  );
}

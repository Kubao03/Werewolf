// File: src/components/PlayerDay.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { GAME_ABI } from '@/lib/gameAbi';
import { getBrowserProvider, getSignerRequired } from '@/lib/ethersHelpers';

export default function PlayerDay({ gameAddress }: { gameAddress: string }) {
  const provider = useMemo(getBrowserProvider, []);
  const game = useMemo(
    () => (provider ? new ethers.Contract(gameAddress, GAME_ABI, provider) : null),
    [provider, gameAddress]
  );

  const [account, setAccount] = useState<string>('');

  const [seatsCount, setSeatsCount] = useState<number>(0);
  const [alive, setAlive] = useState<boolean[]>([]);
  const [tally, setTally] = useState<number[]>([]);
  const [voteTarget, setVoteTarget] = useState<number>(0);

  const [yourSeat1Based, setYourSeat1Based] = useState<number>(0);
  const [youAlive, setYouAlive] = useState<boolean>(false);
  const [host, setHost] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);

  const [status, setStatus] = useState<string>('');

  // 读取白天所需信息
  const refresh = async () => {
    if (!game) return;
    try {
      const [nRaw, hostAddr] = await Promise.all([
        game.seatsCount(),               // uint256 -> bigint
        game.host(),
      ]);
      const n = Number(nRaw as bigint);
      setSeatsCount(n);
      setHost(String(hostAddr));
      setIsHost(!!account && hostAddr && account.toLowerCase() === String(hostAddr).toLowerCase());

      const seatsArr = await Promise.all(
        [...Array(n)].map(async (_, i) => {
          const s = await game.seats(i); // {player, alive, role}
          return Boolean(s.alive);
        })
      );
      setAlive(seatsArr);

      const tallyArr = await Promise.all(
        [...Array(n)].map(async (_, i) => {
          const v = await game.dayTally(i); // uint8 -> bigint
          return Number(v as bigint);
        })
      );
      setTally(tallyArr);

      if (account) {
        const seat1 = Number(await game.seatOf(account)); // uint8 -> number
        setYourSeat1Based(seat1);
        if (seat1 > 0) {
          const myAlive = Boolean((await game.seats(seat1 - 1)).alive);
          setYouAlive(myAlive);
        } else {
          setYouAlive(false);
        }
      }
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  };

  // 初始化账号 + 定时刷新
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

  // 计算领先者
  const leader = React.useMemo(() => {
    let idx = -1, max = -1;
    for (let i = 0; i < tally.length; i++) {
      if (tally[i] > max) { max = tally[i]; idx = i; }
    }
    return { idx, votes: max };
  }, [tally]);

  const validateTarget = (t: number) => {
    if (!Number.isInteger(t) || t < 0 || t >= seatsCount) {
      throw new Error(`目标 seat 无效：应在 [0, ${Math.max(0, seatsCount - 1)}]`);
    }
  };

  const doVote = async () => {
    try {
      validateTarget(voteTarget);
      if (!youAlive) {
        throw new Error('你已死亡或未加入，无法投票');
      }
      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
      await (await gw.vote(voteTarget)).wait();
      setStatus('已投票/改票成功');
      refresh();
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  };

  const resolveDay = async () => {
    try {
      if (!isHost) throw new Error('仅 host 可推进/结算白天');
      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
      await (await gw.resolveDay()).wait();
      setStatus('白天已结算');
      refresh();
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  };

  // 样式（内联）
  const section: React.CSSProperties = { border: '1px solid #eee', borderRadius: 12, padding: 12 };
  const row: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };
  const inputStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #e3e3e8', borderRadius: 10 };
  const btn: React.CSSProperties = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 10, background: '#fff', cursor: 'pointer' };
  const btnDisabled: React.CSSProperties = { ...btn, opacity: 0.6, cursor: 'not-allowed' };
  const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' };

  const deadTargetWarning =
    Number.isInteger(voteTarget) && voteTarget >= 0 && voteTarget < seatsCount && alive.length === seatsCount && !alive[voteTarget]
      ? '（提示：你正投给一名已死亡玩家，通常不会有意义）'
      : '';

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={section}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>白天投票</div>
        <div style={row}>
          <input
            placeholder="target seat"
            value={voteTarget}
            onChange={(e) => setVoteTarget(Number(e.target.value) || 0)}
            style={inputStyle}
          />
          <button
            onClick={doVote}
            style={youAlive ? btn : btnDisabled}
            disabled={!youAlive}
            title={youAlive ? '' : '只有存活玩家才能投票'}
          >
            投票 / 改票
          </button>

          {/* 仅 host 可见 */}
          <button onClick={resolveDay} style={isHost ? btn : btnDisabled} disabled={!isHost} title={isHost ? '' : '仅 host 可推进'}>
            结算白天（host）
          </button>
        </div>

        <div style={{ marginTop: 6, fontSize: 13, color: '#666' }}>
          你的 seat(1-based)：<span style={mono}>{yourSeat1Based || '未加入'}</span>，
          状态：{youAlive ? '🟢 存活' : '⚫️ 不可投票'}
          {deadTargetWarning && <span style={{ marginLeft: 8, color: '#b45309' }}>{deadTargetWarning}</span>}
        </div>

        {host && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
            本局 host：<span style={mono}>{host}</span>
          </div>
        )}
      </div>

      <div style={section}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>票数统计</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {[...Array(seatsCount)].map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div># {i}</div>
              <div>{alive[i] ? '🟢 alive' : '⚫️ dead'}</div>
              <div>votes: <b>{tally[i] || 0}</b></div>
              {leader.idx === i && leader.votes > 0 && (
                <div style={{ color: '#065f46' }}>← 当前领先</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {status && (
        <div style={{ border: '1px solid #eee', padding: 10, borderRadius: 12 }}>
          {status}
        </div>
      )}
    </div>
  );
}

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

  // Read day phase info
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
        // Update isHost after account is set
        setIsHost(account.toLowerCase() === String(hostAddr).toLowerCase());
        if (seat1 > 0) {
          const myAlive = Boolean((await game.seats(seat1 - 1)).alive);
          setYouAlive(myAlive);
        } else {
          setYouAlive(false);
        }
      } else {
        setYourSeat1Based(0);
        setYouAlive(false);
        setIsHost(false);
      }
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  };

  // Initialize account + periodic refresh
  useEffect(() => {
    if (!provider) return;
    let mounted = true;
    (async () => {
      try {
        await provider.send('eth_requestAccounts', []);
        const s = await provider.getSigner();
        const addr = await s.getAddress();
        if (mounted) {
          setAccount(addr);
          // Refresh immediately after account is set
          if (game) {
            await refresh();
          }
        }
      } catch (e) {
        console.warn('Failed to get account:', e);
      }
    })();
    const t = setInterval(() => {
      if (mounted && game) {
        refresh();
      }
    }, 5000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, gameAddress]);

  // Calculate leader
  const leader = React.useMemo(() => {
    let idx = -1, max = -1;
    for (let i = 0; i < tally.length; i++) {
      if (tally[i] > max) { max = tally[i]; idx = i; }
    }
    return { idx, votes: max };
  }, [tally]);

  const validateTarget = (t: number) => {
    if (!Number.isInteger(t) || t < 0 || t >= seatsCount) {
      throw new Error(`Invalid target seat: should be in [0, ${Math.max(0, seatsCount - 1)}]`);
    }
  };

  const doVote = async () => {
    try {
      validateTarget(voteTarget);
      if (!youAlive) {
        throw new Error('You are dead or not joined, cannot vote');
      }
      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
      await (await gw.vote(voteTarget)).wait();
      setStatus('Vote/re-vote successful');
      refresh();
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  };

  const resolveDay = async () => {
    try {
      if (!isHost) throw new Error('Only host can advance/resolve day');
      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
      await (await gw.resolveDay()).wait();
      setStatus('Day resolved');
      refresh();
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  };

  // Styles（inline）
  const section: React.CSSProperties = { border: '1px solid #eee', borderRadius: 16, padding: 16, background: '#fafafa' };
  const row: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' };
  const inputStyle: React.CSSProperties = { 
    padding: '10px 12px', 
    border: '1px solid #e3e3e8', 
    borderRadius: 12, 
    fontSize: 14,
    background: '#fff',
    width: 'auto',
    minWidth: 120
  };
  const btn: React.CSSProperties = { 
    padding: '10px 14px', 
    border: '1px solid #ddd', 
    borderRadius: 12, 
    background: '#fff', 
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500
  };
  const btnPrimary: React.CSSProperties = {
    ...btn,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    fontWeight: 600
  };
  const btnDisabled: React.CSSProperties = { ...btn, opacity: 0.6, cursor: 'not-allowed' };
  const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' };

  const deadTargetWarning =
    Number.isInteger(voteTarget) && voteTarget >= 0 && voteTarget < seatsCount && alive.length === seatsCount && !alive[voteTarget]
      ? '(Note: You are voting for a dead player, which is usually meaningless)'
      : '';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={section}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>Day Voting</div>
        <div style={row}>
          <input
            placeholder="Target seat (0-based)"
            value={voteTarget}
            onChange={(e) => setVoteTarget(Number(e.target.value) || 0)}
            style={inputStyle}
          />
          <button
            onClick={doVote}
            style={youAlive ? btnPrimary : btnDisabled}
            disabled={!youAlive}
            title={youAlive ? '' : 'Only alive players can vote'}
          >
            Vote / Change Vote
          </button>

          {/* Only host can see */}
          <button onClick={resolveDay} style={isHost ? btn : btnDisabled} disabled={!isHost} title={isHost ? '' : 'Only host can advance'}>
            Resolve Day (host)
          </button>
        </div>

        <div style={{ marginTop: 16, fontSize: 13, color: '#666', padding: 12, background: '#f9fafb', borderRadius: 8 }}>
          <div style={{ marginBottom: 8 }}>
            Your seat: <span style={mono}>{yourSeat1Based > 0 ? `#${yourSeat1Based - 1}` : 'Not joined'}</span>
          </div>
          <div>
            Status: {youAlive ? <span style={{ color: '#065f46', fontWeight: 600 }}>🟢 Alive</span> : <span style={{ color: '#666' }}>⚫️ Cannot vote</span>}
          </div>
          {deadTargetWarning && (
            <div style={{ marginTop: 8, color: '#b45309', fontSize: 12 }}>
              ⚠️ {deadTargetWarning}
            </div>
          )}
        </div>

        {host && (
          <div style={{ marginTop: 12, fontSize: 13, color: '#666', paddingTop: 12, borderTop: '1px solid #eee' }}>
            Game host: <span style={mono}>{host}</span>
          </div>
        )}
      </div>

      <div style={section}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>Vote Tally</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {[...Array(seatsCount)].map((_, i) => (
            <div 
              key={i} 
              style={{ 
                display: 'flex', 
                gap: 16, 
                alignItems: 'center',
                padding: '10px 12px',
                background: leader.idx === i && leader.votes > 0 ? '#f0fdf4' : '#fff',
                borderRadius: 8,
                border: leader.idx === i && leader.votes > 0 ? '1px solid #86efac' : '1px solid #eee'
              }}
            >
              <div style={{ fontWeight: 600, minWidth: 40 }}>#{i}</div>
              <div style={{ minWidth: 80 }}>{alive[i] ? <span style={{ color: '#065f46' }}>🟢 Alive</span> : <span style={{ color: '#666' }}>⚫️ Dead</span>}</div>
              <div style={{ minWidth: 80 }}>Votes: <b style={{ fontSize: 16 }}>{tally[i] || 0}</b></div>
              {leader.idx === i && leader.votes > 0 && (
                <div style={{ color: '#065f46', fontWeight: 600 }}>← Current Leader</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {status && (
        <div style={{ 
          border: '1px solid #e5e7eb', 
          padding: 12, 
          borderRadius: 12, 
          background: '#f9fafb',
          fontSize: 14,
          color: '#333'
        }}>
          {status}
        </div>
      )}
    </div>
  );
}

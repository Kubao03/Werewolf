// File: src/components/PlayerDay.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { GAME_ABI, ROLE_NAMES } from '@/lib/gameAbi';
import { getBrowserProvider, getSignerRequired } from '@/lib/ethersHelpers';
import { getRoleImage } from '@/lib/roleImages';
import Image from 'next/image';

interface PlayerDayProps {
  gameAddress: string;
  provider: ethers.BrowserProvider | null;
  account: string;
}

export default function PlayerDay({ gameAddress, provider, account }: PlayerDayProps) {
  const game = useMemo(
    () => (provider ? new ethers.Contract(gameAddress, GAME_ABI, provider) : null),
    [provider, gameAddress]
  );

  const [seatsCount, setSeatsCount] = useState<number>(0);
  const [alive, setAlive] = useState<boolean[]>([]);
  const [tally, setTally] = useState<number[]>([]);
  const [voteTarget, setVoteTarget] = useState<number>(0);

  const [yourSeat1Based, setYourSeat1Based] = useState<number>(0);
  const [youAlive, setYouAlive] = useState<boolean>(false);
  const [host, setHost] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);
  const [myRole, setMyRole] = useState<number | null>(null);
  const [phase, setPhase] = useState<number>(0);
  const [dayCount, setDayCount] = useState<number>(0);

  const [status, setStatus] = useState<string>('');

  // Read day phase info
  const refresh = async () => {
    if (!game) return;
    try {
      const [nRaw, hostAddr, pRaw, dRaw] = await Promise.all([
        game.seatsCount(),               // uint256 -> bigint
        game.host(),
        game.phase(),
        game.dayCount(),
      ]);
      const n = Number(nRaw as bigint);
      const p = Number(pRaw);
      const d = Number(dRaw as bigint);
      setSeatsCount(n);
      setHost(String(hostAddr));
      setPhase(p);
      setDayCount(d);

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
          // Try to get role if assigned
          if (p >= 2 && d > 0) {
            try {
              const signer = await provider!.getSigner();
              const gameWithSigner = new ethers.Contract(gameAddress, GAME_ABI, signer);
              const roleNum = Number(await gameWithSigner.roleOf(account));
              setMyRole(roleNum);
            } catch {
              setMyRole(null);
            }
          } else {
            setMyRole(null);
          }
        } else {
          setYouAlive(false);
          setMyRole(null);
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

  // Periodic refresh when account is available
  useEffect(() => {
    if (!provider || !game) return;
    let mounted = true;
    
    // Initial refresh
    if (account) {
      refresh();
    }
    
    // Periodic refresh
    const t = setInterval(() => {
      if (mounted && game && account) {
        refresh();
      }
    }, 5000);
    
    return () => {
      mounted = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, gameAddress, account]);

  // Calculate leader and detect ties
  const leader = React.useMemo(() => {
    let max = -1;
    // Find max votes
    for (let i = 0; i < tally.length; i++) {
      if (tally[i] > max) { max = tally[i]; }
    }
    
    // Find all players with max votes
    const leaders: number[] = [];
    for (let i = 0; i < tally.length; i++) {
      if (tally[i] === max && max > 0 && alive[i]) {
        leaders.push(i);
      }
    }
    
    // If only one leader, return it; otherwise return -1 to indicate tie
    const isTie = leaders.length > 1;
    return { 
      idx: isTie ? -1 : (leaders.length === 1 ? leaders[0] : -1), 
      votes: max,
      leaders: leaders, // Array of all players with max votes
      isTie: isTie
    };
  }, [tally, alive]);

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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'start' }}>
      {/* Left: Main Content */}
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
        {leader.isTie && leader.votes > 0 && (
          <div style={{ 
            marginBottom: 12, 
            padding: '10px 12px', 
            background: '#fff7ed', 
            borderRadius: 8, 
            border: '1px solid #fdba74',
            fontSize: 13,
            color: '#b45309',
            fontWeight: 500
          }}>
            ⚠️ Tie detected: {leader.leaders.length} players have {leader.votes} vote{leader.votes !== 1 ? 's' : ''} each. No execution will occur.
          </div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {[...Array(seatsCount)].map((_, i) => {
            const isLeader = leader.leaders.includes(i);
            const isTied = leader.isTie && isLeader;
            const isUniqueLeader = !leader.isTie && isLeader && leader.votes > 0;
            
            return (
              <div 
                key={i} 
                style={{ 
                  display: 'flex', 
                  gap: 16, 
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: isUniqueLeader ? '#f0fdf4' : isTied ? '#fff7ed' : '#fff',
                  borderRadius: 8,
                  border: isUniqueLeader ? '1px solid #86efac' : isTied ? '1px solid #fdba74' : '1px solid #eee'
                }}
              >
                <div style={{ fontWeight: 600, minWidth: 40 }}>#{i}</div>
                <div style={{ minWidth: 80 }}>{alive[i] ? <span style={{ color: '#065f46' }}>🟢 Alive</span> : <span style={{ color: '#666' }}>⚫️ Dead</span>}</div>
                <div style={{ minWidth: 80 }}>Votes: <b style={{ fontSize: 16 }}>{tally[i] || 0}</b></div>
                {isUniqueLeader && (
                  <div style={{ color: '#065f46', fontWeight: 600 }}>← Current Leader</div>
                )}
                {isTied && (
                  <div style={{ color: '#b45309', fontWeight: 600 }}>← Tied ({leader.leaders.length} players)</div>
                )}
              </div>
            );
          })}
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

      {/* Right: Role Card */}
      {myRole !== null && getRoleImage(myRole) && yourSeat1Based > 0 && phase >= 2 && dayCount > 0 && (
        <div style={{
          border: '2px solid #667eea',
          borderRadius: 16,
          padding: 20,
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e0e7ff 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          position: 'sticky',
          top: 20,
          minWidth: 140,
        }}>
          <div style={{ fontSize: 14, color: '#666', fontWeight: 500 }}>Your Role</div>
          <Image
            src={getRoleImage(myRole)!}
            alt={ROLE_NAMES[myRole]}
            width={100}
            height={100}
            style={{ borderRadius: 12, objectFit: 'cover', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)' }}
          />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#667eea', textAlign: 'center' }}>
            {ROLE_NAMES[myRole]}
          </div>
        </div>
      )}
    </div>
  );
}

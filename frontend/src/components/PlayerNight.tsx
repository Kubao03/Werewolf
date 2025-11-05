'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { GAME_ABI, ROLE_NAMES } from '@/lib/gameAbi';
import { getBrowserProvider, getSignerRequired } from '@/lib/ethersHelpers';
import { getRoleImage } from '@/lib/roleImages';
import Image from 'next/image';

/** Calculate commit consistent with contract:keccak256(abi.encode(address(this), dayCount, targetSeat, salt)) */
function encodeCommit(gameAddr: string, day: bigint, target: number, saltHex32: string) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(['address', 'uint64', 'uint8', 'bytes32'], [gameAddr, day, target, saltHex32]);
  return ethers.keccak256(encoded);
}

/** Validate 0x-prefixed 32-byte salt */
function isHex32(s: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

/** Local storage key (isolated by account to avoid mix-up) */
const keySalt = (game: string, account: string, day: bigint) =>
  `${game}:${account}:salt:${day.toString()}`;
const keyCommitTarget = (game: string, account: string, day: bigint) =>
  `${game}:${account}:commitTarget:${day.toString()}`;
const keySeer = (game: string, account: string, day: bigint) =>
  `${game}:${account}:seer:${day.toString()}`;

export default function PlayerNight({ gameAddress }: { gameAddress: string }) {
  const provider = useMemo(getBrowserProvider, []);
  const game = useMemo(
    () => (provider ? new ethers.Contract(gameAddress, GAME_ABI, provider) : null),
    [provider, gameAddress]
  );

  // Basic state
  const [account, setAccount] = useState<string>('');
  const [phase, setPhase] = useState<number>(0);
  const [dayCount, setDayCount] = useState<bigint>(0n);
  const [seatsCount, setSeatsCount] = useState<number>(0);
  const [joined, setJoined] = useState<boolean>(false);

  // Role and panel
  const [myRole, setMyRole] = useState<number | null>(null);
  const isWolf = myRole === 1;
  const isSeer = myRole === 2;
  const isWitch = myRole === 4;

  // Wolf: commit/reveal
  const [commitTarget, setCommitTarget] = useState<number>(0);
  const [salt, setSalt] = useState<string>(''); // Local persistence
  const [committedTarget, setCommittedTarget] = useState<number | null>(null); // Restored from local

  // Seer
  const [seerTarget, setSeerTarget] = useState<number>(0);
  const [seerLastSeat, setSeerLastSeat] = useState<number | null>(null);
  const [seerLastFaction, setSeerLastFaction] = useState<number | null>(null); // 0=Good, 1=Wolves

  // Witch (ABI has no nightVictim → infer from logs)
  const [witchAction, setWitchAction] = useState<number>(0); // 0=skip, 1=save, 2=poison
  const [witchTarget, setWitchTarget] = useState<number>(0);
  const [victimThisNight, setVictimThisNight] = useState<number>(255);
  const [hasAnti, setHasAnti] = useState<boolean>(false);
  const [hasPois, setHasPois] = useState<boolean>(false);
  const [nightUsed, setNightUsed] = useState<boolean>(false);
  const [victimAlive, setVictimAlive] = useState<boolean>(false);

  const [status, setStatus] = useState<string>('');

  // ==== Initialize account ====
  useEffect(() => {
    if (!provider) return;
    (async () => {
      try {
        await provider.send('eth_requestAccounts', []);
        const s = await provider.getSigner();
        const addr = await s.getAddress();
        setAccount(addr);
        // Refresh immediately after account is set
        if (game) {
          await refresh();
        }
      } catch (e) {
        console.warn('Failed to get account:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, game]);

  // When switching game address/account, clear identity and cache (avoid residue)
  useEffect(() => {
    setMyRole(null);
    setJoined(false);
    setSeerLastSeat(null);
    setSeerLastFaction(null);
    setCommittedTarget(null);
    setSalt('');
    setVictimThisNight(255);
  }, [gameAddress, account]);

  // ==== Periodic refresh ====
  useEffect(() => {
    if (!game || !account) return;
    let timer: any;
    const loop = async () => {
      try {
        await refresh();
      } catch (e) {
        console.warn('Failed to refresh player night state:', e);
      }
      timer = setTimeout(loop, 3000);
    };
    loop();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, account, gameAddress]);

  // ==== Basic refresh ====
  const refresh = async () => {
    if (!game) return;
    const [pRaw, dRaw, nRaw] = await Promise.all([game.phase(), game.dayCount(), game.seatsCount()]);
    const p = Number(pRaw);
    const d = dRaw as bigint;
    const n = Number(nRaw);
    setPhase(p);
    setDayCount(d);
    setSeatsCount(n);

    // Whether joined
    let seat1 = 0;
    if (account) {
      try { seat1 = Number(await game.seatOf(account)); } catch {}
    }
    const isJoined = seat1 > 0;
    setJoined(isJoined);

    // Read identity (strict conditions): joined Read identity (strict conditions): joined && assigned (phase≥2 and dayCount>0) assigned (phase≥2 and dayCount>0)
    if (isJoined && p >= 2 && Number(d) > 0) {
      try {
        const signer = await provider!.getSigner(); // Use signer to ensure msg.sender == me
        const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
        const r: number = Number(await gw.roleOf(account));
        setMyRole(r);
      } catch {
        setMyRole(null); // Clear on failure to avoid residue
      }
    } else {
      setMyRole(null); // Not joined or not assigned, clear all
    }

    // Witch self-state
    if (account) {
      try {
        const [a, pz, used] = await Promise.all([
          game.hasAntidote(account),
          game.hasPoison(account),
          game.hasUsedNightAbility(account),
        ]);
        setHasAnti(Boolean(a));
        setHasPois(Boolean(pz));
        setNightUsed(Boolean(used));
      } catch {}
    }

    // Victim alive status
    if (victimThisNight >= 0 && victimThisNight < n) {
      try {
        const sv = await game.seats(victimThisNight);
        setVictimAlive(Boolean(sv.alive));
      } catch { setVictimAlive(false); }
    } else {
      setVictimAlive(false);
    }

    // SeerLocal cache
    if (gameAddress && account) {
      const cached = localStorage.getItem(keySeer(gameAddress, account, d));
      if (cached) {
        try {
          const { seat, faction } = JSON.parse(cached);
          setSeerLastSeat(seat);
          setSeerLastFaction(faction);
        } catch {}
      } else {
        setSeerLastSeat(null);
        setSeerLastFaction(null);
      }
    }

    // Restore auto-reveal requirements (isolated by account)
    if (gameAddress && d && account) {
      const saltSaved = localStorage.getItem(keySalt(gameAddress, account, d));
      if (saltSaved && isHex32(saltSaved)) setSalt(saltSaved);
      const targetSaved = localStorage.getItem(keyCommitTarget(gameAddress, account, d));
      setCommittedTarget(targetSaved != null ? Number(targetSaved) : null);
    }
  };

  // ==== Subscribe to raw logs: SeerChecked (only receive own) ====
  useEffect(() => {
    if (!provider || !account || !dayCount || !ethers.isAddress(gameAddress)) return;

    // event SeerChecked(address indexed seer, uint8 targetSeat, uint8 faction)
    const topic0 = ethers.id("SeerChecked(address,uint8,uint8)");
    const topicSeer = ethers.zeroPadValue(ethers.getAddress(account), 32).toLowerCase();
    const filter = { address: gameAddress, topics: [topic0, topicSeer] } as any;

    const handleLog = (log: any) => {
      try {
        const [targetSeat, faction] = ethers.AbiCoder.defaultAbiCoder().decode(['uint8', 'uint8'], log.data);
        const seatNum = Number(targetSeat);
        const facNum = Number(faction);
        setSeerLastSeat(seatNum);
        setSeerLastFaction(facNum);
        localStorage.setItem(keySeer(gameAddress, account, dayCount), JSON.stringify({ seat: seatNum, faction: facNum }));
        setStatus(`Check result:#${seatNum} => ${facNum === 1 ? 'Wolf faction' : 'Villager faction'}`);
      } catch { /* ignore */ }
    };

    provider.on(filter, handleLog);
    return () => { try { provider.off(filter, handleLog); } catch {} };
  }, [provider, gameAddress, account, dayCount]);

  // ==== NightResolved / WitchActed: Infer wolf kill this night ====
  useEffect(() => {
    if (!provider || !ethers.isAddress(gameAddress)) return;

    const topicNightResolved = ethers.id("NightResolved(uint8)");
    const topicWitchActed   = ethers.id("WitchActed(address,uint8,uint8)");

    const onNightResolved = (log: any) => {
      try {
        const [victim] = ethers.AbiCoder.defaultAbiCoder().decode(['uint8'], log.data);
        setVictimThisNight(Number(victim));
      } catch { /* ignore */ }
    };
    const onWitchActed = (log: any) => {
      try {
        // WitchActed data only contains two non-indexed uint8
        const [actionType] = ethers.AbiCoder.defaultAbiCoder().decode(['uint8','uint8'], log.data);
        if (Number(actionType) === 1) setVictimThisNight(255); // Clear after save
      } catch { /* ignore */ }
    };

    const filterResolved = { address: gameAddress, topics: [topicNightResolved] } as any;
    const filterWitch    = { address: gameAddress, topics: [topicWitchActed] } as any;

    provider.on(filterResolved, onNightResolved);
    provider.on(filterWitch, onWitchActed);

    // Initial pull of latest NightResolved
    (async () => {
      try {
        const latest = await provider.getBlockNumber();
        const from = Math.max(0, latest - 50000);
        const logs = await provider.getLogs({ address: gameAddress, topics: [topicNightResolved], fromBlock: from, toBlock: latest });
        if (logs.length > 0) {
          const last = logs[logs.length - 1];
          const [victim] = ethers.AbiCoder.defaultAbiCoder().decode(['uint8'], last.data);
          setVictimThisNight(Number(victim));
        }
      } catch { /* ignore */ }
    })();

    return () => {
      try { provider.off(filterResolved, onNightResolved); } catch {}
      try { provider.off(filterWitch, onWitchActed); } catch {}
    };
  }, [provider, gameAddress]);

  // Clear "wolf kill this night" at start of new day
  useEffect(() => { setVictimThisNight(255); }, [dayCount]);

  // ==== Validation ====
  const checkSeatRange = (seat: number) => {
    if (!(Number.isInteger(seat) && seat >= 0 && seat < seatsCount)) {
      throw new Error(`seat out of range: should be in [0, ${Math.max(0, seatsCount - 1)}]`);
    }
  };

  // ==== Wolf actions ====
  const doWolfCommit = async () => {
    try {
      if (!joined || !isWolf) throw new Error('Your role is not wolf or not joined');
      checkSeatRange(commitTarget);
      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);

      const saltHex32 = isHex32(salt) ? salt : ethers.hexlify(ethers.randomBytes(32));
      const h = encodeCommit(gameAddress, dayCount, commitTarget, saltHex32);
      await (await gw.submitWolfCommit(h)).wait();

      localStorage.setItem(keySalt(gameAddress, account, dayCount), saltHex32);
      localStorage.setItem(keyCommitTarget(gameAddress, account, dayCount), String(commitTarget));
      setSalt(saltHex32);
      setCommittedTarget(commitTarget);
      setStatus(`Committed. salt=${saltHex32}(reveal will auto-use #${commitTarget}）`);
    } catch (e: any) { setStatus(e.message || String(e)); }
  };

  // 🚀 Auto reveal: directly use saved salt  target from commit (isolated by account)
  const doWolfRevealAuto = async () => {
    try {
      if (!joined || !isWolf) throw new Error('Your role is not wolf or not joined');

      const savedSalt = salt || localStorage.getItem(keySalt(gameAddress, account, dayCount)) || '';
      if (!isHex32(savedSalt)) throw new Error('Cannot find salt for this commit (or incorrect format), cannot auto-reveal');

      const savedTargetStr =
        committedTarget != null ? String(committedTarget) :
        localStorage.getItem(keyCommitTarget(gameAddress, account, dayCount));
      if (savedTargetStr == null) throw new Error('Cannot find commit target for this night, cannot auto-reveal');
      const savedTarget = Number(savedTargetStr);
      checkSeatRange(savedTarget);

      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
      await (await gw.submitWolfReveal(savedTarget, savedSalt as `0x${string}`)).wait();
      setStatus(`Revealed (auto-used target consistent with commit #${savedTarget}）`);
    } catch (e: any) { setStatus(e.message || String(e)); }
  };

  // ==== Seer ====
  const doSeer = async () => {
    try {
      if (!joined || !isSeer) throw new Error('Your role is not seer or not joined');
      checkSeatRange(seerTarget);
      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
      await (await gw.seerCheck(seerTarget)).wait();
      setStatus('SeerCheck submitted (result will be returned via logs)');
    } catch (e: any) { setStatus(e.message || String(e)); }
  };

  // ==== Witch ====
  const doWitch = async () => {
    try {
      if (!joined || !isWitch) throw new Error('Your role is not witch or not joined');
      if (nightUsed) throw new Error('You have already used ability this night');
      if (witchAction === 1) {
        if (!hasAnti) throw new Error('No antidote available');
        if (!(victimThisNight >= 0 && victimThisNight < seatsCount)) throw new Error('Currently unknown wolf kill or no one killed, cannot save');
      }
      if (witchAction === 2) {
        if (!hasPois) throw new Error('No poison available');
        checkSeatRange(witchTarget);
        const sv = await game!.seats(witchTarget);
        if (!sv.alive) throw new Error('Target is dead, cannot use poison on dead players');
      }

      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
      await (await gw.witchAct(witchAction, witchTarget)).wait();
      setStatus('Witch action submitted, attempting auto-resolve in 1s...');

      // Auto-attempt resolve after 1s (not waiting for deadline, only one attempt)
      setTimeout(async () => {
        try {
          // Skip if phase already advanced by others
          const pNow = Number(await game!.phase());
          if (pNow !== 7) return;

          const gwr = new ethers.Contract(gameAddress, GAME_ABI, signer);
          await (await gwr.resolveWitch()).wait();
          setStatus('Auto-resolved witch phase, entering day vote.');
          refresh();
        } catch (err: any) {
          // Possibly too early (contract requires past deadline) or already resolved by others
          const msg = err?.reason || err?.message || String(err);
          setStatus(`Auto-resolve attempt failed:${msg}`);
        }
      }, 1000);
    } catch (e: any) { setStatus(e.message || String(e)); }
  };

  // —— Top identity display —— //
  let identityText = '(Loading/invisible)';
  if (!joined) identityText = '(Not joined)';
  else if (phase < 2 || Number(dayCount) === 0) identityText = '(Identity not assigned)';
  else identityText = myRole != null ? ROLE_NAMES[myRole] : '(Loading)';

  // Styles
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'start' }}>
      {/* Left: Main Content */}
      <div style={{ display: 'grid', gap: 16 }}>

      {/* NightCommit */}
      {phase === 2 && (
        <div style={section}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>NightCommit</div>

          {/* Wolf: Must be joined and actually wolf */}
          {joined && isWolf && (
            <>
              <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>Wolf commit:</div>
              <div style={row}>
                <input
                  placeholder="Target seat (0-based)"
                  value={commitTarget}
                  onChange={(e) => setCommitTarget(Number(e.target.value) || 0)}
                  style={inputStyle}
                />
                <input
                  placeholder="Salt (0x...32 bytes, leave empty to auto-generate)"
                  value={salt}
                  onChange={(e) => setSalt(e.target.value)}
                  style={{ ...inputStyle, minWidth: 300 }}
                />
                <button onClick={doWolfCommit} style={btnPrimary}>Submit Commit</button>
              </div>
              {committedTarget != null && (
                <div style={{ marginTop: 12, fontSize: 13, color: '#065f46', padding: 10, background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac' }}>
                  ✓ Commit target recorded this night: <b>#{committedTarget}</b> (will auto-use in reveal phase)
                </div>
              )}
            </>
          )}

          {/* Seer：Must be joined and actuallySeer */}
          {joined && isSeer && (
            <>
              <div style={{ fontSize: 14, color: '#666', marginBottom: 12, marginTop: joined && isWolf ? 16 : 0 }}>Seer Check:</div>
              <div style={row}>
                <input
                  placeholder="Target seat (0-based)"
                  value={seerTarget}
                  onChange={(e) => setSeerTarget(Number(e.target.value) || 0)}
                  style={inputStyle}
                />
                <button onClick={doSeer} style={btnPrimary}>Seer Check</button>
              </div>
              {(seerLastSeat != null) && (
                <div style={{ marginTop: 12, fontSize: 13, color: '#065f46', padding: 10, background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac' }}>
                  ✓ Latest check this night: <b>#{seerLastSeat}</b> → <b>{seerLastFaction === 1 ? 'Wolf faction' : 'Villager faction'}</b>
                </div>
              )}
            </>
          )}

          {/* Fallback: Not joined or not wolf/seer */}
          {(!joined || (!isWolf && !isSeer)) && (
            <div style={{ marginTop: 12, fontSize: 14, color: '#666', padding: 12, background: '#f9fafb', borderRadius: 8 }}>
              You have no actions in this phase. Please wait for host to advance.
            </div>
          )}
        </div>
      )}

      {/* NightReveal */}
      {phase === 3 && (
        <div style={section}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>NightReveal</div>

          {joined && isWolf ? (
            <>
              <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>Wolf reveal (auto):</div>
              <div style={row}>
                <button onClick={doWolfRevealAuto} style={btnPrimary}>Submit Reveal (Auto-use target from commit)</button>
              </div>
              {committedTarget != null && (
                <div style={{ marginTop: 12, fontSize: 13, color: '#065f46', padding: 10, background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac' }}>
                  ✓ Recorded commit target: <b>#{committedTarget}</b>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 14, color: '#666', padding: 12, background: '#f9fafb', borderRadius: 8 }}>
              Not wolf or not joined. No actions in this phase. Please wait for host to advance.
            </div>
          )}
        </div>
      )}

      {/* NightWitch */}
      {phase === 7 && (
        <div style={section}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>NightWitch</div>

          {joined && isWitch ? (
            <>
              <div style={{ marginBottom: 16, fontSize: 13, color: '#666', padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                <div style={{ marginBottom: 8 }}>
                  Tonight wolf kill: {victimThisNight === 255 ? <b>(none / unknown)</b> : <>#<b>{victimThisNight}</b> ({victimAlive ? 'Still alive, can be saved' : 'Dead or unknown'})</>}
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span>Antidote: <b style={{ color: hasAnti ? '#065f46' : '#666' }}>{hasAnti ? 'Yes' : 'None'}</b></span>
                  <span>Poison: <b style={{ color: hasPois ? '#065f46' : '#666' }}>{hasPois ? 'Yes' : 'None'}</b></span>
                  <span>Used this night: <b style={{ color: nightUsed ? '#dc2626' : '#666' }}>{nightUsed ? 'Yes' : 'No'}</b></span>
                </div>
              </div>

              <div style={row}>
                <select value={witchAction} onChange={(e) => setWitchAction(Number(e.target.value))} style={{ ...inputStyle, minWidth: 140 }}>
                  <option value={0}>Skip (0)</option>
                  <option value={1}>Save (1)</option>
                  <option value={2}>Poison (2)</option>
                </select>
                <input
                  placeholder="Target seat (only needed for poison)"
                  value={witchTarget}
                  onChange={(e) => setWitchTarget(Number(e.target.value) || 0)}
                  style={inputStyle}
                />
                <button
                  onClick={doWitch}
                  style={btnPrimary}
                  disabled={
                    nightUsed ||
                    (witchAction === 1 && (!hasAnti || !(victimThisNight >= 0 && victimThisNight < seatsCount))) ||
                    (witchAction === 2 && !hasPois)
                  }
                  title={
                    nightUsed ? 'Already used ability this night' :
                    (witchAction === 1 && !hasAnti) ? 'No antidote' :
                    (witchAction === 1 && !(victimThisNight >= 0 && victimThisNight < seatsCount)) ? 'Unknown wolf kill or no one killed tonight, cannot save' :
                    (witchAction === 2 && !hasPois) ? 'No poison' : ''
                  }
                >
                  Witch Act
                </button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 14, color: '#666', padding: 12, background: '#f9fafb', borderRadius: 8 }}>
              Not witch or not joined. No actions in this phase. Please wait for host to advance.
            </div>
          )}
        </div>
      )}

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
      {myRole !== null && getRoleImage(myRole) && joined && phase >= 2 && Number(dayCount) > 0 && (
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

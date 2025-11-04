'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { GAME_ABI, ROLE_NAMES } from '@/lib/gameAbi';
import { getBrowserProvider, getSignerRequired } from '@/lib/ethersHelpers';

/** 计算与合约一致的 commit：keccak256(abi.encode(address(this), dayCount, targetSeat, salt)) */
function encodeCommit(gameAddr: string, day: bigint, target: number, saltHex32: string) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(['address', 'uint64', 'uint8', 'bytes32'], [gameAddr, day, target, saltHex32]);
  return ethers.keccak256(encoded);
}

/** 校验 0x 开头 32 字节盐 */
function isHex32(s: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

/** 本地存储 key（按账号隔离，避免串号） */
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

  // 基本状态
  const [account, setAccount] = useState<string>('');
  const [phase, setPhase] = useState<number>(0);
  const [dayCount, setDayCount] = useState<bigint>(0n);
  const [seatsCount, setSeatsCount] = useState<number>(0);
  const [joined, setJoined] = useState<boolean>(false);

  // 角色与面板
  const [myRole, setMyRole] = useState<number | null>(null);
  const isWolf = myRole === 1;
  const isSeer = myRole === 2;
  const isWitch = myRole === 4;

  // 狼：commit/reveal
  const [commitTarget, setCommitTarget] = useState<number>(0);
  const [salt, setSalt] = useState<string>(''); // 本地持久化
  const [committedTarget, setCommittedTarget] = useState<number | null>(null); // 从本地恢复

  // 预言家
  const [seerTarget, setSeerTarget] = useState<number>(0);
  const [seerLastSeat, setSeerLastSeat] = useState<number | null>(null);
  const [seerLastFaction, setSeerLastFaction] = useState<number | null>(null); // 0=Good, 1=Wolves

  // 女巫（ABI 无 nightVictim → 用日志推断）
  const [witchAction, setWitchAction] = useState<number>(0); // 0=跳过, 1=解救, 2=投毒
  const [witchTarget, setWitchTarget] = useState<number>(0);
  const [victimThisNight, setVictimThisNight] = useState<number>(255);
  const [hasAnti, setHasAnti] = useState<boolean>(false);
  const [hasPois, setHasPois] = useState<boolean>(false);
  const [nightUsed, setNightUsed] = useState<boolean>(false);
  const [victimAlive, setVictimAlive] = useState<boolean>(false);

  const [status, setStatus] = useState<string>('');

  // ==== 初始化账号 ====
  useEffect(() => {
    if (!provider) return;
    (async () => {
      try {
        await provider.send('eth_requestAccounts', []);
        const s = await provider.getSigner();
        setAccount(await s.getAddress());
      } finally {
        refresh(); // 首次刷新
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // 切换游戏地址/账号时，清空身份与缓存（避免残留）
  useEffect(() => {
    setMyRole(null);
    setJoined(false);
    setSeerLastSeat(null);
    setSeerLastFaction(null);
    setCommittedTarget(null);
    setSalt('');
    setVictimThisNight(255);
  }, [gameAddress, account]);

  // ==== 基础刷新 ====
  const refresh = async () => {
    if (!game) return;
    const [pRaw, dRaw, nRaw] = await Promise.all([game.phase(), game.dayCount(), game.seatsCount()]);
    const p = Number(pRaw);
    const d = dRaw as bigint;
    const n = Number(nRaw);
    setPhase(p);
    setDayCount(d);
    setSeatsCount(n);

    // 是否加入
    let seat1 = 0;
    if (account) {
      try { seat1 = Number(await game.seatOf(account)); } catch {}
    }
    const isJoined = seat1 > 0;
    setJoined(isJoined);

    // 读取身份（严格条件）：加入 && 已分配（phase≥2 且 dayCount>0）
    if (isJoined && p >= 2 && Number(d) > 0) {
      try {
        const signer = await provider!.getSigner(); // 用 signer，确保 msg.sender == 我
        const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
        const r: number = Number(await gw.roleOf(account));
        setMyRole(r);
      } catch {
        setMyRole(null); // 失败清空，避免残留
      }
    } else {
      setMyRole(null); // 未加入或未分配，一律清空
    }

    // 女巫自状态
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

    // victim 存活性
    if (victimThisNight >= 0 && victimThisNight < n) {
      try {
        const sv = await game.seats(victimThisNight);
        setVictimAlive(Boolean(sv.alive));
      } catch { setVictimAlive(false); }
    } else {
      setVictimAlive(false);
    }

    // 预言家本地缓存
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

    // 恢复自动 reveal 所需（按账号隔离）
    if (gameAddress && d && account) {
      const saltSaved = localStorage.getItem(keySalt(gameAddress, account, d));
      if (saltSaved && isHex32(saltSaved)) setSalt(saltSaved);
      const targetSaved = localStorage.getItem(keyCommitTarget(gameAddress, account, d));
      setCommittedTarget(targetSaved != null ? Number(targetSaved) : null);
    }
  };

  // ==== 订阅原始日志：SeerChecked（只接收发给自己的） ====
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
        setStatus(`查验结果：#${seatNum} => ${facNum === 1 ? '狼人阵营' : '好人阵营'}`);
      } catch { /* ignore */ }
    };

    provider.on(filter, handleLog);
    return () => { try { provider.off(filter, handleLog); } catch {} };
  }, [provider, gameAddress, account, dayCount]);

  // ==== NightResolved / WitchActed：推断当夜狼刀 ====
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
        // WitchActed 的 data 只包含非 indexed 的两个 uint8
        const [actionType] = ethers.AbiCoder.defaultAbiCoder().decode(['uint8','uint8'], log.data);
        if (Number(actionType) === 1) setVictimThisNight(255); // 解救后清空
      } catch { /* ignore */ }
    };

    const filterResolved = { address: gameAddress, topics: [topicNightResolved] } as any;
    const filterWitch    = { address: gameAddress, topics: [topicWitchActed] } as any;

    provider.on(filterResolved, onNightResolved);
    provider.on(filterWitch, onWitchActed);

    // 初始补拉最近一次 NightResolved
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

  // 新一天开始时清空“当夜狼刀”
  useEffect(() => { setVictimThisNight(255); }, [dayCount]);

  // ==== 校验 ====
  const checkSeatRange = (seat: number) => {
    if (!(Number.isInteger(seat) && seat >= 0 && seat < seatsCount)) {
      throw new Error(`seat 超出范围：应在 [0, ${Math.max(0, seatsCount - 1)}]`);
    }
  };

  // ==== 狼动作 ====
  const doWolfCommit = async () => {
    try {
      if (!joined || !isWolf) throw new Error('你的身份不是狼人或未加入');
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
      setStatus(`已提交 commit。salt=${saltHex32}（reveal 将自动使用 #${commitTarget}）`);
    } catch (e: any) { setStatus(e.message || String(e)); }
  };

  // 🚀 自动 reveal：直接使用 commit 时保存的 salt & target（按账号隔离）
  const doWolfRevealAuto = async () => {
    try {
      if (!joined || !isWolf) throw new Error('你的身份不是狼人或未加入');

      const savedSalt = salt || localStorage.getItem(keySalt(gameAddress, account, dayCount)) || '';
      if (!isHex32(savedSalt)) throw new Error('未找到与本夜 commit 对应的 salt（或格式不正确），无法自动 reveal');

      const savedTargetStr =
        committedTarget != null ? String(committedTarget) :
        localStorage.getItem(keyCommitTarget(gameAddress, account, dayCount));
      if (savedTargetStr == null) throw new Error('未找到本夜的 commit 目标，无法自动 reveal');
      const savedTarget = Number(savedTargetStr);
      checkSeatRange(savedTarget);

      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
      await (await gw.submitWolfReveal(savedTarget, savedSalt as `0x${string}`)).wait();
      setStatus(`已揭示（自动使用与 commit 一致的目标 #${savedTarget}）`);
    } catch (e: any) { setStatus(e.message || String(e)); }
  };

  // ==== 预言家 ====
  const doSeer = async () => {
    try {
      if (!joined || !isSeer) throw new Error('你的身份不是预言家或未加入');
      checkSeatRange(seerTarget);
      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
      await (await gw.seerCheck(seerTarget)).wait();
      setStatus('预言家查验已提交（结果会通过日志回传）');
    } catch (e: any) { setStatus(e.message || String(e)); }
  };

  // ==== 女巫 ====
  const doWitch = async () => {
    try {
      if (!joined || !isWitch) throw new Error('你的身份不是女巫或未加入');
      if (nightUsed) throw new Error('你本夜已使用过能力');
      if (witchAction === 1) {
        if (!hasAnti) throw new Error('没有解药可用');
        if (!(victimThisNight >= 0 && victimThisNight < seatsCount)) throw new Error('当前未知当夜狼刀或无人被刀，无法解救');
      }
      if (witchAction === 2) {
        if (!hasPois) throw new Error('没有毒药可用');
        checkSeatRange(witchTarget);
        const sv = await game!.seats(witchTarget);
        if (!sv.alive) throw new Error('目标已死亡，不能对已死亡玩家使用毒药');
      }

      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
      await (await gw.witchAct(witchAction, witchTarget)).wait();
      setStatus('女巫行动已提交，1 秒后尝试自动结算…');

      // 1 秒后自动尝试结算（不等 deadline，只尝试一次）
      setTimeout(async () => {
        try {
          // 若阶段已被他人推进，则跳过
          const pNow = Number(await game!.phase());
          if (pNow !== 7) return;

          const gwr = new ethers.Contract(gameAddress, GAME_ABI, signer);
          await (await gwr.resolveWitch()).wait();
          setStatus('已自动结算女巫阶段，进入白天投票。');
          refresh();
        } catch (err: any) {
          // 可能 too early（合约要求过 deadline）、或已被他人结算
          const msg = err?.reason || err?.message || String(err);
          setStatus(`自动结算尝试失败：${msg}`);
        }
      }, 1000);
    } catch (e: any) { setStatus(e.message || String(e)); }
  };

  // —— 顶部身份展示 —— //
  let identityText = '（读取中/不可见）';
  if (!joined) identityText = '（未加入）';
  else if (phase < 2 || Number(dayCount) === 0) identityText = '（身份尚未分配）';
  else identityText = myRole != null ? ROLE_NAMES[myRole] : '（读取中）';

  // 样式
  const section: React.CSSProperties = { border: '1px solid #eee', borderRadius: 12, padding: 12 };
  const row: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };
  const inputStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #e3e3e8', borderRadius: 10 };
  const btn: React.CSSProperties = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 10, background: '#fff', cursor: 'pointer' };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>我的身份：<b>{identityText}</b></div>

      {/* NightCommit */}
      {phase === 2 && (
        <div style={section}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>NightCommit</div>

          {/* 狼人：必须已加入且真的是狼 */}
          {joined && isWolf && (
            <>
              <div>狼人 commit：</div>
              <div style={row}>
                <input
                  placeholder="target seat (uint8, 0-based)"
                  value={commitTarget}
                  onChange={(e) => setCommitTarget(Number(e.target.value) || 0)}
                  style={inputStyle}
                />
                <input
                  placeholder="salt 0x..(32字节) 可留空自动生成"
                  value={salt}
                  onChange={(e) => setSalt(e.target.value)}
                  style={{ ...inputStyle, minWidth: 280 }}
                />
                <button onClick={doWolfCommit} style={btn}>提交 commit</button>
              </div>
              {committedTarget != null && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#444' }}>
                  本夜已记录的 commit 目标：#<b>{committedTarget}</b>（reveal 阶段将自动使用）
                </div>
              )}
            </>
          )}

          {/* 预言家：必须已加入且真的是预言家 */}
          {joined && isSeer && (
            <>
              <div style={{ marginTop: 10 }}>预言家查验：</div>
              <div style={row}>
                <input
                  placeholder="target seat (uint8)"
                  value={seerTarget}
                  onChange={(e) => setSeerTarget(Number(e.target.value) || 0)}
                  style={inputStyle}
                />
                <button onClick={doSeer} style={btn}>seerCheck</button>
              </div>
              {(seerLastSeat != null) && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#065f46' }}>
                  本夜最近查验：#{seerLastSeat} → <b>{seerLastFaction === 1 ? '狼人阵营' : '好人阵营'}</b>
                </div>
              )}
            </>
          )}

          {/* 兜底：未加入或非狼/非预言家 */}
          {(!joined || (!isWolf && !isSeer)) && (
            <div style={{ marginTop: 8, color: '#666' }}>你在本阶段无可执行操作，请等待 host 推进。</div>
          )}
        </div>
      )}

      {/* NightReveal */}
      {phase === 3 && (
        <div style={section}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>NightReveal</div>

          {joined && isWolf ? (
            <>
              <div>狼人 reveal（自动）：</div>
              <div style={row}>
                <button onClick={doWolfRevealAuto} style={btn}>提交 reveal（自动使用与 commit 一致的 target）</button>
              </div>
              {committedTarget != null && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#444' }}>
                  已记录的 commit 目标：#<b>{committedTarget}</b>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: '#666' }}>非狼人或未加入，本阶段无可执行操作。请等待 host 推进。</div>
          )}
        </div>
      )}

      {/* NightWitch */}
      {phase === 7 && (
        <div style={section}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>NightWitch</div>

          {joined && isWitch ? (
            <>
              <div style={{ marginBottom: 8, fontSize: 13 }}>
                今晚狼刀：{victimThisNight === 255 ? <b>（无 / 未知）</b> : <>#<b>{victimThisNight}</b>（{victimAlive ? '当前仍存活，可被解救' : '已死亡或未知'}）</>}
                <span style={{ marginLeft: 10 }}>
                  解药：<b>{hasAnti ? '有' : '无'}</b>；毒药：<b>{hasPois ? '有' : '无'}</b>；本夜已用：<b>{nightUsed ? '是' : '否'}</b>
                </span>
              </div>

              <div style={row}>
                <select value={witchAction} onChange={(e) => setWitchAction(Number(e.target.value))} style={inputStyle}>
                  <option value={0}>跳过(0)</option>
                  <option value={1}>解救(1)</option>
                  <option value={2}>投毒(2)</option>
                </select>
                <input
                  placeholder="target seat（仅投毒时需要）"
                  value={witchTarget}
                  onChange={(e) => setWitchTarget(Number(e.target.value) || 0)}
                  style={inputStyle}
                />
                <button
                  onClick={doWitch}
                  style={btn}
                  disabled={
                    nightUsed ||
                    (witchAction === 1 && (!hasAnti || !(victimThisNight >= 0 && victimThisNight < seatsCount))) ||
                    (witchAction === 2 && !hasPois)
                  }
                  title={
                    nightUsed ? '本夜已使用过能力' :
                    (witchAction === 1 && !hasAnti) ? '没有解药' :
                    (witchAction === 1 && !(victimThisNight >= 0 && victimThisNight < seatsCount)) ? '今晚未知狼刀或无人被刀，无法解救' :
                    (witchAction === 2 && !hasPois) ? '没有毒药' : ''
                  }
                >
                  witchAct
                </button>
              </div>
            </>
          ) : (
            <div style={{ color: '#666' }}>非女巫或未加入，本阶段无可执行操作。请等待 host 推进。</div>
          )}
        </div>
      )}

      {status && <div style={{ border: '1px solid #eee', padding: 10, borderRadius: 12 }}>{status}</div>}
    </div>
  );
}

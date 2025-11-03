// File: src/components/PlayerNight.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { GAME_ABI, ROLE_NAMES } from '@/lib/gameAbi';
import { getBrowserProvider, getSignerRequired } from '@/lib/ethersHelpers';

/** 计算与合约一致的 commit：keccak256(abi.encode(address(this), dayCount, targetSeat, salt)) */
function encodeCommit(gameAddr: string, day: bigint, target: number, saltHex32: string) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(
    ['address', 'uint64', 'uint8', 'bytes32'],
    [gameAddr, day, target, saltHex32]
  );
  return ethers.keccak256(encoded);
}

/** 校验 0x 开头 32 字节盐 */
function isHex32(s: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

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

  // 角色与面板
  const [myRole, setMyRole] = useState<number | null>(null);
  const isWolf = myRole === 1;
  const isSeer = myRole === 2;
  const isWitch = myRole === 4;

  // 狼：commit/reveal 输入
  const [commitTarget, setCommitTarget] = useState<number>(0);
  const [salt, setSalt] = useState<string>(''); // 本地持久化
  const [revealTarget, setRevealTarget] = useState<number>(0);

  // 预言家
  const [seerTarget, setSeerTarget] = useState<number>(0);

  // 女巫
  const [witchAction, setWitchAction] = useState<number>(0); // 0=跳过, 1=解救, 2=投毒
  const [witchTarget, setWitchTarget] = useState<number>(0);

  // UI 提示
  const [status, setStatus] = useState<string>('');

  // 读取基础链上信息
  const refresh = async () => {
    if (!game) return;
    const [pRaw, dRaw, nRaw] = await Promise.all([game.phase(), game.dayCount(), game.seatsCount()]);
    setPhase(Number(pRaw));
    setDayCount(dRaw as bigint);           // ✅ ethers v6 返回 bigint，直接用
    setSeatsCount(Number(nRaw));
    if (account) {
      try {
        const r = await game.roleOf(account); // 未结束只能查自己；失败则忽略
        setMyRole(Number(r));
      } catch {
        // ignore
      }
    }
  };

  // 初始化账号，并首次刷新
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
  }, [provider]);

  // 从 localStorage 恢复盐（按 game + dayCount）
  useEffect(() => {
    if (!gameAddress || !dayCount) return;
    const saved = localStorage.getItem(`${gameAddress}:salt:${dayCount.toString()}`);
    if (saved && isHex32(saved)) setSalt(saved);
  }, [gameAddress, dayCount]);

  // 基础 seat 范围校验
  const checkSeatRange = (seat: number) => {
    if (!(seat >= 0 && seat < seatsCount)) {
      throw new Error(`seat 超出范围：应在 [0, ${Math.max(0, seatsCount - 1)}]`);
    }
  };

  // === 动作 ===
  const doWolfCommit = async () => {
    try {
      if (!isWolf) throw new Error('你的身份不是狼人');
      checkSeatRange(commitTarget);

      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);

      const saltHex32 = isHex32(salt) ? salt : ethers.hexlify(ethers.randomBytes(32));
      const h = encodeCommit(gameAddress, dayCount, commitTarget, saltHex32);

      await (await gw.submitWolfCommit(h)).wait();

      // 持久化盐（按天）
      localStorage.setItem(`${gameAddress}:salt:${dayCount.toString()}`, saltHex32);
      setSalt(saltHex32);
      setStatus(`已提交 commit。请保存盐值：${saltHex32}`);
    } catch (e: any) {
      setStatus(e.message || String(e));
    }
  };

  const doWolfReveal = async () => {
    try {
      if (!isWolf) throw new Error('你的身份不是狼人');
      checkSeatRange(revealTarget);

      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);

      const saved =
        salt ||
        localStorage.getItem(`${gameAddress}:salt:${dayCount.toString()}`) ||
        '';
      if (!isHex32(saved)) {
        throw new Error('请提供与 commit 时相同的盐（0x 开头的 32 字节）');
      }

      await (await gw.submitWolfReveal(revealTarget, saved)).wait();
      setStatus('已揭示（reveal 成功）');
    } catch (e: any) {
      setStatus(e.message || String(e));
    }
  };

  const doSeer = async () => {
    try {
      if (!isSeer) throw new Error('你的身份不是预言家');
      checkSeatRange(seerTarget);

      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
      await (await gw.seerCheck(seerTarget)).wait();
      setStatus('预言家查验已提交（结果通过事件返回）');
    } catch (e: any) {
      setStatus(e.message || String(e));
    }
  };

  const doWitch = async () => {
    try {
      if (!isWitch) throw new Error('你的身份不是女巫');
      if (witchAction === 2) {
        // 投毒需要 seat
        checkSeatRange(witchTarget);
      }

      const signer = await getSignerRequired();
      const gw = new ethers.Contract(gameAddress, GAME_ABI, signer);
      await (await gw.witchAct(witchAction, witchTarget)).wait();
      setStatus('女巫行动已提交');
    } catch (e: any) {
      setStatus(e.message || String(e));
    }
  };

  // 样式
  const section: React.CSSProperties = { border: '1px solid #eee', borderRadius: 12, padding: 12 };
  const row: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };
  const inputStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #e3e3e8', borderRadius: 10 };
  const btn: React.CSSProperties = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 10, background: '#fff', cursor: 'pointer' };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>我的身份：<b>{myRole != null ? ROLE_NAMES[myRole] : '（读取中/不可见）'}</b></div>

      {/* NightCommit: 狼 commit + 预言家查验 */}
      {phase === 2 && (
        <div style={section}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>NightCommit</div>

          {isWolf && (
            <>
              <div>狼人 commit：</div>
              <div style={row}>
                <input
                  placeholder="target seat (uint8)"
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
            </>
          )}

          {isSeer && (
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
            </>
          )}

          {!isWolf && !isSeer && (
            <div style={{ marginTop: 8, color: '#666' }}>你在本阶段无可执行操作，请等待。</div>
          )}
        </div>
      )}

      {/* NightReveal: 狼 reveal */}
      {phase === 3 && (
        <div style={section}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>NightReveal</div>

          {isWolf ? (
            <>
              <div>狼人 reveal：</div>
              <div style={row}>
                <input
                  placeholder="target seat"
                  value={revealTarget}
                  onChange={(e) => setRevealTarget(Number(e.target.value) || 0)}
                  style={inputStyle}
                />
                <input
                  placeholder="salt 0x..(32字节)（必须与 commit 时一致）"
                  value={salt}
                  onChange={(e) => setSalt(e.target.value)}
                  style={{ ...inputStyle, minWidth: 280 }}
                />
                <button onClick={doWolfReveal} style={btn}>提交 reveal</button>
              </div>
            </>
          ) : (
            <div style={{ color: '#666' }}>非狼人，无可执行操作。</div>
          )}
        </div>
      )}

      {/* NightWitch: 女巫行动 */}
      {phase === 7 && (
        <div style={section}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>NightWitch</div>

          {isWitch ? (
            <div style={row}>
              <select
                value={witchAction}
                onChange={(e) => setWitchAction(Number(e.target.value))}
                style={inputStyle}
              >
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
              <button onClick={doWitch} style={btn}>witchAct</button>
            </div>
          ) : (
            <div style={{ color: '#666' }}>非女巫，无可执行操作。</div>
          )}
        </div>
      )}

      {status && (
        <div style={{ border: '1px solid #eee', padding: 10, borderRadius: 12 }}>{status}</div>
      )}
    </div>
  );
}

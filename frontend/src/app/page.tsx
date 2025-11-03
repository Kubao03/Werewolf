'use client';

import React from 'react';
import { ethers } from 'ethers';
import GameHeader from '@/components/GameHeader';
import PlayerNight from '@/components/PlayerNight';
import PlayerDay from '@/components/PlayerDay';
import PlayerHunter from '@/components/PlayerHunter';
import PlayerEnd from '@/components/PlayerEnd';
import { GAME_ABI, PHASE_NAMES, ROLE_NAMES } from '@/lib/gameAbi';

// 轻量 ethers provider
function useBrowserProvider() {
  const [provider, setProvider] = React.useState<ethers.BrowserProvider | null>(null);
  React.useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      setProvider(new ethers.BrowserProvider((window as any).ethereum));
    }
  }, []);
  return provider;
}

export default function PlayerAllInOnePage() {
  const provider = useBrowserProvider();

  // ------- 全局状态：地址/账号/链ID/提示 -------
  const [account, setAccount] = React.useState<string>('');
  const [chainId, setChainId] = React.useState<number | null>(null);
  const [gameAddress, setGameAddress] = React.useState<string>('');
  const [phase, setPhase] = React.useState<number>(0);
  const [message, setMessage] = React.useState<string>('');
  const [msgType, setMsgType] = React.useState<'ok' | 'err' | 'muted' | ''>('');

  const toast = (s: string, t: 'ok' | 'err' | 'muted' | '' = '') => {
    setMessage(s); setMsgType(t);
  };

  // ------- 连接钱包 -------
  const connect = async () => {
    try {
      if (!provider) throw new Error('请安装/启用 MetaMask');
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      setAccount(await signer.getAddress());
      const net = await provider.getNetwork();
      setChainId(Number(net.chainId));
      toast('已连接钱包。', 'ok');
    } catch (e: any) {
      toast(e.message || String(e), 'err');
    }
  };

  // ------- 读取配置 + 监听 phase 变化 -------
  const loadOnce = async () => {
    try {
      if (!provider) throw new Error('请先连接钱包');
      if (!ethers.isAddress(gameAddress)) throw new Error('请输入有效的 WerewolfGame 地址');
      const game = new ethers.Contract(gameAddress, GAME_ABI, provider);
      const p = Number(await game.phase());
      setPhase(p);
      toast('已加载房间信息。', 'ok');
    } catch (e: any) { toast(e.message || String(e), 'err'); }
  };

  // 轮询 phase（3s）
  React.useEffect(() => {
    if (!provider || !ethers.isAddress(gameAddress)) return;
    let timer: any;
    const loop = async () => {
      try {
        const game = new ethers.Contract(gameAddress, GAME_ABI, provider);
        const p = Number(await game.phase());
        setPhase(p);
      } catch { /* ignore */ }
      timer = setTimeout(loop, 3000);
    };
    loop();
    return () => clearTimeout(timer);
  }, [provider, gameAddress]);

  // 监听账户/链切换
  React.useEffect(() => {
    const eth = (typeof window !== 'undefined' && (window as any).ethereum) || null;
    if (!eth) return;
    const onAcc = (accs: string[]) => setAccount(accs?.[0] || '');
    const onChain = () => {
      if (!provider) return;
      provider.getNetwork().then(n => setChainId(Number(n.chainId)));
    };
    eth.on?.('accountsChanged', onAcc);
    eth.on?.('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAcc);
      eth.removeListener?.('chainChanged', onChain);
    };
  }, [provider]);

  // ------- 单页内的 Join 与“查看我的身份” -------
  const join = async () => {
    try {
      if (!provider) throw new Error('请连接钱包');
      if (!ethers.isAddress(gameAddress)) throw new Error('请输入有效的 WerewolfGame 地址');
      const signer = await provider.getSigner();
      const game = new ethers.Contract(gameAddress, GAME_ABI, signer);
      const cfg = await game.cfg();
      const stake: bigint = BigInt(cfg.stake);
      toast('发送 join 交易中…');
      const tx = await game.join({ value: stake });
      await tx.wait();
      toast('加入成功！', 'ok');
      await loadOnce(); // 刷新 phase 等
    } catch (e: any) { toast(e.message || String(e), 'err'); }
  };

  const viewMyRole = async () => {
    try {
      if (!provider) throw new Error('请连接钱包');
      if (!account) throw new Error('未连接账号');
      if (!ethers.isAddress(gameAddress)) throw new Error('请输入有效的 WerewolfGame 地址');
      const game = new ethers.Contract(gameAddress, GAME_ABI, provider);
      const r: number = await game.roleOf(account); // 未结束只能查自己
      toast(`你的身份：${ROLE_NAMES[r as 0|1|2|3|4] ?? `Unknown(${r})`}`, 'ok');
    } catch (e: any) { toast(e.message || String(e), 'err'); }
  };

  // ------- 样式（内联，免 Tailwind） -------
  const card: React.CSSProperties = { border: '1px solid #eee', borderRadius: 16, padding: 16, background: '#fafafa' };
  const btn: React.CSSProperties = { padding: '10px 14px', borderRadius: 12, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' };
  const btnDisabled: React.CSSProperties = { ...btn, opacity: 0.6, cursor: 'not-allowed' };
  const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' };

  const canAct = provider && ethers.isAddress(gameAddress);

  return (
    <main style={{ minHeight: '100dvh' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: 24, display: 'grid', gap: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>🐺 WerewolfGame — 玩家单页</h1>

        {/* 顶部：钱包与地址 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={connect} style={btn}>{account ? '已连接' : '连接钱包'}</button>
          <div style={{ fontSize: 14, color: '#666', wordBreak: 'break-all' }}>
            {account ? `地址：${account}` : '未连接'}
            {chainId !== null && <span style={{ marginLeft: 8 }}>链 ID：{chainId}</span>}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontWeight: 600 }}>WerewolfGame 合约地址</label>
          <input
            placeholder="0x... 合约地址"
            value={gameAddress}
            onChange={(e) => setGameAddress(e.target.value.trim())}
            style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #e3e3e8' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={loadOnce} style={btn}>读取配置</button>
            <button onClick={join} style={canAct ? btn : btnDisabled} disabled={!canAct}>Join</button>
            <button onClick={viewMyRole} style={canAct ? btn : btnDisabled} disabled={!canAct}>查看我的身份</button>
          </div>
        </div>

        {/* 房间头部信息（cfg/phase/deadline） */}
        {ethers.isAddress(gameAddress) && (
          <GameHeader gameAddress={gameAddress} />
        )}

        {/* 按 phase 在同一页渲染玩家面板 */}
        {ethers.isAddress(gameAddress) && (
          <>
            {phase === 0 && (
              <div style={card}>
                当前处于 <b>{PHASE_NAMES[phase]}</b>。非 host 可 Join；等待 host start + assignRoles 后进入夜晚。
              </div>
            )}

            {(phase === 2 || phase === 3 || phase === 7) && (
              <div style={card}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>夜晚</div>
                <PlayerNight gameAddress={gameAddress} />
              </div>
            )}

            {phase === 5 && (
              <div style={card}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>白天投票</div>
                <PlayerDay gameAddress={gameAddress} />
              </div>
            )}

            {phase === 8 && (
              <div style={card}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>猎人时刻</div>
                <PlayerHunter gameAddress={gameAddress} />
              </div>
            )}

            {phase === 6 && (
              <div style={card}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>结算</div>
                <PlayerEnd gameAddress={gameAddress} />
              </div>
            )}

            {[1, 4].includes(phase) && (
              <div style={card}>
                当前阶段：<b>{PHASE_NAMES[phase]}</b>（只读）。请等待链上推进。
              </div>
            )}
          </>
        )}

        {/* 提示条 */}
        {message && (
          <div
            style={{
              border: '1px solid',
              borderColor: msgType === 'ok' ? '#B7F7D0' : msgType === 'err' ? '#FECACA' : '#e5e7eb',
              background: msgType === 'ok' ? '#ECFDF5' : msgType === 'err' ? '#FEF2F2' : '#fff',
              color: msgType === 'ok' ? '#065F46' : msgType === 'err' ? '#7F1D1D' : '#333',
              borderRadius: 16,
              padding: 12,
              fontSize: 14,
            }}
          >
            {message}
          </div>
        )}

        <p style={{ fontSize: 12, color: '#666' }}>
          Join 仅在 <span style={mono as any}>Lobby</span> 且你不是 <span style={mono as any}>host</span> 时可用；
          游戏未结束时 <span style={mono as any}>roleOf</span> 仅允许查询自己。
        </p>
      </div>
    </main>
  );
}

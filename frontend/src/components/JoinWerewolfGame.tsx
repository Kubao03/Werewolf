'use client';

import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

/**
 * JoinWerewolfGame — mainstream React component (TypeScript + Ethers v6)
 *
 * Features:
 * - Connect MetaMask
 * - Input WerewolfGame contract address
 * - Read on-chain config/phase/stake/host/your seat
 * - Join game (sends exact cfg.stake as value)
 *
 * Usage (Next.js / Vite):
 * 1) npm i ethers
 * 2) Drop this file somewhere (e.g., src/components/JoinWerewolfGame.tsx)
 * 3) Import and render <JoinWerewolfGame /> in a page.
 */

// Minimal ABI: only what this page needs
const GAME_ABI = [
  // views
  {
    inputs: [],
    name: "cfg",
    outputs: [
      { internalType: "uint8", name: "minPlayers", type: "uint8" },
      { internalType: "uint8", name: "maxPlayers", type: "uint8" },
      { internalType: "uint8", name: "wolves", type: "uint8" },
      { internalType: "uint256", name: "stake", type: "uint256" },
      { internalType: "uint32", name: "tSetup", type: "uint32" },
      { internalType: "uint32", name: "tNightCommit", type: "uint32" },
      { internalType: "uint32", name: "tNightReveal", type: "uint32" },
      { internalType: "uint32", name: "tDayVote", type: "uint32" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "phase",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "seatOf",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "host",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  // actions
  { inputs: [], name: "join", outputs: [], stateMutability: "payable", type: "function" },
  // events
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "player", type: "address" },
      { indexed: false, internalType: "uint8", name: "seat", type: "uint8" },
    ],
    name: "PlayerJoined",
    type: "event",
  },
] as const;

const PHASE_NAMES = [
  "Lobby",
  "Setup",
  "NightCommit",
  "NightReveal",
  "NightResolve",
  "DayVote",
  "Ended",
  "NightWitch",
  "HunterShot",
];

type Cfg = {
  minPlayers: number;
  maxPlayers: number;
  wolves: number;
  stake: bigint;
  tSetup: number;
  tNightCommit: number;
  tNightReveal: number;
  tDayVote: number;
};

type Loaded = {
  cfg: Cfg;
  phase: number;
  host: string;
  yourSeat: number; // 1-based; 0 = not joined
};

export default function JoinWerewolfGame() {
  const [account, setAccount] = useState<string>("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [address, setAddress] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [message, setMessage] = useState<string>("");
  const [messageType, setMessageType] = useState<"ok" | "err" | "muted" | "">("");

  // provider/signer from window.ethereum
  const provider = useMemo(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) return null;
    return new ethers.BrowserProvider((window as any).ethereum);
  }, []);

  const getSigner = async () => {
    if (!provider) throw new Error("请先安装 MetaMask");
    await provider.send("eth_requestAccounts", []);
    return provider.getSigner();
  };

  // connect wallet
  const connect = async () => {
    try {
      const signer = await getSigner();
      const addr = await (await signer).getAddress();
      setAccount(addr);
      const net = await provider!.getNetwork();
      setChainId(Number(net.chainId));
      toast("已连接钱包。", "ok");
    } catch (e: any) {
      toast(`连接失败：${e.message || e}`, "err");
    }
  };

  const toast = (msg: string, type: "ok" | "err" | "muted" | "" = "") => {
    setMessage(msg);
    setMessageType(type);
  };

  // contract instance (read-only by default)
  const getContract = () => {
    if (!provider) throw new Error("请先安装 MetaMask");
    if (!ethers.isAddress(address)) throw new Error("请输入有效的 WerewolfGame 地址");
    return new ethers.Contract(address, GAME_ABI, provider);
  };

  const load = async () => {
    try {
      toast("");
      const game = getContract();
      const [cfgRaw, phaseRaw, host, seat] = await Promise.all([
        game.cfg(),
        game.phase(),
        game.host(),
        account ? game.seatOf(account) : 0,
      ]);

      const cfg: Cfg = {
        minPlayers: Number(cfgRaw.minPlayers),
        maxPlayers: Number(cfgRaw.maxPlayers),
        wolves: Number(cfgRaw.wolves),
        stake: BigInt(cfgRaw.stake),
        tSetup: Number(cfgRaw.tSetup),
        tNightCommit: Number(cfgRaw.tNightCommit),
        tNightReveal: Number(cfgRaw.tNightReveal),
        tDayVote: Number(cfgRaw.tDayVote),
      };

      const phase = Number(phaseRaw);
      const yourSeat = Number(seat);

      setLoaded({ cfg, phase, host, yourSeat });

      const canJoin = phase === 0 && account && account.toLowerCase() !== host.toLowerCase();
      toast(
        canJoin ? "可以加入，点击 Join。" : "当前不可加入：需在 Lobby 阶段且你不能是 host。",
        canJoin ? "ok" : "muted"
      );
    } catch (e: any) {
      toast(`读取失败：${e.message || e}`, "err");
    }
  };

  const join = async () => {
    try {
      if (!provider) throw new Error("请先连接钱包");
      const game = getContract();

      const cfg = await game.cfg();
      const stake: bigint = cfg.stake as bigint;  

      const signer = await getSigner();
      const gameWithSigner = game.connect(signer);

      toast("发送 join 交易中…");

      // Optional: event feedback (not all providers backfill immediately)
      gameWithSigner.once(
        gameWithSigner.getEvent("PlayerJoined"),
        (player: string, seat: number) => {
          if (player.toLowerCase() === account.toLowerCase()) {
            toast(`加入成功！你的 seat(0-based): ${Number(seat)}`, "ok");
          }
        }
      );

      const tx = await gameWithSigner.join({ value: stakeWei });
      await tx.wait();

      // double-check
      const s = Number(await game.seatOf(account));
      if (s > 0) toast(`加入成功！你的 seat(1-based): ${s}`, "ok");
      else toast("交易已确认，但 seatOf 仍为 0，可重载信息再试。", "muted");

      // refresh info after join
      load();
    } catch (e: any) {
      toast(`加入失败：${e.message || e}`, "err");
    }
  };

  useEffect(() => {
    if (!provider) return;
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    const handleAccountsChanged = (accs: string[]) => {
      setAccount(accs?.[0] || "");
    };
    const handleChainChanged = () => {
      // reload network state
      provider.getNetwork().then((net) => setChainId(Number(net.chainId)));
      setLoaded(null);
    };

    ethereum.on?.("accountsChanged", handleAccountsChanged);
    ethereum.on?.("chainChanged", handleChainChanged);
    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [provider]);

  const stakeEth = loaded ? ethers.formatEther(loaded.cfg.stake) : null;
  const canJoin = !!loaded && loaded.phase === 0 && !!account && account.toLowerCase() !== loaded.host.toLowerCase();

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">🐺 WerewolfGame — Join</h1>

      <div className="flex items-center gap-3">
        <button
          onClick={connect}
          className="px-4 py-2 rounded-2xl border shadow-sm hover:shadow transition"
        >
          {account ? "已连接" : "连接钱包"}
        </button>
        <div className="text-sm text-gray-600 break-all">
          {account ? `地址：${account}` : "未连接"}
          {chainId !== null && (
            <span className="ml-2">链 ID：{chainId}</span>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">游戏合约地址</label>
        <input
          className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring"
          placeholder="0x... WerewolfGame 合约地址"
          value={address}
          onChange={(e) => setAddress(e.target.value.trim())}
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={load}
            className="px-4 py-2 rounded-2xl border shadow-sm hover:shadow transition"
          >
            读取配置
          </button>
          <button
            onClick={join}
            disabled={!canJoin}
            className={`px-4 py-2 rounded-2xl border shadow-sm transition ${
              canJoin ? "hover:shadow" : "opacity-60 cursor-not-allowed"
            }`}
          >
            Join
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="rounded-2xl border p-4 bg-gray-50">
        {loaded ? (
          <div className="text-sm space-y-1">
            <div>
              phase: <span className="font-mono">{PHASE_NAMES[loaded.phase] ?? loaded.phase}</span>
            </div>
            <div>
              min/max: {loaded.cfg.minPlayers}/{loaded.cfg.maxPlayers}，wolves: {loaded.cfg.wolves}
            </div>
            <div>
              stake: <span className="font-mono">{stakeEth} ETH</span>
            </div>
            <div>
              host: <span className="font-mono break-all">{loaded.host}</span>
            </div>
            <div>
              你的 seatOf: <span className="font-mono">{loaded.yourSeat}</span>（0=未加入；seatOf 为 1-based）
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-600">未加载任何合约信息。</div>
        )}
      </div>

      {/* Message */}
      {message && (
        <div
          className={`text-sm p-3 rounded-2xl border ${
            messageType === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : messageType === "err"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-gray-200 bg-white text-gray-700"
          }`}
        >
          {message}
        </div>
      )}

      <p className="text-xs text-gray-500">
        需在 <span className="font-mono">Lobby</span> 阶段，且你不能是 <span className="font-mono">host</span> 才能加入。
        Join 会自动附带 <span className="font-mono">cfg.stake</span> 作为交易 value。
      </p>
    </div>
  );
}

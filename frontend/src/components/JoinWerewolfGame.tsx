// File: src/components/JoinWerewolfGame.tsx
'use client';

import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

/**
 * JoinWerewolfGame — Ethers v6
 * - 连接钱包
 * - 输入 WerewolfGame 地址
 * - 读取 cfg/phase/host/你的 seat
 * - Join（自动附带 cfg.stake）
 * - 查看我的身份（未结束前仅能查自己）
 * - 所有错误都通过 toast 展示，不红屏
 */

// ==== Minimal ABI ====
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
  { inputs: [], name: "phase", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "", type: "address" }], name: "seatOf", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "host", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "p", type: "address" }], name: "roleOf", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },

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
  {
    anonymous: false,
    inputs: [{ indexed: false, internalType: "uint64", name: "day", type: "uint64" }],
    name: "RolesAssigned",
    type: "event",
  },
] as const;

const PHASE_NAMES = [
  "Lobby","Setup","NightCommit","NightReveal","NightResolve","DayVote","Ended","NightWitch","HunterShot",
] as const;

const ROLE_NAMES = ["Villager","Wolf","Seer","Hunter","Witch"] as const;

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
  yourSeat: number; // 1-based; 0=未加入
};

// ---- 小工具：统一解析 ethers 错误，给人话提示 ----
function parseEthersError(e: any): string {
  const s = String(e?.shortMessage || e?.reason || e?.message || e);
  if (/user rejected/i.test(s)) return "你已取消交易/请求。";
  if (s.includes("no seat")) return "你还没有座位：可能你是 host，或 join 交易尚未确认。";
  if (s.includes("hidden")) return "未结束前只能查看自己的身份。";
  if (s.includes("stake mismatch")) return "质押金额不匹配：请使用合约要求的 stake。";
  if (s.includes("too few")) return "人数不足，Host 还不能开始。";
  return s;
}

export default function JoinWerewolfGame() {
  // ---------- Wallet state ----------
  const [account, setAccount] = useState<string>("");
  const [chainId, setChainId] = useState<number | null>(null);

  // ---------- UI state ----------
  const [address, setAddress] = useState<string>("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [message, setMessage] = useState<string>("");
  const [messageType, setMessageType] = useState<"ok" | "err" | "muted" | "">("");
  const [yourSeat1B, setYourSeat1B] = useState<number>(0);
  const [myRole, setMyRole] = useState<string>("");

  // provider
  const provider = useMemo(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) return null;
    return new ethers.BrowserProvider((window as any).ethereum);
  }, []);

  const toast = (msg: string, type: "ok" | "err" | "muted" | "" = "") => {
    setMessage(msg);
    setMessageType(type);
  };

  const getSigner = async () => {
    if (!provider) throw new Error("请先安装/启用 MetaMask");
    await provider.send("eth_requestAccounts", []);
    return provider.getSigner();
  };

  // ❗不要抛异常，返回 null，让调用方决定 toast
  const tryGetContract = () => {
    if (!provider) { toast("请先安装/启用 MetaMask", "err"); return null; }
    if (!ethers.isAddress(address)) { toast("请输入有效的 WerewolfGame 合约地址", "err"); return null; }
    return new ethers.Contract(address, GAME_ABI, provider);
  };

  const connect = async () => {
    try {
      const signer = await getSigner();
      const addr = await signer.getAddress(); // 清理多余 await
      setAccount(addr);
      const net = await provider!.getNetwork();
      setChainId(Number(net.chainId));
      toast("已连接钱包。", "ok");
    } catch (e: any) {
      toast(parseEthersError(e), "err");
    }
  };

  const load = async () => {
    try {
      setMyRole("");
      const game = tryGetContract();
      if (!game) return;

      const [cfgRaw, phaseRaw, host, seatRaw] = await Promise.all([
        game.cfg(),
        game.phase(),
        game.host(),
        account ? game.seatOf(account) : 0,
      ]);

      // ✅ 兼容 seatRaw 既可能是 bigint（链上读）也可能是 number（account 为空时我们传 0）
      const seatNum = typeof seatRaw === "bigint" ? Number(seatRaw) : Number(seatRaw || 0);
      setYourSeat1B(seatNum);

      const cfg: Cfg = {
        minPlayers: Number(cfgRaw.minPlayers),
        maxPlayers: Number(cfgRaw.maxPlayers),
        wolves: Number(cfgRaw.wolves),
        stake: cfgRaw.stake as bigint,
        tSetup: Number(cfgRaw.tSetup),
        tNightCommit: Number(cfgRaw.tNightCommit),
        tNightReveal: Number(cfgRaw.tNightReveal),
        tDayVote: Number(cfgRaw.tDayVote),
      };
      const phase = Number(phaseRaw);
      setLoaded({ cfg, phase, host, yourSeat: seatNum });

      // ❌ 移除一次性事件监听（BrowserProvider 下不稳定且可能抛同步错误）
      // 若需要可改为轮询 phase/seatOf

      const canJoinNow = phase === 0 && !!account && account.toLowerCase() !== host.toLowerCase();
      toast(canJoinNow ? "可以加入，点击 Join。" : "当前不可加入：需在 Lobby 且你不是 host。", canJoinNow ? "ok" : "muted");
    } catch (e: any) {
      toast(`读取失败：${parseEthersError(e)}`, "err");
    }
  };

  const join = async () => {
    try {
      const game = tryGetContract();
      if (!game) return;

      // ✅ 加前置校验：必须在 Lobby
      const ph: number = Number(await game.phase());
      if (ph !== 0) {
        toast(`当前阶段为 ${PHASE_NAMES[ph] ?? ph}，只能在 Lobby 才能加入。`, "err");
        return;
      }

      // ✅ 再次确认你不是 host
      const host: string = await game.host();
      if (!account || account.toLowerCase() === host.toLowerCase()) {
        toast("Host 不能加入该局。", "err");
        return;
      }

      const cfg = await game.cfg();
      const stake: bigint = cfg.stake as bigint;

      // 仅在通过所有校验后才取 signer 和发交易
      const signer = await getSigner();
      const gw = game.connect(signer);

      toast("发送 join 交易中…");
      const tx = await gw.join({ value: stake });
      await tx.wait();

      const sRaw = await game.seatOf(account);
      const s = typeof sRaw === "bigint" ? Number(sRaw) : Number(sRaw || 0);
      setYourSeat1B(s);
      toast(s > 0 ? `加入成功！你的 seat(1-based): ${s}` : "交易已确认，但 seatOf 仍为 0，可稍后重载。", s > 0 ? "ok" : "muted");

      await load();
    } catch (e: any) {
      toast(`加入失败：${parseEthersError(e)}`, "err");
    }
  };

  const viewMyRole = async () => {
    try {
      const game = tryGetContract();
      if (!game) return;
      if (!account) { toast("请先连接钱包", "err"); return; }

      const sRaw = await game.seatOf(account);
      const s1 = typeof sRaw === "bigint" ? Number(sRaw) : Number(sRaw || 0);
      setYourSeat1B(s1);
      if (s1 === 0) { toast("你还没有座位（可能你是 host 或 join 未确认）", "err"); return; }

      // ✅ 直接只读调用（v6 读方法本身就是 call）
      const roleRaw = await game.roleOf(account);
      const rU8: number = typeof roleRaw === "bigint" ? Number(roleRaw) : Number(roleRaw || 0);
      const label = ROLE_NAMES[rU8 as 0|1|2|3|4] ?? `Unknown(${rU8})`;
      setMyRole(label);
      toast(`你的身份：${label}`, "ok");
    } catch (e: any) {
      toast(`查看身份失败：${parseEthersError(e)}`, "err");
    }
  };

  // wallet listeners
  useEffect(() => {
    if (!provider) return;
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    const handleAccountsChanged = (accs: string[]) => setAccount(accs?.[0] || "");
    const handleChainChanged = () => {
      provider.getNetwork().then((net) => setChainId(Number(net.chainId)));
      setLoaded(null);
      setMyRole("");
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
  const canViewRole = ethers.isAddress(address) && !!account && yourSeat1B > 0;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">🐺 WerewolfGame — Join</h1>

      <div className="flex items-center gap-3">
        <button onClick={connect} className="px-4 py-2 rounded-2xl border shadow-sm hover:shadow transition">
          {account ? "已连接" : "连接钱包"}
        </button>
        <div className="text-sm text-gray-600 break-all">
          {account ? `地址：${account}` : "未连接"}
          {chainId !== null && <span className="ml-2">链 ID：{chainId}</span>}
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
          <button onClick={load} className="px-4 py-2 rounded-2xl border shadow-sm hover:shadow transition">
            读取配置
          </button>
          <button
            onClick={join}
            disabled={!canJoin}
            className={`px-4 py-2 rounded-2xl border shadow-sm transition ${canJoin ? "hover:shadow" : "opacity-60 cursor-not-allowed"}`}
          >
            Join
          </button>
          <button
            onClick={viewMyRole}
            disabled={!canViewRole}
            className={`px-4 py-2 rounded-2xl border shadow-sm transition ${canViewRole ? "hover:shadow" : "opacity-60 cursor-not-allowed"}`}
            title={canViewRole ? "" : "需要先成功加入（seatOf > 0）"}
          >
            查看我的身份
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="rounded-2xl border p-4 bg-gray-50">
        {loaded ? (
          <div className="text-sm space-y-1">
            <div>phase: <span className="font-mono">{PHASE_NAMES[loaded.phase] ?? loaded.phase}</span></div>
            <div>min/max: {loaded.cfg.minPlayers}/{loaded.cfg.maxPlayers}，wolves: {loaded.cfg.wolves}</div>
            <div>stake: <span className="font-mono">{stakeEth} ETH</span></div>
            <div>host: <span className="font-mono break-all">{loaded.host}</span></div>
            <div>你的 seatOf: <span className="font-mono">{loaded.yourSeat}</span>（0=未加入；seatOf 为 1-based）</div>
            {myRole && <div>你的身份：<b>{myRole}</b></div>}
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
        需在 <span className="font-mono">Lobby</span> 阶段，且你不能是 <span className="font-mono">host</span> 才能加入。Join 会自动附带
        <span className="font-mono"> cfg.stake </span> 作为交易 value。未结束时只能查询自己的身份。
      </p>
    </div>
  );
}

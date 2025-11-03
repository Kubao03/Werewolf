export const GAME_ABI = [
    // -------- views --------
    { inputs: [], name: "cfg", outputs: [
    { internalType: "uint8", name: "minPlayers", type: "uint8" },
    { internalType: "uint8", name: "maxPlayers", type: "uint8" },
    { internalType: "uint8", name: "wolves", type: "uint8" },
    { internalType: "uint256", name: "stake", type: "uint256" },
    { internalType: "uint32", name: "tSetup", type: "uint32" },
    { internalType: "uint32", name: "tNightCommit", type: "uint32" },
    { internalType: "uint32", name: "tNightReveal", type: "uint32" },
    { internalType: "uint32", name: "tDayVote", type: "uint32" },
    ], stateMutability: "view", type: "function" },
    { inputs: [], name: "phase", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "deadline", outputs: [{ internalType: "uint64", name: "", type: "uint64" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "dayCount", outputs: [{ internalType: "uint64", name: "", type: "uint64" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "host", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
    { inputs: [{ internalType: "address", name: "", type: "address" }], name: "seatOf", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "seatsCount", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
    { inputs: [{ internalType: "uint256", name: "", type: "uint256" }], name: "seats", outputs: [
    { internalType: "address", name: "player", type: "address" },
    { internalType: "bool", name: "alive", type: "bool" },
    { internalType: "uint8", name: "role", type: "uint8" },
    ], stateMutability: "view", type: "function" },
    { inputs: [{ internalType: "address", name: "p", type: "address" }], name: "roleOf", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
    { inputs: [{ internalType: "uint8", name: "", type: "uint8" }], name: "dayTally", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "hunterToShoot", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
    // witch status
    { inputs: [{ internalType: "address", name: "", type: "address" }], name: "hasAntidote", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "view", type: "function" },
    { inputs: [{ internalType: "address", name: "", type: "address" }], name: "hasPoison", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "view", type: "function" },
    { inputs: [{ internalType: "address", name: "", type: "address" }], name: "hasUsedNightAbility", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "view", type: "function" },
    
    
    // -------- actions (player) --------
    { inputs: [], name: "join", outputs: [], stateMutability: "payable", type: "function" },
    // wolves
    { inputs: [{ internalType: "bytes32", name: "commitHash", type: "bytes32" }], name: "submitWolfCommit", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ internalType: "uint8", name: "targetSeat", type: "uint8" },{ internalType: "bytes32", name: "salt", type: "bytes32" }], name: "submitWolfReveal", outputs: [], stateMutability: "nonpayable", type: "function" },
    // seer
    { inputs: [{ internalType: "uint8", name: "targetSeat", type: "uint8" }], name: "seerCheck", outputs: [], stateMutability: "nonpayable", type: "function" },
    // witch
    { inputs: [{ internalType: "uint8", name: "actionType", type: "uint8" },{ internalType: "uint8", name: "targetSeat", type: "uint8" }], name: "witchAct", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [], name: "resolveWitch", outputs: [], stateMutability: "nonpayable", type: "function" },
    // day
    { inputs: [{ internalType: "uint8", name: "targetSeat", type: "uint8" }], name: "vote", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [], name: "resolveDay", outputs: [], stateMutability: "nonpayable", type: "function" },
    // hunter
    { inputs: [{ internalType: "uint8", name: "targetSeat", type: "uint8" }], name: "hunterShoot", outputs: [], stateMutability: "nonpayable", type: "function" },
    ] as const;
    
    
    export const PHASE_NAMES = [
    "Lobby","Setup","NightCommit","NightReveal","NightResolve","DayVote","Ended","NightWitch","HunterShot",
    ] as const;
    
    
    export const ROLE_NAMES = ["Villager","Wolf","Seer","Hunter","Witch"] as const;
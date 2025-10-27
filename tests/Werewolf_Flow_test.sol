// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "remix_tests.sol";
import "../contracts/Werewolf.sol";

// ==================================================================================
// 助手合约 (PlayerActor)
// ==================================================================================
contract PlayerActor {
    WerewolfGame public game;
    constructor(WerewolfGame _game) { game = _game; }
    receive() external payable {}
    function joinGame(uint256 stake) external payable { game.join{value: stake}(); }
    function commit(bytes32 hash) external { game.commitWolfKill(hash); }
    function reveal(uint8 target, bytes32 salt) external { game.revealWolfKill(target, salt); }
    function vote(uint8 target) external { game.vote(target); }
    function checkOwnRole() external view returns (WerewolfGame.Role) { return game.roleOf(address(this)); }
    function checkOtherRole(address other) external view returns (WerewolfGame.Role) { return game.roleOf(other); }
}

// ==================================================================================
// 复杂游戏流程测试
// ==================================================================================
contract WerewolfFlowTest {
    WerewolfFactory factory;
    address host;

    function beforeAll() public {
        factory = new WerewolfFactory();
        host = address(this);
    }

    function _createStdCfg() internal pure returns (WerewolfGame.GameConfig memory cfg) {
        cfg = WerewolfGame.GameConfig({
            minPlayers: 3, maxPlayers: 5, wolves: 2, stake: 0,
            tSetup: 1, tNightCommit: 1, tNightReveal: 1, tDayVote: 1
        });
    }

    function testGameFlow_WolvesWin() public {
        // --- 1. SETUP ---
        WerewolfGame game = WerewolfGame(payable(factory.createGame(_createStdCfg())));
        PlayerActor p1 = new PlayerActor(game); // Villager
        PlayerActor p2 = new PlayerActor(game); // Wolf
        PlayerActor p3 = new PlayerActor(game); // Wolf

        // --- 2. LOBBY & SETUP ---
        p1.joinGame(0); // Seat 0
        p2.joinGame(0); // Seat 1
        p3.joinGame(0); // Seat 2
        game.start();
        WerewolfGame.Role[] memory roles = new WerewolfGame.Role[](3);
        roles[0] = WerewolfGame.Role.Villager;
        roles[1] = WerewolfGame.Role.Wolf;
        roles[2] = WerewolfGame.Role.Wolf;
        game.assignRoles(roles);
        Assert.equal(game.aliveWolves(), 2, "2 alive wolves");

        // --- 4. NIGHT 1: COMMIT & REVEAL ---
        uint8 targetSeat = 0;
        bytes32 saltP2 = keccak256("salt_p2");
        bytes32 hashP2 = keccak256(abi.encode(address(game), 1, targetSeat, saltP2));
        p2.commit(hashP2);
        {
            bytes32 saltP3 = keccak256("salt_p3");
            bytes32 hashP3 = keccak256(abi.encode(address(game), 1, targetSeat, saltP3));
            p3.commit(hashP3);
        }
        
        game.enterNightReveal();
        p2.reveal(targetSeat, saltP2);
        {
            bytes32 saltP3 = keccak256("salt_p3");
            p3.reveal(targetSeat, saltP3);
        }
        
        // --- 6. NIGHT 1: RESOLVE ---
        game.enterNightResolve();
        game.resolveNight();

        // --- 7. ASSERTIONS ---
        ( , bool p1_alive, ) = game.seats(0);
        Assert.equal(p1_alive, false, "P1 (Seat 0) is dead");
        Assert.equal(game.aliveNonWolves(), 0, "0 non-wolves survived");
        Assert.equal(uint(game.phase()), uint(WerewolfGame.Phase.Ended), "Game should be Ended");
    }

    function testGameFlow_GoodWin() public {
        // --- 1. SETUP (3P, 1W) ---
        WerewolfGame.GameConfig memory cfg = WerewolfGame.GameConfig({
            minPlayers: 3, maxPlayers: 5, wolves: 1,
            stake: 0, tSetup: 1, tNightCommit: 1, tNightReveal: 1, tDayVote: 1
        });
        WerewolfGame game = WerewolfGame(payable(factory.createGame(cfg)));
        PlayerActor p1 = new PlayerActor(game); // Villager
        PlayerActor p2 = new PlayerActor(game); // Wolf
        PlayerActor p3 = new PlayerActor(game); // Villager

        // --- 2. LOBBY & SETUP ---
        p1.joinGame(0); // Seat 0
        p2.joinGame(0); // Seat 1
        p3.joinGame(0); // Seat 2
        game.start();
        WerewolfGame.Role[] memory roles = new WerewolfGame.Role[](3);
        roles[0] = WerewolfGame.Role.Villager;
        roles[1] = WerewolfGame.Role.Wolf;
        roles[2] = WerewolfGame.Role.Villager;
        game.assignRoles(roles);
        Assert.equal(game.aliveWolves(), 1, "1 alive wolf");

        // --- 3. NIGHT 1 (P2 杀死 P1) ---
        uint8 targetSeat = 0;
        bytes32 saltP2 = keccak256("salt_p2_d1");
        bytes32 hashP2 = keccak256(abi.encode(address(game), 1, targetSeat, saltP2));
        p2.commit(hashP2);
        game.enterNightReveal();
        p2.reveal(targetSeat, saltP2);
        game.enterNightResolve();
        game.resolveNight(); // P1 (Seat 0) 死亡
        Assert.equal(uint(game.phase()), uint(WerewolfGame.Phase.DayVote), "Phase == DayVote");

        // --- 4. DAY 1 VOTE (P3 投票 P2) ---
        p3.vote(1); // P3 投票 P2 (Seat 1)
        p2.vote(2); // P2 投票 P3 (Seat 2)
        game.resolveDay();

        // --- 5. ASSERTIONS ---
        ( , bool p2_alive, ) = game.seats(1);
        Assert.equal(p2_alive, false, "P2 (Seat 1) should be executed (tie-break)");
        Assert.equal(game.aliveWolves(), 0, "0 wolves remain");
        Assert.equal(uint(game.phase()), uint(WerewolfGame.Phase.Ended), "Game should be Ended");
    }

    function testEnded_CanReadRoles() public {
        // --- 1. SETUP (同上, 运行 GoodWin 流程) ---
        WerewolfGame.GameConfig memory cfg = WerewolfGame.GameConfig({
            minPlayers: 3, maxPlayers: 5, wolves: 1,
            stake: 0, tSetup: 1, tNightCommit: 1, tNightReveal: 1, tDayVote: 1
        });
        WerewolfGame game = WerewolfGame(payable(factory.createGame(cfg)));
        PlayerActor p1 = new PlayerActor(game);
        PlayerActor p2 = new PlayerActor(game);
        PlayerActor p3 = new PlayerActor(game);
        p1.joinGame(0);
        p2.joinGame(0);
        p3.joinGame(0);
        game.start();
        WerewolfGame.Role[] memory roles = new WerewolfGame.Role[](3);
        roles[0] = WerewolfGame.Role.Villager;
        roles[1] = WerewolfGame.Role.Wolf;
        roles[2] = WerewolfGame.Role.Villager;
        game.assignRoles(roles);
        // Night 1
        uint8 targetSeat = 0;
        bytes32 saltP2 = keccak256("salt_p2_d1");
        bytes32 hashP2 = keccak256(abi.encode(address(game), 1, targetSeat, saltP2));
        p2.commit(hashP2);
        game.enterNightReveal();
        p2.reveal(targetSeat, saltP2);
        game.enterNightResolve();
        game.resolveNight();
        // Day 1
        p3.vote(1);
        p2.vote(2);
        game.resolveDay();
        
        // --- 2. ASSERT GAME IS ENDED ---
        Assert.equal(uint(game.phase()), uint(WerewolfGame.Phase.Ended), "Game is Ended");
        
        // --- 3. TEST: P3 CAN READ P2's ROLE ---
        WerewolfGame.Role p2Role = p3.checkOtherRole(address(p2));
        Assert.equal(uint(p2Role), uint(WerewolfGame.Role.Wolf), "P3 can see P2 was Wolf");
    }
}
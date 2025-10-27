// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "remix_tests.sol";
import "../contracts/Werewolf.sol";

// ==================================================================================
// 助手合约：用于模拟独立的玩家（Player）
// [修复] 将 'game' 移至构造函数，以避免在测试中调用带参数的函数
// ==================================================================================
contract PlayerActor {
    WerewolfGame public game; // 存储游戏上下文

    // 在创建时设置游戏地址
    constructor(WerewolfGame _game) {
        game = _game;
    }

    receive() external payable {}

    // --- 所有函数现在都使用存储的 'game' ---

    function joinGame(uint256 stake) external payable {
        game.join{value: stake}();
    }
    
    function commit(bytes32 hash) external {
        game.commitWolfKill(hash);
    }
    
    function reveal(uint8 target, bytes32 salt) external {
        game.revealWolfKill(target, salt);
    }
    
    function vote(uint8 target) external {
        game.vote(target);
    }
    
    function checkOwnRole() external view returns (WerewolfGame.Role) {
        return game.roleOf(address(this));
    }
    
    function checkOtherRole(address other) external view returns (WerewolfGame.Role) {
        return game.roleOf(other);
    }
}


// ==================================================================================
// 主测试合约
// ==================================================================================

contract WerewolfGameTest {
    WerewolfFactory factory;
    address host;

    function beforeAll() public {
        factory = new WerewolfFactory();
        host = address(this); // 主测试合约是 Host
    }

    // --- 辅助函数 ---
    function _createStdCfg() internal pure returns (WerewolfGame.GameConfig memory cfg) {
        cfg = WerewolfGame.GameConfig({
            minPlayers: 3,
            maxPlayers: 5,
            wolves: 2,
            stake: 0,
            tSetup: 1,
            tNightCommit: 1,
            tNightReveal: 1,
            tDayVote: 1
        });
    }

    // ==================================================================================
    // 1. Lobby 阶段测试
    // ==================================================================================

    function testLobby_InitialState() public {
        WerewolfGame.GameConfig memory cfg = _createStdCfg();
        WerewolfGame game = WerewolfGame(payable(factory.createGame(cfg)));
        Assert.equal(uint(game.phase()), uint(WerewolfGame.Phase.Lobby), "Phase == Lobby");
        Assert.equal(game.host(), host, "Host address is correct");
    }

    function testLobby_HostCannotJoin() public {
        WerewolfGame.GameConfig memory cfg = _createStdCfg();
        WerewolfGame game = WerewolfGame(payable(factory.createGame(cfg)));
        (bool ok, ) = address(game).call(
            abi.encodeWithSelector(game.join.selector)
        );
        Assert.equal(ok, false, "Host cannot join the game");
    }

    function testLobby_PlayersCanJoin() public {
        WerewolfGame.GameConfig memory cfg = _createStdCfg();
        WerewolfGame game = WerewolfGame(payable(factory.createGame(cfg)));
        
        // [修复] 在构造函数中传入 'game'
        PlayerActor p1 = new PlayerActor(game);
        PlayerActor p2 = new PlayerActor(game);

        // [修复] 调用无 'game' 参数的函数
        p1.joinGame(0);
        p2.joinGame(0);

        Assert.equal(game.seatsCount(), 2, "2 players joined");
        Assert.equal(game.seatOf(address(p1)), 1, "P1 is seat 0 (index+1)");
        Assert.equal(game.seatOf(address(p2)), 2, "P2 is seat 1 (index+1)");
    }

    function testLobby_PlayerCannotJoinTwice() public {
        WerewolfGame.GameConfig memory cfg = _createStdCfg();
        WerewolfGame game = WerewolfGame(payable(factory.createGame(cfg)));
        
        // [修复] 在构造函数中传入 'game'
        PlayerActor p1 = new PlayerActor(game);
        
        // [修复] 调用无 'game' 参数的函数
        p1.joinGame(0);
        
        // [修复] 使用更新后的函数选择器 (只带 stake 参数)
        (bool ok, ) = address(p1).call(
            abi.encodeWithSelector(p1.joinGame.selector, 0)
        );
        Assert.equal(ok, false, "Player cannot join twice");
    }

    function testLobby_StartGameFailsIfTooFewPlayers() public {
        WerewolfGame.GameConfig memory cfg = _createStdCfg(); // minPlayers = 3
        WerewolfGame game = WerewolfGame(payable(factory.createGame(cfg)));

        // [修复] 在构造函数中传入 'game' 并调用
        (new PlayerActor(game)).joinGame(0);
        
        (bool ok, ) = address(game).call(
            abi.encodeWithSelector(game.start.selector)
        );
        Assert.equal(ok, false, "start() should revert if seats < minPlayers");
    }

    // ==================================================================================
    // 2. Setup 阶段测试
    // ==================================================================================

    function testSetup_AssignRolesFailsWrongLength() public {
        WerewolfGame.GameConfig memory cfg = _createStdCfg(); // min=3
        WerewolfGame game = WerewolfGame(payable(factory.createGame(cfg)));
        
        // [修复] 更新 Actor 的创建和调用
        (new PlayerActor(game)).joinGame(0);
        (new PlayerActor(game)).joinGame(0);
        (new PlayerActor(game)).joinGame(0);
        
        game.start();
        Assert.equal(uint(game.phase()), uint(WerewolfGame.Phase.Setup), "Phase == Setup");

        WerewolfGame.Role[] memory roles = new WerewolfGame.Role[](2);
        roles[0] = WerewolfGame.Role.Wolf;
        roles[1] = WerewolfGame.Role.Villager;
        
        (bool ok, ) = address(game).call(
            abi.encodeWithSelector(game.assignRoles.selector, roles)
        );
        Assert.equal(ok, false, "assignRoles should revert if length mismatch");
    }

    function testSetup_AssignRolesFailsWrongWolfCount() public {
        WerewolfGame.GameConfig memory cfg = _createStdCfg(); // wolves = 2
        WerewolfGame game = WerewolfGame(payable(factory.createGame(cfg)));

        // [修复] 更新 Actor 的创建和调用
        (new PlayerActor(game)).joinGame(0);
        (new PlayerActor(game)).joinGame(0);
        (new PlayerActor(game)).joinGame(0);
        game.start();

        WerewolfGame.Role[] memory roles = new WerewolfGame.Role[](3);
        roles[0] = WerewolfGame.Role.Wolf;
        roles[1] = WerewolfGame.Role.Villager;
        roles[2] = WerewolfGame.Role.Villager;
        
        (bool ok, ) = address(game).call(
            abi.encodeWithSelector(game.assignRoles.selector, roles)
        );
        Assert.equal(ok, false, "assignRoles should revert if wolves count mismatch");
    }

    // ==================================================================================
    // 3. 完整游戏流程测试 (精简后 + 修复)
    // ==================================================================================

    function testGameFlow_WolvesWin() public {
        // --- 1. SETUP ---
        WerewolfGame.GameConfig memory cfg = _createStdCfg();
        WerewolfGame game = WerewolfGame(payable(factory.createGame(cfg)));
        
        // [修复] 在构造函数中传入 'game'
        PlayerActor p1 = new PlayerActor(game); // Villager
        PlayerActor p2 = new PlayerActor(game); // Wolf
        PlayerActor p3 = new PlayerActor(game); // Wolf

        // --- 2. LOBBY ---
        p1.joinGame(0); // Seat 0
        p2.joinGame(0); // Seat 1
        p3.joinGame(0); // Seat 2
        game.start();

        // --- 3. SETUP ---
        WerewolfGame.Role[] memory roles = new WerewolfGame.Role[](3);
        roles[0] = WerewolfGame.Role.Villager;
        roles[1] = WerewolfGame.Role.Wolf;
        roles[2] = WerewolfGame.Role.Wolf;
        game.assignRoles(roles);

        Assert.equal(uint(game.phase()), uint(WerewolfGame.Phase.NightCommit), "Phase == NightCommit");
        Assert.equal(game.aliveWolves(), 2, "2 alive wolves");

        // --- 4. NIGHT 1: COMMIT ---
        uint8 targetSeat = 0;
        bytes32 saltP2 = keccak256("salt_p2");
        bytes32 hashP2 = keccak256(abi.encode(address(game), 1, targetSeat, saltP2));
        
        // [修复] 调用无 'game' 参数的函数
        p2.commit(hashP2);

        {
            bytes32 saltP3 = keccak256("salt_p3");
            bytes32 hashP3 = keccak256(abi.encode(address(game), 1, targetSeat, saltP3));
            p3.commit(hashP3); // [修复]
        }
        
        (bool ok, ) = address(p1).call(abi.encodeWithSelector(p1.commit.selector, hashP2));
        Assert.equal(ok, false, "Villager cannot commit");
        Assert.equal(game.committed(address(p2)), true, "P2 committed");

        // --- 5. NIGHT 1: REVEAL ---
        game.enterNightReveal();
        Assert.equal(uint(game.phase()), uint(WerewolfGame.Phase.NightReveal), "Phase == NightReveal");

        // [修复] 调用无 'game' 参数的函数
        p2.reveal(targetSeat, saltP2);
        {
            bytes32 saltP3 = keccak256("salt_p3");
            p3.reveal(targetSeat, saltP3); // [修复]
        }
        Assert.equal(game.revealed(address(p3)), true, "P3 revealed");

        // --- 6. NIGHT 1: RESOLVE ---
        game.enterNightResolve();
        game.resolveNight();

        // --- 7. ASSERTIONS ---
        ( , bool p1_alive, ) = game.seats(0);
        Assert.equal(p1_alive, false, "P1 (Seat 0) is dead");
        Assert.equal(game.aliveWolves(), 2, "2 wolves survived");
        Assert.equal(game.aliveNonWolves(), 0, "0 non-wolves survived");
        Assert.equal(uint(game.phase()), uint(WerewolfGame.Phase.Ended), "Game should be Ended");
    }


    function testGameFlow_GoodWin() public {
        // --- 1. SETUP ---
        WerewolfGame.GameConfig memory cfg = WerewolfGame.GameConfig({
            minPlayers: 3, maxPlayers: 5, wolves: 1,
            stake: 0, tSetup: 1, tNightCommit: 1, tNightReveal: 1, tDayVote: 1
        });
        WerewolfGame game = WerewolfGame(payable(factory.createGame(cfg)));
        
        // [修复] 在构造函数中传入 'game'
        PlayerActor p1 = new PlayerActor(game); // Villager
        PlayerActor p2 = new PlayerActor(game); // Wolf
        PlayerActor p3 = new PlayerActor(game); // Villager

        // --- 2. LOBBY & SETUP ---
        p1.joinGame(0);
        p2.joinGame(0);
        p3.joinGame(0);
        game.start();
        
        WerewolfGame.Role[] memory roles = new WerewolfGame.Role[](3);
        roles[0] = WerewolfGame.Role.Villager;
        roles[1] = WerewolfGame.Role.Wolf;
        roles[2] = WerewolfGame.Role.Villager;
        game.assignRoles(roles);

        Assert.equal(game.aliveWolves(), 1, "1 alive wolf");
        Assert.equal(game.aliveNonWolves(), 2, "2 alive non-wolves");

        // --- 3. NIGHT 1 (P2 杀死 P1) ---
        uint8 targetSeat = 0;
        bytes32 saltP2 = keccak256("salt_p2_d1");
        bytes32 hashP2 = keccak256(abi.encode(address(game), 1, targetSeat, saltP2));
        
        // [修复] 调用无 'game' 参数的函数
        p2.commit(hashP2);
        game.enterNightReveal();
        p2.reveal(targetSeat, saltP2);
        game.enterNightResolve();
        game.resolveNight();

        ( , bool p1_alive, ) = game.seats(0);
        Assert.equal(p1_alive, false, "P1 (Seat 0) is dead");
        Assert.equal(uint(game.phase()), uint(WerewolfGame.Phase.DayVote), "Phase == DayVote");

        // --- 4. DAY 1 VOTE (P3 投票 P2) ---
        // [修复] 调用无 'game' 参数的函数
        p3.vote(1);
        p2.vote(2);
        game.resolveDay();

        // --- 5. ASSERTIONS ---
        ( , bool p2_alive, ) = game.seats(1);
        Assert.equal(p2_alive, false, "P2 (Seat 1) should be executed (tie-break)");
        Assert.equal(game.aliveWolves(), 0, "0 wolves remain");
        Assert.equal(uint(game.phase()), uint(WerewolfGame.Phase.Ended), "Game should be Ended");
    }

    function testEnded_CanReadRoles() public {
        // --- 1. SETUP (与 GoodWin 测试相同) ---
        WerewolfGame.GameConfig memory cfg = WerewolfGame.GameConfig({
            minPlayers: 3, maxPlayers: 5, wolves: 1,
            stake: 0, tSetup: 1, tNightCommit: 1, tNightReveal: 1, tDayVote: 1
        });
        WerewolfGame game = WerewolfGame(payable(factory.createGame(cfg)));
        
        // [修复] 在构造函数中传入 'game'
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
        
        // [修复] 调用无 'game' 参数的函数
        uint8 targetSeat = 0;
        bytes32 saltP2 = keccak256("salt_p2_d1");
        bytes32 hashP2 = keccak256(abi.encode(address(game), 1, targetSeat, saltP2));
        p2.commit(hashP2);
        game.enterNightReveal();
        p2.reveal(targetSeat, saltP2);
        game.enterNightResolve();
        game.resolveNight();
        
        p3.vote(1);
        p2.vote(2);
        game.resolveDay();
        
        // --- 2. ASSERT GAME IS ENDED ---
        Assert.equal(uint(game.phase()), uint(WerewolfGame.Phase.Ended), "Game is Ended");
        
        // --- 3. TEST: P3 CAN READ P2's ROLE ---
        // [修复] 调用无 'game' 参数的函数
        WerewolfGame.Role p2Role = p3.checkOtherRole(address(p2));
        Assert.equal(uint(p2Role), uint(WerewolfGame.Role.Wolf), "P3 can see P2 was Wolf");
    }
}
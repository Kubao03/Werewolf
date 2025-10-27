// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "remix_tests.sol";
import "../contracts/Werewolf.sol";

// ==================================================================================
// 极简版助手合约 (Minimal PlayerActor)
// [修复] 我们只保留Lobby测试所必需的 'joinGame' 函数
// 移除所有 'commit', 'reveal', 'vote' 等函数，以防止编译器卡住
// ==================================================================================
contract MinimalPlayerActor {
    WerewolfGame public game;

    // 1. 在创建时设置游戏地址
    constructor(WerewolfGame _game) {
        game = _game;
    }
    
    // 2. 只保留 joinGame 函数
    function joinGame(uint256 stake) external payable {
        game.join{value: stake}();
    }

    // 3. 移除 commit, reveal, vote, checkOwnRole, checkOtherRole...
}

// ==================================================================================
// Lobby 和 Setup 测试
// [修复] 现在使用 'MinimalPlayerActor'
// ==================================================================================
contract WerewolfLobbyTest {
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

    // --- Lobby Tests ---

    function testLobby_InitialState() public {
        WerewolfGame game = WerewolfGame(payable(factory.createGame(_createStdCfg())));
        Assert.equal(uint(game.phase()), uint(WerewolfGame.Phase.Lobby), "Phase == Lobby");
        Assert.equal(game.host(), host, "Host address is correct");
    }

    function testLobby_HostCannotJoin() public {
        WerewolfGame game = WerewolfGame(payable(factory.createGame(_createStdCfg())));
        (bool ok, ) = address(game).call(
            abi.encodeWithSelector(game.join.selector)
        );
        Assert.equal(ok, false, "Host cannot join the game");
    }

    function testLobby_PlayersCanJoin() public {
        WerewolfGame game = WerewolfGame(payable(factory.createGame(_createStdCfg())));
        // [修复] 使用 MinimalPlayerActor
        MinimalPlayerActor p1 = new MinimalPlayerActor(game);
        MinimalPlayerActor p2 = new MinimalPlayerActor(game);
        p1.joinGame(0);
        p2.joinGame(0);
        Assert.equal(game.seatsCount(), 2, "2 players joined");
        Assert.equal(game.seatOf(address(p1)), 1, "P1 is seat 0 (index+1)");
        Assert.equal(game.seatOf(address(p2)), 2, "P2 is seat 1 (index+1)");
    }

    function testLobby_PlayerCannotJoinTwice() public {
        WerewolfGame game = WerewolfGame(payable(factory.createGame(_createStdCfg())));
        // [修复] 使用 MinimalPlayerActor
        MinimalPlayerActor p1 = new MinimalPlayerActor(game);
        p1.joinGame(0);
        (bool ok, ) = address(p1).call(
            abi.encodeWithSelector(p1.joinGame.selector, 0)
        );
        Assert.equal(ok, false, "Player cannot join twice");
    }

    function testLobby_StartGameFailsIfTooFewPlayers() public {
        WerewolfGame game = WerewolfGame(payable(factory.createGame(_createStdCfg())));
        // [修复] 使用 MinimalPlayerActor
        (new MinimalPlayerActor(game)).joinGame(0);
        (bool ok, ) = address(game).call(
            abi.encodeWithSelector(game.start.selector)
        );
        Assert.equal(ok, false, "start() should revert if seats < minPlayers");
    }

    // --- Setup Tests ---

    function testSetup_AssignRolesFailsWrongLength() public {
        WerewolfGame game = WerewolfGame(payable(factory.createGame(_createStdCfg())));
        // [修复] 使用 MinimalPlayerActor
        (new MinimalPlayerActor(game)).joinGame(0);
        (new MinimalPlayerActor(game)).joinGame(0);
        (new MinimalPlayerActor(game)).joinGame(0);
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
        WerewolfGame game = WerewolfGame(payable(factory.createGame(_createStdCfg())));
        // [修复] 使用 MinimalPlayerActor
        (new MinimalPlayerActor(game)).joinGame(0);
        (new MinimalPlayerActor(game)).joinGame(0);
        (new MinimalPlayerActor(game)).joinGame(0);
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
}
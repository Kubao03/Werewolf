// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * WerewolfGame - V2 with Seer, Witch, Hunter
 *
 * Phases:
 * Lobby -> Setup -> NightCommit -> NightReveal -> NightResolve -> NightWitch -> DayVote -> HunterShot -> Ended
 */

contract WerewolfGame {
    // [MOD] Added NightWitch and HunterShot phases
    enum Phase { Lobby, Setup, NightCommit, NightReveal, NightResolve, DayVote, Ended, NightWitch, HunterShot }
    enum Role  { Villager, Wolf, Seer, Hunter, Witch }
    enum Faction { Good, Wolves }

    struct GameConfig {
        uint8   minPlayers;
        uint8   maxPlayers;
        uint8   wolves;
        uint256 stake;
        uint32  tSetup;
        uint32  tNightCommit;
        uint32  tNightReveal;
        uint32  tDayVote; // Also used for Witch and Hunter
    }

    struct Seat {
        address player;
        bool    alive;
        Role    role;
    }

    address      public host;
    GameConfig   public cfg;
    Phase        public phase;
    uint64       public dayCount;
    uint64       public deadline;

    Seat[] public seats;
    mapping(address => uint8) public seatOf; // 0 = not joined; 1-based index

    // Night Actions
    mapping(address => bytes32) public wolfCommit;
    mapping(address => uint8)   public wolfReveal;
    mapping(address => bool)    public committed;
    mapping(address => bool)    public revealed;
    mapping(address => bool)    public hasUsedNightAbility; // [NEW] Seer, Witch share this status flag

    // [NEW] Witch status
    mapping(address => bool) public hasAntidote;
    mapping(address => bool) public hasPoison;

    // [NEW] Night resolution variables (255 = none)
    uint8 public nightVictim = 255;
    uint8 public poisonVictim = 255;

    // [NEW] Hunter status (0 = none; 1-based index)
    uint8 public hunterToShoot = 0;

    // Day vote
    mapping(address => uint8) public dayVote;
    mapping(uint8  => uint8)  public dayTally;

    // Live counts
    uint32 public aliveWolves;
    uint32 public aliveNonWolves;

    uint256 public sumStakeIn;

    // Events
    event PlayerJoined(address indexed player, uint8 seat);
    event RolesAssigned(uint64 day);
    event PhaseAdvanced(Phase next, uint64 deadline);
    event NightCommitted(address indexed player);
    event NightRevealed(address indexed player, uint8 target);
    event NightResolved(uint8 killedSeat); // 'killedSeat' is now the wolf target, not necessarily dead
    event DayVoted(address indexed voter, uint8 target);
    event PlayerDied(uint8 seat);
    event GameEnded(Faction winner);

    // [NEW] Role Events
    event SeerChecked(address indexed seer, uint8 targetSeat, Faction faction);
    event WitchActed(address indexed witch, uint8 actionType, uint8 targetSeat);

    modifier inPhase(Phase p) { require(phase == p, "bad phase"); _; }
    modifier onlyPlayer() { require(seatOf[msg.sender] > 0, "not joined"); _; }
    modifier onlyAlive() { require(seats[seatOf[msg.sender]-1].alive, "dead"); _; }

    constructor(address _host, GameConfig memory _cfg) {
        require(_cfg.minPlayers >= 3, "min too small");
        require(_cfg.maxPlayers >= _cfg.minPlayers, "max<min");
        require(_cfg.wolves >= 1 && _cfg.wolves < _cfg.maxPlayers, "wolves bad");
        host = _host;
        cfg  = _cfg;
        phase = Phase.Lobby;
    }

    /* ------------ Views ------------ */

    function seatsCount() external view returns (uint256) { return seats.length; }

    function roleOf(address p) external view returns (Role) {
        uint8 s = seatOf[p];
        require(s > 0, "no seat");
        if (phase != Phase.Ended) {
            require(p == msg.sender, "hidden");
        }
        return seats[s-1].role;
    }

    /* ------------ Lobby ------------ */

    function join() external payable inPhase(Phase.Lobby) {
        require(seats.length < cfg.maxPlayers, "full");
        require(seatOf[msg.sender] == 0, "joined");
        require(msg.sender != host, "host cannot join");
        require(msg.value == cfg.stake, "stake mismatch");

        seats.push(Seat({player: msg.sender, alive: true, role: Role.Villager}));
        uint8 seatId = uint8(seats.length - 1);
        seatOf[msg.sender] = seatId + 1;
        if (msg.value > 0) sumStakeIn += msg.value;
        emit PlayerJoined(msg.sender, seatId);
    }

    function start() external inPhase(Phase.Lobby) {
        require(msg.sender == host, "only host");
        require(seats.length >= cfg.minPlayers, "too few");
        _advance(Phase.Setup, cfg.tSetup);
    }

    /* ------------ Restart Game ------------ */

    /**
     * @dev Reset game to initial state (Lobby phase) while keeping all players
     * Only host can call this function
     */
    function restart() external {
        require(msg.sender == host, "only host");
        require(seats.length > 0, "no players");

        // Reset phase to Lobby
        phase = Phase.Lobby;
        dayCount = 0;
        deadline = 0;

        // Reset all seats: alive = true, role = Villager
        uint n = seats.length;
        for (uint i = 0; i < n; i++) {
            seats[i].alive = true;
            seats[i].role = Role.Villager;
        }

        // Reset all game state
        _resetNightState();
        
        // Reset Witch potions
        for (uint i = 0; i < n; i++) {
            address p = seats[i].player;
            if (p != address(0)) {
                hasAntidote[p] = false;
                hasPoison[p] = false;
            }
        }

        // Reset Hunter
        hunterToShoot = 0;

        // Reset alive counts
        aliveWolves = 0;
        aliveNonWolves = 0;

        emit PhaseAdvanced(Phase.Lobby, 0);
    }

    /* ------------ Setup (Host assigns roles) ------------ */

    function assignRoles(Role[] calldata roles) external inPhase(Phase.Setup) {
        require(msg.sender == host, "only host");
        uint n = seats.length;
        require(roles.length == n, "length mismatch");

        uint w = 0;
        for (uint i=0; i<n; i++) {
            seats[i].role = roles[i];
            if (roles[i] == Role.Wolf) {
                w++;
            }
            // [NEW] Initialize Witch potions
            if (roles[i] == Role.Witch) {
                hasAntidote[seats[i].player] = true;
                hasPoison[seats[i].player] = true;
            }
        }
        require(w == cfg.wolves, "wolves count mismatch");

        aliveWolves = uint32(w);
        aliveNonWolves = uint32(n) - aliveWolves;

        dayCount = 1;
        emit RolesAssigned(dayCount);
        _advance(Phase.NightCommit, cfg.tNightCommit);
    }

    /* ------------ Night: Commit (Wolves & Seer) ------------ */

    // [FIX] Renamed function to avoid conflict with 'public wolfCommit' mapping
    function submitWolfCommit(bytes32 commitHash)
        external
        inPhase(Phase.NightCommit)
        onlyPlayer
        onlyAlive
    {
        uint8 s = seatOf[msg.sender]-1;
        require(seats[s].role == Role.Wolf, "not wolf");
        wolfCommit[msg.sender] = commitHash; // Assigns to the mapping
        committed[msg.sender] = true;
        emit NightCommitted(msg.sender);
    }

    /**
     * @dev [NEW] Seer check ability
     */
    function seerCheck(uint8 targetSeat)
        external
        inPhase(Phase.NightCommit)
        onlyPlayer
        onlyAlive
    {
        uint8 s = seatOf[msg.sender]-1;
        require(seats[s].role == Role.Seer, "not seer");
        require(!hasUsedNightAbility[msg.sender], "ability already used");
        require(targetSeat < seats.length, "bad target");

        hasUsedNightAbility[msg.sender] = true;
        
        Faction f = (seats[targetSeat].role == Role.Wolf) ? Faction.Wolves : Faction.Good;
        
        // Seer gets result immediately via event
        emit SeerChecked(msg.sender, targetSeat, f);
    }

    // [RENAME] Clarified advance function name
    function advanceToNightReveal() external inPhase(Phase.NightCommit) {
        require(block.timestamp > deadline, "too early");
        _advance(Phase.NightReveal, cfg.tNightReveal);
    }

    /* ------------ Night: Reveal ------------ */

    // [FIX] Renamed function to avoid conflict with 'public wolfReveal' mapping
    function submitWolfReveal(uint8 targetSeat, bytes32 salt)
        external
        inPhase(Phase.NightReveal)
        onlyPlayer
        onlyAlive
    {
        uint8 s = seatOf[msg.sender]-1;
        require(seats[s].role == Role.Wolf, "not wolf");
        require(targetSeat < seats.length, "bad target");

        bytes32 h = keccak256(abi.encode(address(this), dayCount, targetSeat, salt));
        require(h == wolfCommit[msg.sender], "bad reveal");

        wolfReveal[msg.sender] = targetSeat; // Assigns to the mapping
        revealed[msg.sender] = true;
        emit NightRevealed(msg.sender, targetSeat);
    }

    // [MOD] Now advances to NightResolve
    function advanceToNightResolve() external inPhase(Phase.NightReveal) {
        require(block.timestamp > deadline, "too early");
        _advance(Phase.NightResolve, 5); // 5s for calculation
    }

    /* ------------ Night: Resolve (Tally) ------------ */

    // [MOD] resolveNight now only tallies wolf votes, then advances to Witch phase
    function resolveNight() external inPhase(Phase.NightResolve) {
        uint n = seats.length;
        uint8[] memory tally = new uint8[](n);

        for (uint i=0; i<n; i++) {
            address p = seats[i].player;
            if (seats[i].alive && seats[i].role == Role.Wolf && revealed[p]) {
                uint8 t = wolfReveal[p];
                if (t < n && seats[t].alive) tally[t]++;
            }
        }

        uint8 victim = 255;
        uint8 maxVotes = 0;
        for (uint8 ss=0; ss<n; ss++) {
            if (tally[ss] > maxVotes) { maxVotes = tally[ss]; victim = ss; }
        }

        nightVictim = victim; // Store victim, do not kill yet
        poisonVictim = 255; // Reset poison victim
        emit NightResolved(victim);

        // Do not check win, advance to Witch phase
        _advance(Phase.NightWitch, cfg.tNightReveal); // [MOD] Re-using NightReveal time duration for Witch
    }

    /* ------------ [NEW] Night: Witch ------------ */

    /**
     * @dev [NEW] Witch ability
     * @param actionType 0=Skip, 1=Save, 2=Poison
     * @param targetSeat If actionType=2, this is the poison target
     */
    function witchAct(uint8 actionType, uint8 targetSeat)
        external
        inPhase(Phase.NightWitch)
        onlyPlayer
        onlyAlive
    {
        uint8 s = seatOf[msg.sender]-1;
        require(seats[s].role == Role.Witch, "not witch");
        require(!hasUsedNightAbility[msg.sender], "ability already used");
        
        hasUsedNightAbility[msg.sender] = true;

        if (actionType == 1) { // 1 = Save
            require(hasAntidote[msg.sender], "no antidote");
            require(nightVictim < seats.length, "no one to save");
            hasAntidote[msg.sender] = false;
            nightVictim = 255; // Target is saved
        } 
        else if (actionType == 2) { // 2 = Poison
            require(hasPoison[msg.sender], "no poison");
            require(targetSeat < seats.length && seats[targetSeat].alive, "bad target");
            hasPoison[msg.sender] = false;
            poisonVictim = targetSeat;
        }
        // else actionType == 0 (Skip)

        emit WitchActed(msg.sender, actionType, targetSeat);
    }

    /**
     * @dev [NEW] Resolve Witch actions, apply deaths, and advance to Day
     */
    function resolveWitch() external inPhase(Phase.NightWitch) {
        require(block.timestamp > deadline, "too early");

        // 1. Apply wolf kill (if not saved)
        if (nightVictim < seats.length && seats[nightVictim].alive) {
            _applyDeath(nightVictim);
        }
        // 2. Apply poison kill
        if (poisonVictim < seats.length && seats[poisonVictim].alive) {
            _applyDeath(poisonVictim);
        }

        if (_checkWin()) return; // Check for win

        _resetNightState(); // [NEW] Reset all night states
        _advance(Phase.DayVote, cfg.tDayVote);
    }

    /* ------------ Day: Vote ------------ */

    function vote(uint8 targetSeat) external inPhase(Phase.DayVote) onlyPlayer onlyAlive {
        require(targetSeat < seats.length, "bad target");
        uint8 prev = dayVote[msg.sender];
        if (prev != 0 && dayTally[prev] > 0) dayTally[prev]--;
        dayVote[msg.sender] = targetSeat;
        dayTally[targetSeat]++;
        emit DayVoted(msg.sender, targetSeat);
    }

    // [MOD] resolveDay now handles Hunter
    function resolveDay() external inPhase(Phase.DayVote) {
        uint8 executed = 255;
        uint8 maxVotes = 0;
        for (uint8 s=0; s<seats.length; s++) {
            if (!seats[s].alive) continue;
            uint8 v = dayTally[s];
            if (v > maxVotes) { maxVotes = v; executed = s; }
        }

        if (executed < seats.length && seats[executed].alive) {
            // [NEW] Check for Hunter
            if (seats[executed].role == Role.Hunter) {
                _applyDeath(executed); // Hunter dies
                if (_checkWin()) return; // Check if game ends after hunter death

                // Advance to Hunter phase
                hunterToShoot = seatOf[seats[executed].player]; // Store 1-based index
                _advance(Phase.HunterShot, cfg.tDayVote); // Re-use day vote time
                return; // Interrupt, wait for hunter shot
            }
            
            // Normal death
            _applyDeath(executed);
        }

        if (_checkWin()) return;
        
        dayCount++;
        _resetNightState(); // [NEW] Reset all night states
        _advance(Phase.NightCommit, cfg.tNightCommit);
    }

    /* ------------ [NEW] Day: Hunter Shot ------------ */

    function hunterShoot(uint8 targetSeat) external inPhase(Phase.HunterShot) onlyPlayer {
        require(seatOf[msg.sender] == hunterToShoot, "not you");
        require(targetSeat < seats.length && seats[targetSeat].alive, "bad target");
        
        hunterToShoot = 0; // Prevent double shot
        
        _applyDeath(targetSeat); // Apply hunter's shot

        if (_checkWin()) return; // Check if game ends after hunter shot

        // Game continues
        dayCount++;
        _resetNightState();
        _advance(Phase.NightCommit, cfg.tNightCommit);
    }

    /* ------------ Internal ------------ */

    function _applyDeath(uint8 seatIndex) internal {
        seats[seatIndex].alive = false;
        if (seats[seatIndex].role == Role.Wolf) {
            if (aliveWolves > 0) aliveWolves--;
        } else {
            if (aliveNonWolves > 0) aliveNonWolves--;
        }
        emit PlayerDied(seatIndex);
    }

    function _advance(Phase next, uint32 dur) internal {
        phase = next;
        deadline = uint64(block.timestamp + dur);
        emit PhaseAdvanced(next, deadline);
    }

    /**
     * @dev [NEW] Resets all night states and votes
     */
    function _resetNightState() internal {
        uint n = seats.length;
        for (uint i=0; i < n; i++) {
            address p = seats[i].player;
            if (p != address(0)) {
                // Night ability
                hasUsedNightAbility[p] = false;
                // Wolf
                wolfCommit[p] = 0;
                wolfReveal[p] = 0;
                committed[p] = false;
                revealed[p] = false;
                // Day vote
                dayVote[p] = 0;
            }
            dayTally[uint8(i)] = 0;
        }
        nightVictim = 255;
        poisonVictim = 255;
    }

    function _checkWin() internal returns (bool) {
        if (aliveWolves == 0) {
            _advance(Phase.Ended, 0);
            emit GameEnded(Faction.Good);
            return true;
        }
        if (aliveWolves >= aliveNonWolves) {
            _advance(Phase.Ended, 0);
            emit GameEnded(Faction.Wolves);
            return true;
        }
        return false;
    }
}

/**
 * Factory (unchanged)
 */
contract WerewolfFactory {
    event GameCreated(address indexed game, address indexed host);

    function createGame(WerewolfGame.GameConfig memory cfg)
        external
        returns (address game)
    {
        game = address(new WerewolfGame(msg.sender, cfg));
        emit GameCreated(game, msg.sender);
    }
}
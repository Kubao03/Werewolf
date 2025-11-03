# Werewolf

**Werewolf** is a blockchain-based social deduction game protocol inspired by *Werewolf* (also known as *Mafia*).
This repository currently contains the smart contracts and deployment scripts used in the **Remix IDE**.
Future updates will introduce a front-end interface to enable full gameplay through user interactions with the contracts.

## Project Overview

The goal of this project is to design and implement an on-chain protocol that allows players to join a decentralized “Werewolf” game — handling roles, voting, and game states entirely through smart contracts.

## Structure

* `contracts/` — Solidity smart contracts defining the game logic.
* `scripts/` — Deployment scripts for both Web3.js and Ethers.js environments.
* `Figures/` — Game-related figures or visual assets.
* `.gitignore`, `remix.config.json` — Configuration files for Remix IDE.

## Usage

You can import the project directly into **Remix IDE**:

1. Load the `contracts/` folder to compile the smart contracts.
2. Use the scripts under `scripts/` to deploy via either Web3.js or Ethers.js.
3. Interact with the deployed contracts through Remix or a connected front-end (to be added).

## Future Work

* Develop a web-based front-end for gameplay interaction.
* Implement wallet connections and transaction handling.
* Expand the protocol to support multiple game rooms and sessions.
* Optimize gas costs and enhance contract security.

## License

This project is licensed under the **MIT License**.


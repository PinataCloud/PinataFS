# PinataFS Specification Repo

PinataFS is a permissioned filesystem pattern for EVM chains.

This repository is organized as a spec-first repo:
- The root README defines the PinataFS model, assumptions, and scope.
- Solidity contracts in `smart_contract/` are the reference on-chain implementation.
- TypeScript tooling under `TypeScript/` contains an SDK and demo front-end for quick testing.

## Purpose

PinataFS defines a standard shape for path-addressed content pointers on-chain, where write authority comes from NFT ownership.

Design goals:
- Deterministic path validation rules.
- Strict prefix-based write authorization.
- Simple last-write-wins semantics.
- Minimal on-chain state (latest value only) while preserving history via chain logs.

## Architecture

Two-contract model:
1. `PermissionNFT` (`smart_contract/contracts/PermissionNFT.sol`)
2. `PinataFS` (`smart_contract/contracts/PinataFS.sol`)

Write permission is keyed by `(nftContract, tokenId)`:
- Admin assigns writable prefixes to that key.
- Any current owner of that NFT may write to matching paths.
- NFT transfers move write capability automatically.

## Spec Summary

### Path Rules

Contract-enforced rules:
- Must start with `/`
- No duplicate slashes
- Cannot end with `/`
- Segment charset: `A-Z`, `a-z`, `0-9`, `-`, `_`
- `.` allowed only in the final file segment (max one dot)
- Prefixes cannot contain `.`

Examples:
- Prefix: `/shared/data`
- File path: `/shared/data/sub/file1.json`

### Prefix Authorization

Strict subtree matching:
- `/shared/data` allows `/shared/data/sub/file1`
- `/shared/data` does not allow `/shared/database/file1`

### Write / Read Semantics

- `writeFile` is upsert-only: latest CID overwrites prior CID for that path.
- `getFile` returns latest CID or reverts if missing.
- `fileExists` reports current presence.
- CID formatting is intentionally not hard-enforced on-chain.

### Admin Semantics

`PinataFS.owner()` can:
- Replace the full prefix set for `(nftContract, tokenId)` (`replaceTokenPrefixes`)
- Revoke/unrevoke writes for `(nftContract, tokenId)` (`setTokenWriteRevoked`)
- Transfer ownership, including to `address(0)` to permanently disable admin writes

## Security / Trust Notes

- Reads are public on public chains.
- Authorization depends on `ownerOf(tokenId)` at write time.
- If admin is burned (`transferOwnership(address(0))`), permission config becomes immutable except by NFT transfers.
- Historical changes are reconstructed from blocks/events; contract stores only latest CID per path hash.

## Repository Layout

- `smart_contract` Solidity contracts and Foundry tests
- `TypeScript/SDK` TypeScript SDK (`pinatafs-sdk`)
- `TypeScript/demo` React demo app

## Reference Implementation Quick Start

Prerequisites:
- Node.js `>=18` (`20+` recommended)
- pnpm `>=9`
- Foundry (`forge`)

Install:

```bash
pnpm install
```

Build and test:

```bash
pnpm build:contracts
pnpm test:contracts
pnpm --filter ./TypeScript/SDK build
pnpm --filter ./TypeScript/demo build
```

## Deploy Example (Base Sepolia)

Set env vars:

```bash
export RPC_URL="https://sepolia.base.org"
export PRIVATE_KEY="0x<your_private_key>"
export CHAIN_ID="84532"
export CHAIN_NAME="Base Sepolia"
export CHAIN_CURRENCY_SYMBOL="ETH"
```

Optional NFT metadata:

```bash
export PERMISSION_NFT_NAME="PinataFS Access"
export PERMISSION_NFT_SYMBOL="PFSA"
```

Deploy both contracts:

```bash
pnpm deploy:stack
```

## Demo App

Create env file:

```bash
cp TypeScript/demo/.env.example TypeScript/demo/.env
```

Run:

```bash
pnpm dev
```

## Testnet ETH

Use Coinbase Developer Platform faucet tooling:
- [Coinbase Developer Platform](https://portal.cdp.coinbase.com/)
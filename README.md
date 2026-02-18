# PinataFS Monorepo

PinataFS is a permissioned on-chain filesystem pattern for EVM chains.

This repo contains:
1. `PermissionNFT` (ERC-721 for permission ownership)
2. `PinataFS` (path -> CID storage + permission checks)
3. `@pinatafs/sdk` (deploy/admin/read/write helpers)
4. `front-end-demo` (Vite + React + Wagmi demo UI)

## Workshop Goal
By the end of this workshop, participants can:
1. Deploy `PermissionNFT` and `PinataFS` to Base Sepolia.
2. Mint a permission NFT.
3. Assign multiple writable prefixes to a token.
4. Upload a file to Pinata and write its CID on-chain.
5. Read that CID back from a path.

## Repo Layout
- `smart_contract` - Solidity contracts + Foundry tests
- `sdk` - TypeScript SDK (`@pinatafs/sdk`)
- `front-end-demo` - Demo app

## Prerequisites
- Node.js `>=18` (`20+` recommended)
- pnpm `>=9`
- Foundry (`forge`)
- A funded Base Sepolia wallet
- Pinata JWT + gateway domain (for demo uploads)

Install Foundry if needed:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

## 1) Clone And Install

```bash
git clone <your-repo-url>
cd <repo-directory>
pnpm install
```

## 2) Verify Local Build And Tests

```bash
pnpm build:contracts
pnpm test:contracts
pnpm --filter ./sdk build
pnpm --filter ./front-end-demo build
```

If all commands pass, your local environment is ready.

## 3) Deploy Contracts (Base Sepolia)

Set deploy env vars in the same terminal session:

```bash
export RPC_URL="https://sepolia.base.org"
export PRIVATE_KEY="0x<your_private_key>"
export CHAIN_ID="84532"
export CHAIN_NAME="Base Sepolia"
export CHAIN_CURRENCY_SYMBOL="ETH"
```

Set optional PermissionNFT name/symbol:

```bash
export PERMISSION_NFT_NAME="PinataFS Access"
export PERMISSION_NFT_SYMBOL="PFSA"
```

Deploy both contracts:

```bash
pnpm deploy:stack
```

You should see output with:
- `Permission NFT Address: 0x...`
- `Filesystem Address: 0x...`

Save both addresses.

You can also deploy separately:

```bash
pnpm deploy:permission-nft
pnpm deploy:filesystem
```

## 4) Configure Frontend Demo

Create local env file:

```bash
cp front-end-demo/.env.example front-end-demo/.env
```

Update at minimum:

```bash
VITE_RPC_URL=https://sepolia.base.org
VITE_CHAIN_ID=84532
VITE_CHAIN_NAME=Base Sepolia
VITE_CHAIN_CURRENCY_SYMBOL=ETH
VITE_BLOCK_EXPLORER_URL=https://sepolia.basescan.org

VITE_FILESYSTEM_ADDRESS=0x<PinataFS_address>
VITE_PERMISSION_NFT_ADDRESS=0x<PermissionNFT_address>

VITE_PINATA_JWT=<your_pinata_jwt>
VITE_PINATA_GATEWAY=<your_gateway>.mypinata.cloud
```

## 5) Run Demo App

From repo root:

```bash
pnpm dev
```

Open the local URL printed by Vite.

## 6) Live Workshop Flow (Recommended)

1. Connect wallet in the UI.
2. Confirm chain is Base Sepolia.
3. In `Admin: Mint Permission NFT`, mint a token to your own wallet.
4. In `Admin: Upsert Prefix Permission`, set:
   - NFT contract = demo contract (or custom)
   - token id = minted token id
   - prefixes, one per line (example: `/agent1` and `/shared/data`)
   - click `Sync prefix set` (single transaction)
5. In `Write File`:
   - choose a path under an allowed prefix (example `/agent1/files/manifest.json`)
   - upload file to Pinata (or manually paste a CID)
   - select/provide the NFT contract + token id
   - click `Write CID to filesystem`
6. In `Read File`, read the same path and verify the CID matches.

## Contract Model

### Permission Key
Write permission is keyed by:
- `nftContract`
- `tokenId`

Caller must own `ownerOf(tokenId)` on that contract.

### PinataFS behavior
- Last write wins (`upsert` only).
- Stores latest CID by hashed path key.
- Prefix authorization uses strict subtree matching.
- Owner can replace full prefix set in one transaction.
- Owner can revoke/unrevoke writes for a token.
- Owner can transfer ownership to `address(0)` to permanently disable admin actions.

## Path Rules (Contract-Enforced)
- Path must start with `/`
- No duplicate slashes
- Cannot end with `/`
- Allowed segment chars: `A-Z`, `a-z`, `0-9`, `-`, `_`
- `.` allowed only in final file segment (max one dot)
- Prefixes cannot include `.`
- Strict subtree checks:
  - `/shared/data` allows `/shared/data/sub/file1`
  - `/shared/data` does not allow `/shared/database/file1`

## SDK Quick Example

```ts
import {
  mintPermissionNft,
  replaceTokenPrefixes,
  writeFile,
  readFile
} from "@pinatafs/sdk";

await mintPermissionNft({
  permissionNftAddress,
  publicClient,
  walletClient,
  to: userAddress,
  transferable: false
});

await replaceTokenPrefixes({
  filesystemAddress,
  publicClient,
  walletClient,
  nftContract: permissionNftAddress,
  tokenId: 1n,
  prefixes: ["/agent1", "/shared/data"]
});

await writeFile({
  filesystemAddress,
  publicClient,
  walletClient,
  nftContract: permissionNftAddress,
  tokenId: 1n,
  path: "/agent1/files/manifest.json",
  cid: "bafy..."
});

const cid = await readFile({
  filesystemAddress,
  publicClient,
  path: "/agent1/files/manifest.json"
});
```

## Troubleshooting

### `AbiConstructorNotFoundError` on deploy
- Cause: stale or wrong artifact/ABI path.
- Fix:
  1. `pnpm build:contracts`
  2. re-run deploy
  3. ensure artifact points to `PinataFS.sol/PinataFS.json` if overridden

### `getFile` revert decode signature errors in frontend
- Cause: frontend SDK ABI does not match deployed contract.
- Fix:
  1. rebuild SDK/frontend
  2. verify `VITE_FILESYSTEM_ADDRESS` points to a fresh `PinataFS` deployment

### Base Sepolia multicall3 errors
- Ensure frontend chain env is correct.
- Optionally set:
  - `VITE_MULTICALL3_ADDRESS=0xcA11bde05977b3631167028862bE2a173976CA11`
  - `VITE_MULTICALL3_BLOCK_CREATED=1059647`

### Write fails with unauthorized/not token owner
- Verify the connected wallet currently owns the token.
- Verify write path is under an allowed prefix.
- Verify token write revocation is not enabled.

### Admin prefix sync fails
- Only `PinataFS.owner()` can replace prefixes or revoke token writes.

## Security Notes
- Reads are public on public chains.
- CID format is not strictly enforced on-chain.
- Demo frontend exposes Pinata credentials via browser env vars.
- Do not use the demo credential model in production.

## Current Scope
- Upsert-only writes (no delete)
- No on-chain `ls`/pagination index yet
- Chain history/events act as write history

## Key Files
- `smart_contract/contracts/PermissionNFT.sol`
- `smart_contract/contracts/PinataFS.sol`
- `smart_contract/test/PinataFS.t.sol`
- `sdk/src/index.ts`
- `front-end-demo/src/App.tsx`

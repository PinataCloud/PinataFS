# Front-end Demo

Vite + React + Wagmi demo for the two-contract filesystem model.

The demo uses:

- `@pinatafs/sdk`
- `pinata` SDK

## What it can do

- Connect wallet
- Read a CID from filesystem path
- Show up to 10 demo ERC-721 tokens by probing token ids `1..10` on the configured demo NFT contract
- Select a demo token to prefill write token inputs
- Manually set NFT contract + token id for write operations
- Resolve and display filesystem prefixes for the selected `(nftContract, tokenId)`
- Upload a file to Pinata and prefill CID field
- Write CID to chain using the provided NFT contract + token id
- Admin mint permission NFTs
- Admin replace prefix permissions on PinataFS (using either demo NFT contract or a manually entered NFT contract)

## Required env vars

Copy example:

```bash
cp front-end-demo/.env.example front-end-demo/.env
```

Important values:

- `VITE_RPC_URL`
- `VITE_CHAIN_ID`
- `VITE_FILESYSTEM_ADDRESS`
- `VITE_PERMISSION_NFT_ADDRESS`
- `VITE_PINATA_JWT`
- `VITE_PINATA_GATEWAY`

Optional:

- `VITE_CHAIN_NAME`
- `VITE_CHAIN_CURRENCY_SYMBOL`
- `VITE_BLOCK_EXPLORER_URL`
- `VITE_MULTICALL3_ADDRESS`
- `VITE_MULTICALL3_BLOCK_CREATED`

## Run

From repo root:

```bash
pnpm --filter ./front-end-demo dev
```

## Contract expectations

- `VITE_PERMISSION_NFT_ADDRESS` points to an ERC-721 collection used for permissions in the demo list and admin mint flow.
- `VITE_FILESYSTEM_ADDRESS` points to the PinataFS contract.
- Filesystem write calls always use `(nftContract, tokenId)`.
- Ownership and path authorization are enforced on-chain at write time.

## Demo security note

This app intentionally loads Pinata JWT + gateway from frontend env vars.
Those values are exposed to browser clients and are not production-safe.
Use backend-managed credentials for real deployments.

# PinataFS Demo

Vite + React + Wagmi demo for PinataFS.

## What it demonstrates

- Connect wallet
- Read CID by filesystem path
- Demo ERC-721 discovery by probing token IDs `1..10`
- Select token to prefill NFT contract + token ID for write
- Inspect permissions for selected `(nftContract, tokenId)`
- Upload file to Pinata and prefill CID
- Write CID to PinataFS
- Admin mint and prefix replacement flows

## Environment

Copy env file:

```bash
cp TypeScript/demo/.env.example TypeScript/demo/.env
```

Key values:
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
pnpm --filter ./TypeScript/demo dev
```

## Security Note

This demo reads Pinata credentials from frontend env vars, which are visible to browser clients. This is for demo/workshop use only and not production-safe.

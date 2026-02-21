# pinatafs-sdk

TypeScript SDK for PinataFS.

## Features

- Deploy example `PermissionNFT`, `PinataFS`, or both
- Mint example permission NFTs
- Replace all prefixes for `(nftContract, tokenId)` in one transaction
- Write file CIDs using explicit NFT contract + token ID
- Read CIDs by path
- Validate paths/prefixes with the same rules as the contract

## Important

- `PermissionNFT` in this repo is only a reference/example ERC-721.
- `PinataFS` works with any ERC-721 collection that implements `ownerOf(uint256)`.
- You can use external NFT contracts for permissions without deploying `PermissionNFT`.

## Build

From repo root:

```bash
pnpm --filter ./TypeScript/SDK build
```

## Main APIs

Filesystem:
- `readFile`
- `fileExists`
- `writeFile`
- `canWritePath`
- `getTokenPrefixes`
- `replaceTokenPrefixes`
- `setTokenWriteRevoked`

Permission NFT:
- `mintPermissionNft`
- `isPermissionNftTransferable`
- `listOwnedTokenIds`

Validation / helpers:
- `validatePrefixPath`
- `validateFilePath`
- `parsePrefixes`
- `buildIpfsGatewayUrl`

## Path Rules

- Must start with `/`
- No duplicate slashes
- Cannot end with `/`
- Allowed chars in segments: `A-Z`, `a-z`, `0-9`, `-`, `_`
- `.` only allowed in final file segment (max one)
- Prefixes cannot include `.`

## Example

```ts
import {
  mintPermissionNft,
  replaceTokenPrefixes,
  writeFile,
  readFile
} from "pinatafs-sdk";

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

## Deploy CLI

Build contracts first:

```bash
pnpm build:contracts
```

Required env:
- `RPC_URL`
- `PRIVATE_KEY`
- `CHAIN_ID`

Optional env:
- `CHAIN_NAME`
- `CHAIN_CURRENCY_SYMBOL`
- `PERMISSION_NFT_NAME`
- `PERMISSION_NFT_SYMBOL`

Commands:

```bash
pnpm --filter ./TypeScript/SDK deploy:filesystem
pnpm --filter ./TypeScript/SDK deploy:permission-nft
pnpm --filter ./TypeScript/SDK deploy:stack
```

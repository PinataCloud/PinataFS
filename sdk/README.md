# @pinatafs/sdk

TypeScript SDK for the split PinataFS architecture:

- `PermissionNFT` (ERC-721 mint/ownership)
- `PinataFS` (prefix permissions + file writes)

## Features

- Deploy `PermissionNFT`, `PinataFS`, or both
- Mint permission NFTs
- Replace filesystem prefix permissions for `(nftContract, tokenId)` in one transaction
- Write file CIDs with explicit token selection
- Read CIDs by path
- Scan owned token IDs (with multicall fallback)
- Auto-pick a writable token for a path
- Path/prefix validators that match contract rules

## Install (workspace)

From repo root:

```bash
pnpm install
```

## Build

```bash
pnpm --filter ./sdk build
```

## Path rules (contract-enforced)

- Must start with `/`
- No duplicate slashes
- Allowed chars in segments: `A-Z`, `a-z`, `0-9`, `-`, `_`
- `.` only allowed in final file segment (max one dot)
- Prefixes cannot contain dots

## Main API surface

Filesystem reads/writes:

- `readFile`
- `fileExists`
- `writeFile`
- `writeFileWithAutoToken`
- `canWritePath`
- `getTokenPrefixes`
- `replaceTokenPrefixes`
- `setTokenWriteRevoked`

Permission NFT helpers:

- `mintPermissionNft`
- `listOwnedTokenIds`
- `listOwnedTokenIdsViaAlchemy`
- `isPermissionNftTransferable`

`listOwnedTokenIds` is compatible with typical external ERC-721 collections:
- it discovers candidate token IDs from `Transfer` logs to the owner
- then verifies current ownership via `ownerOf`
- optional `startBlock` in `TokenScanOptions` can dramatically speed up scans

`listOwnedTokenIdsViaAlchemy` uses Alchemy NFT API `getNFTsForOwner` for faster indexed lookups.

Validation helpers:

- `validatePrefixPath`
- `validateFilePath`
- `isValidPrefixPath`
- `isValidFilePath`

Utilities:

- `parsePrefixes`
- `buildIpfsGatewayUrl`

## Example flow

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

## Deployment CLI

Build contracts first:

```bash
pnpm build:contracts
```

Set env:

- `RPC_URL`
- `PRIVATE_KEY`
- `CHAIN_ID`
- optional: `CHAIN_NAME`, `CHAIN_CURRENCY_SYMBOL`

Deploy filesystem:

```bash
pnpm --filter ./sdk deploy:filesystem
```

Deploy permission NFT:

```bash
pnpm --filter ./sdk deploy:permission-nft
```

Deploy both:

```bash
pnpm --filter ./sdk deploy:stack
```

Optional envs:

- `PERMISSION_NFT_NAME`, `PERMISSION_NFT_SYMBOL`
- `FILESYSTEM_FOUNDRY_ARTIFACT_PATH`
- `PERMISSION_NFT_FOUNDRY_ARTIFACT_PATH`
- `FOUNDRY_ARTIFACT_PATH` (filesystem fallback)

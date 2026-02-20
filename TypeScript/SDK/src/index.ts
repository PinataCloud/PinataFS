import {
  getAddress,
  isAddressEqual,
  parseAbiItem,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient
} from "viem";
import type { Account } from "viem/accounts";

import { permissionNftAbi, pinataFsAbi } from "./abi.js";

export { permissionNftAbi, pinataFsAbi } from "./abi.js";

type WriteAccount = Address | Account;

const erc721TransferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
);

export interface ReadParams {
  filesystemAddress: Address;
  publicClient: PublicClient;
}

export interface WriteParams extends ReadParams {
  walletClient: WalletClient;
  account?: WriteAccount;
}

export interface PermissionNftReadParams {
  permissionNftAddress: Address;
  publicClient: PublicClient;
}

export interface PermissionNftWriteParams extends PermissionNftReadParams {
  walletClient: WalletClient;
  account?: WriteAccount;
}

export interface TokenScanOptions {
  batchSize?: number;
  startBlock?: bigint;
  endBlock?: bigint;
  blockBatchSize?: bigint;
  // Deprecated compatibility fields from old nextTokenId scan flow.
  startTokenId?: bigint;
  endTokenId?: bigint;
}

export interface AlchemyTokenListParams {
  owner: Address;
  permissionNftAddress: Address;
  alchemyApiKey: string;
  alchemyNftApiBaseUrl: string;
  pageSize?: number;
}

export interface AutoWriteResult {
  hash: Hash;
  tokenId: bigint;
}

interface PathValidationOptions {
  allowDotInFinalSegment: boolean;
  allowRootOnly: boolean;
  label: string;
}

function validatePathValue(path: string, options: PathValidationOptions): void {
  const { allowDotInFinalSegment, allowRootOnly, label } = options;
  const length = path.length;

  if (length === 0 || path[0] !== "/") {
    throw new Error(`${label} must start with "/".`);
  }

  if (length === 1) {
    if (!allowRootOnly) {
      throw new Error(`${label} cannot be root "/".`);
    }
    return;
  }

  let previousWasSlash = true;
  let segmentLength = 0;
  let segmentDotCount = 0;
  let segmentEndsWithDot = false;

  for (let i = 1; i < length; i++) {
    const current = path[i];

    if (current === "/") {
      if (previousWasSlash) {
        throw new Error(`${label} cannot contain duplicate slashes.`);
      }

      if (segmentDotCount > 0) {
        throw new Error(`${label} can only use "." in the final segment.`);
      }

      previousWasSlash = true;
      segmentLength = 0;
      segmentDotCount = 0;
      segmentEndsWithDot = false;
      continue;
    }

    const code = current.charCodeAt(0);
    const isUpperAlpha = code >= 65 && code <= 90;
    const isLowerAlpha = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;

    if (isUpperAlpha || isLowerAlpha || isDigit || current === "-" || current === "_") {
      segmentEndsWithDot = false;
    } else if (current === ".") {
      if (!allowDotInFinalSegment) {
        throw new Error(`${label} cannot include ".".`);
      }
      if (segmentLength === 0) {
        throw new Error(`${label} segment cannot start with ".".`);
      }

      segmentDotCount += 1;
      if (segmentDotCount > 1) {
        throw new Error(`${label} final segment can include at most one ".".`);
      }

      segmentEndsWithDot = true;
    } else {
      throw new Error(
        `${label} contains invalid character "${current}". Allowed: A-Z, a-z, 0-9, "-", "_"${
          allowDotInFinalSegment ? ', and "." in the final segment.' : "."
        }`
      );
    }

    segmentLength += 1;
    previousWasSlash = false;
  }

  if (previousWasSlash) {
    throw new Error(`${label} cannot end with "/".`);
  }

  if (segmentLength === 0) {
    throw new Error(`${label} contains an empty trailing segment.`);
  }

  if (segmentEndsWithDot) {
    throw new Error(`${label} segment cannot end with ".".`);
  }

  if (!allowDotInFinalSegment && segmentDotCount > 0) {
    throw new Error(`${label} cannot include ".".`);
  }
}

function resolveWriteAccount(walletClient: WalletClient, account?: WriteAccount): WriteAccount {
  if (account) return account;

  if (walletClient.account) {
    return walletClient.account;
  }

  throw new Error("No wallet account is configured. Pass `account` explicitly.");
}

function resolveBatchSize(batchSize?: number): number {
  if (!batchSize || batchSize < 1) return 100;
  return Math.min(batchSize, 500);
}

function resolveBlockBatchSize(blockBatchSize?: bigint): bigint {
  if (!blockBatchSize || blockBatchSize < 1n) return 50_000n;
  return blockBatchSize;
}

function normalizeOwner(owner: Address): Address {
  return getAddress(owner);
}

function normalizeAlchemyBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("Alchemy NFT API base URL is required.");
  }
  return trimmed;
}

function resolveAlchemyPageSize(pageSize?: number): number {
  if (!pageSize || pageSize < 1) return 100;
  return Math.min(pageSize, 100);
}

function sortTokenIds(tokenIds: bigint[]): bigint[] {
  return tokenIds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function parseTokenId(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

export function validatePrefixPath(prefix: string): void {
  validatePathValue(prefix, {
    allowDotInFinalSegment: false,
    allowRootOnly: true,
    label: "Prefix path"
  });
}

export function validateFilePath(path: string): void {
  validatePathValue(path, {
    allowDotInFinalSegment: true,
    allowRootOnly: false,
    label: "File path"
  });
}

export function isValidPrefixPath(prefix: string): boolean {
  try {
    validatePrefixPath(prefix);
    return true;
  } catch {
    return false;
  }
}

export function isValidFilePath(path: string): boolean {
  try {
    validateFilePath(path);
    return true;
  } catch {
    return false;
  }
}

export async function listOwnedTokenIdsViaAlchemy(
  params: AlchemyTokenListParams
): Promise<bigint[]> {
  const owner = normalizeOwner(params.owner);
  const permissionNftAddress = getAddress(params.permissionNftAddress);
  const apiKey = params.alchemyApiKey.trim();
  const baseUrl = normalizeAlchemyBaseUrl(params.alchemyNftApiBaseUrl);

  if (!apiKey) {
    throw new Error("Alchemy API key is required.");
  }

  const pageSize = resolveAlchemyPageSize(params.pageSize);
  const tokenIds = new Set<bigint>();
  let pageKey: string | undefined;

  while (true) {
    const url = new URL(`${baseUrl}/${encodeURIComponent(apiKey)}/getNFTsForOwner`);
    url.searchParams.set("owner", owner);
    url.searchParams.set("withMetadata", "false");
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.append("contractAddresses[]", permissionNftAddress);
    if (pageKey) {
      url.searchParams.set("pageKey", pageKey);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`Alchemy NFT API request failed (${response.status} ${response.statusText}).`);
    }

    const json = (await response.json()) as {
      pageKey?: unknown;
      ownedNfts?: Array<{
        tokenId?: unknown;
        id?: { tokenId?: unknown };
      }>;
    };

    const ownedNfts = Array.isArray(json.ownedNfts) ? json.ownedNfts : [];
    for (const nft of ownedNfts) {
      const tokenId =
        parseTokenId(nft.tokenId) ??
        parseTokenId(nft.id?.tokenId);

      if (tokenId !== null) {
        tokenIds.add(tokenId);
      }
    }

    if (typeof json.pageKey === "string" && json.pageKey.length > 0) {
      pageKey = json.pageKey;
    } else {
      break;
    }
  }

  return sortTokenIds(Array.from(tokenIds));
}

async function getReceivedTransferTokenIds(
  params: PermissionNftReadParams & {
    owner: Address;
    fromBlock: bigint;
    toBlock: bigint;
  }
): Promise<bigint[]> {
  if (params.toBlock < params.fromBlock) return [];

  try {
    const logs = await params.publicClient.getLogs({
      address: params.permissionNftAddress,
      event: erc721TransferEvent,
      args: { to: params.owner },
      fromBlock: params.fromBlock,
      toBlock: params.toBlock
    });

    const tokenIds: bigint[] = [];
    for (const log of logs) {
      const tokenId = log.args.tokenId;
      if (typeof tokenId === "bigint") {
        tokenIds.push(tokenId);
      }
    }

    return tokenIds;
  } catch {
    // Some RPC providers enforce max block ranges/log counts. Split range and retry.
    if (params.fromBlock === params.toBlock) {
      return [];
    }

    const midpoint = params.fromBlock + (params.toBlock - params.fromBlock) / 2n;
    const left = await getReceivedTransferTokenIds({
      ...params,
      toBlock: midpoint
    });
    const right = await getReceivedTransferTokenIds({
      ...params,
      fromBlock: midpoint + 1n
    });

    return [...left, ...right];
  }
}

export async function getTokenPrefixes(
  params: ReadParams & { nftContract: Address; tokenId: bigint }
): Promise<string[]> {
  const prefixes = await params.publicClient.readContract({
    address: params.filesystemAddress,
    abi: pinataFsAbi,
    functionName: "getTokenPrefixes",
    args: [params.nftContract, params.tokenId]
  });

  return [...prefixes];
}

export async function isTokenWriteRevoked(
  params: ReadParams & { nftContract: Address; tokenId: bigint }
): Promise<boolean> {
  return params.publicClient.readContract({
    address: params.filesystemAddress,
    abi: pinataFsAbi,
    functionName: "tokenWriteRevoked",
    args: [params.nftContract, params.tokenId]
  });
}

export async function tokenHasPrefix(
  params: ReadParams & { nftContract: Address; tokenId: bigint; prefix: string }
): Promise<boolean> {
  validatePrefixPath(params.prefix);

  return params.publicClient.readContract({
    address: params.filesystemAddress,
    abi: pinataFsAbi,
    functionName: "tokenHasPrefix",
    args: [params.nftContract, params.tokenId, params.prefix]
  });
}

export async function readFile(params: ReadParams & { path: string }): Promise<string> {
  validateFilePath(params.path);

  return params.publicClient.readContract({
    address: params.filesystemAddress,
    abi: pinataFsAbi,
    functionName: "getFile",
    args: [params.path]
  });
}

export async function fileExists(params: ReadParams & { path: string }): Promise<boolean> {
  validateFilePath(params.path);

  return params.publicClient.readContract({
    address: params.filesystemAddress,
    abi: pinataFsAbi,
    functionName: "fileExists",
    args: [params.path]
  });
}

export async function canWritePath(
  params: ReadParams & { nftContract: Address; tokenId: bigint; account: Address; path: string }
): Promise<boolean> {
  validateFilePath(params.path);

  return params.publicClient.readContract({
    address: params.filesystemAddress,
    abi: pinataFsAbi,
    functionName: "canWritePath",
    args: [params.nftContract, params.tokenId, params.account, params.path]
  });
}

export async function mintPermissionNft(
  params: PermissionNftWriteParams & { to: Address; transferable: boolean }
): Promise<Hash> {
  return params.walletClient.writeContract({
    account: resolveWriteAccount(params.walletClient, params.account),
    address: params.permissionNftAddress,
    abi: permissionNftAbi,
    chain: params.walletClient.chain ?? undefined,
    functionName: "mintAccessToken",
    args: [params.to, params.transferable]
  });
}

export async function isPermissionNftTransferable(
  params: PermissionNftReadParams & { tokenId: bigint }
): Promise<boolean | null> {
  try {
    const transferable = await params.publicClient.readContract({
      address: params.permissionNftAddress,
      abi: permissionNftAbi,
      functionName: "tokenTransferable",
      args: [params.tokenId]
    });

    return Boolean(transferable);
  } catch {
    return null;
  }
}

export async function replaceTokenPrefixes(
  params: WriteParams & { nftContract: Address; tokenId: bigint; prefixes: string[] }
): Promise<Hash> {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const prefix of params.prefixes) {
    validatePrefixPath(prefix);
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    normalized.push(prefix);
  }

  return params.walletClient.writeContract({
    account: resolveWriteAccount(params.walletClient, params.account),
    address: params.filesystemAddress,
    abi: pinataFsAbi,
    chain: params.walletClient.chain ?? undefined,
    functionName: "replaceTokenPrefixes",
    args: [params.nftContract, params.tokenId, normalized]
  });
}

export async function setTokenWriteRevoked(
  params: WriteParams & { nftContract: Address; tokenId: bigint; revoked: boolean }
): Promise<Hash> {
  return params.walletClient.writeContract({
    account: resolveWriteAccount(params.walletClient, params.account),
    address: params.filesystemAddress,
    abi: pinataFsAbi,
    chain: params.walletClient.chain ?? undefined,
    functionName: "setTokenWriteRevoked",
    args: [params.nftContract, params.tokenId, params.revoked]
  });
}

export async function writeFile(
  params: WriteParams & { nftContract: Address; tokenId: bigint; path: string; cid: string }
): Promise<Hash> {
  validateFilePath(params.path);

  return params.walletClient.writeContract({
    account: resolveWriteAccount(params.walletClient, params.account),
    address: params.filesystemAddress,
    abi: pinataFsAbi,
    chain: params.walletClient.chain ?? undefined,
    functionName: "writeFile",
    args: [params.nftContract, params.tokenId, params.path, params.cid]
  });
}

export async function listOwnedTokenIds(
  params: PermissionNftReadParams & { owner: Address; options?: TokenScanOptions }
): Promise<bigint[]> {
  const owner = normalizeOwner(params.owner);
  const fromBlock = params.options?.startBlock ?? 0n;
  const latestBlock = await params.publicClient.getBlockNumber();
  const toBlock = params.options?.endBlock ?? latestBlock;

  if (toBlock < fromBlock) return [];

  const blockBatchSize = resolveBlockBatchSize(params.options?.blockBatchSize);
  const candidateTokenIds = new Set<bigint>();

  for (let cursor = fromBlock; cursor <= toBlock; cursor += blockBatchSize) {
    const upper = cursor + blockBatchSize - 1n > toBlock ? toBlock : cursor + blockBatchSize - 1n;
    const receivedTokenIds = await getReceivedTransferTokenIds({
      permissionNftAddress: params.permissionNftAddress,
      publicClient: params.publicClient,
      owner,
      fromBlock: cursor,
      toBlock: upper
    });

    for (const tokenId of receivedTokenIds) {
      candidateTokenIds.add(tokenId);
    }
  }

  if (candidateTokenIds.size === 0) return [];

  const tokenIds = sortTokenIds(Array.from(candidateTokenIds));
  const batchSize = resolveBatchSize(params.options?.batchSize);
  const ownedTokenIds: bigint[] = [];

  for (let i = 0; i < tokenIds.length; i += batchSize) {
    const chunk = tokenIds.slice(i, i + batchSize);

    try {
      const ownerChecks = await params.publicClient.multicall({
        allowFailure: true,
        contracts: chunk.map((tokenId) => ({
          address: params.permissionNftAddress,
          abi: permissionNftAbi,
          functionName: "ownerOf",
          args: [tokenId]
        }))
      });

      for (let i = 0; i < ownerChecks.length; i++) {
        const check = ownerChecks[i];
        if (check.status !== "success") continue;
        if (isAddressEqual(check.result as Address, owner)) {
          ownedTokenIds.push(chunk[i]);
        }
      }
    } catch {
      // Fallback for chains/clients without multicall3 configured.
      for (const tokenId of chunk) {
        try {
          const tokenOwner = await params.publicClient.readContract({
            address: params.permissionNftAddress,
            abi: permissionNftAbi,
            functionName: "ownerOf",
            args: [tokenId]
          });

          if (isAddressEqual(tokenOwner as Address, owner)) {
            ownedTokenIds.push(tokenId);
          }
        } catch {
          // Skip tokens that fail owner lookup.
        }
      }
    }
  }

  return sortTokenIds(ownedTokenIds);
}

export async function findWritableTokenId(
  params: ReadParams & {
    permissionNftAddress: Address;
    owner: Address;
    path: string;
    options?: TokenScanOptions;
  }
): Promise<bigint | null> {
  validateFilePath(params.path);

  const owner = normalizeOwner(params.owner);
  const ownedTokenIds = await listOwnedTokenIds({
    permissionNftAddress: params.permissionNftAddress,
    publicClient: params.publicClient,
    owner,
    options: params.options
  });

  if (ownedTokenIds.length === 0) return null;

  const batchSize = resolveBatchSize(params.options?.batchSize);

  for (let i = 0; i < ownedTokenIds.length; i += batchSize) {
    const chunk = ownedTokenIds.slice(i, i + batchSize);

    try {
      const checks = await params.publicClient.multicall({
        allowFailure: true,
        contracts: chunk.map((tokenId) => ({
          address: params.filesystemAddress,
          abi: pinataFsAbi,
          functionName: "canWritePath",
          args: [params.permissionNftAddress, tokenId, owner, params.path]
        }))
      });

      for (let j = 0; j < checks.length; j++) {
        const check = checks[j];
        if (check.status !== "success") continue;
        if (check.result) {
          return chunk[j];
        }
      }
    } catch {
      // Fallback for chains/clients without multicall3 configured.
      for (const tokenId of chunk) {
        try {
          const canWrite = await params.publicClient.readContract({
            address: params.filesystemAddress,
            abi: pinataFsAbi,
            functionName: "canWritePath",
            args: [params.permissionNftAddress, tokenId, owner, params.path]
          });

          if (canWrite) {
            return tokenId;
          }
        } catch {
          // Skip token checks that fail.
        }
      }
    }
  }

  return null;
}

export async function writeFileWithAutoToken(
  params: WriteParams & {
    permissionNftAddress: Address;
    owner: Address;
    path: string;
    cid: string;
    tokenScanOptions?: TokenScanOptions;
  }
): Promise<AutoWriteResult> {
  validateFilePath(params.path);

  const tokenId = await findWritableTokenId({
    filesystemAddress: params.filesystemAddress,
    publicClient: params.publicClient,
    permissionNftAddress: params.permissionNftAddress,
    owner: params.owner,
    path: params.path,
    options: params.tokenScanOptions
  });

  if (tokenId === null) {
    throw new Error("No writable token found for this account and path.");
  }

  const hash = await writeFile({
    filesystemAddress: params.filesystemAddress,
    publicClient: params.publicClient,
    walletClient: params.walletClient,
    account: params.account,
    nftContract: params.permissionNftAddress,
    tokenId,
    path: params.path,
    cid: params.cid
  });

  return { hash, tokenId };
}

export function parsePrefixes(prefixList: string): string[] {
  const prefixes = prefixList
    .split(/\r?\n|,/)
    .map((prefix) => prefix.trim())
    .filter((prefix) => prefix.length > 0);

  for (const prefix of prefixes) {
    validatePrefixPath(prefix);
  }

  return prefixes;
}

export function buildIpfsGatewayUrl(gateway: string, cid: string): string {
  const trimmedGateway = gateway.trim();
  if (!trimmedGateway) {
    throw new Error("Gateway value is required.");
  }

  const trimmedCid = cid.trim();
  if (!trimmedCid) {
    throw new Error("CID value is required.");
  }

  const withProtocol =
    trimmedGateway.startsWith("http://") || trimmedGateway.startsWith("https://")
      ? trimmedGateway
      : `https://${trimmedGateway}`;

  return `${withProtocol.replace(/\/+$/, "")}/ipfs/${trimmedCid}`;
}

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient
} from "viem";
import { privateKeyToAccount, type Account } from "viem/accounts";

import { permissionNftAbi, pinataFsAbi } from "./abi.js";

interface FoundryArtifact {
  bytecode?: {
    object?: string;
  } | string;
}

export interface NodeClients {
  account: Account;
  chain: Chain;
  publicClient: PublicClient;
  walletClient: WalletClient;
}

export interface DeployFilesystemParams {
  account?: Address | Account;
  artifactPath?: string;
  bytecode?: Hex;
  publicClient: PublicClient;
  walletClient: WalletClient;
}

export interface DeployPermissionNftParams {
  account?: Address | Account;
  artifactPath?: string;
  bytecode?: Hex;
  name: string;
  publicClient: PublicClient;
  symbol: string;
  walletClient: WalletClient;
}

export interface DeployContractResult {
  address: Address;
  hash: Hex;
}

export interface DeployStackResult {
  filesystem: DeployContractResult;
  permissionNft: DeployContractResult;
}

function resolveWriteAccount(walletClient: WalletClient, account?: Address | Account): Address | Account {
  if (account) return account;
  if (walletClient.account) return walletClient.account;
  throw new Error("No wallet account is configured. Pass `account` explicitly.");
}

function resolveDefaultArtifactPath(relativePath: string): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  const searchRoots = [
    currentDir,
    path.resolve(currentDir, ".."),
    path.resolve(currentDir, "../.."),
    path.resolve(currentDir, "../../..")
  ];

  for (const searchRoot of searchRoots) {
    const candidateOutDir = path.resolve(searchRoot, "smart_contract/out");
    if (existsSync(candidateOutDir)) {
      return path.resolve(candidateOutDir, relativePath);
    }
  }

  throw new Error(
    `Could not locate Foundry artifacts under smart_contract/out relative to ${currentDir}. ` +
      "Set FILESYSTEM_FOUNDRY_ARTIFACT_PATH or PERMISSION_NFT_FOUNDRY_ARTIFACT_PATH explicitly."
  );
}

function resolveDefaultFilesystemArtifactPath(): string {
  return resolveDefaultArtifactPath("PinataFS.sol/PinataFS.json");
}

function resolveDefaultPermissionNftArtifactPath(): string {
  return resolveDefaultArtifactPath("PermissionNFT.sol/PermissionNFT.json");
}

export async function loadBytecodeFromFoundryArtifact(artifactPath: string): Promise<Hex> {
  const artifactRaw = await readFile(artifactPath, "utf8");
  const artifact = JSON.parse(artifactRaw) as FoundryArtifact;

  const bytecodeValue =
    typeof artifact.bytecode === "string" ? artifact.bytecode : artifact.bytecode?.object ?? "";

  if (!bytecodeValue || bytecodeValue === "0x") {
    throw new Error(`Invalid bytecode in artifact: ${artifactPath}`);
  }

  return bytecodeValue as Hex;
}

export async function loadFilesystemBytecode(artifactPath?: string): Promise<Hex> {
  return loadBytecodeFromFoundryArtifact(artifactPath ?? resolveDefaultFilesystemArtifactPath());
}

export async function loadPermissionNftBytecode(artifactPath?: string): Promise<Hex> {
  return loadBytecodeFromFoundryArtifact(artifactPath ?? resolveDefaultPermissionNftArtifactPath());
}

export async function deployFilesystem(
  params: DeployFilesystemParams
): Promise<DeployContractResult> {
  const account = resolveWriteAccount(params.walletClient, params.account);
  const bytecode = params.bytecode ?? (await loadFilesystemBytecode(params.artifactPath));

  const hash = await params.walletClient.deployContract({
    account,
    abi: pinataFsAbi,
    args: [],
    chain: params.walletClient.chain ?? undefined,
    bytecode
  });

  const receipt = await params.publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    throw new Error("Deployment transaction mined without a contract address.");
  }

  return {
    address: receipt.contractAddress,
    hash
  };
}

export async function deployPermissionNft(
  params: DeployPermissionNftParams
): Promise<DeployContractResult> {
  const account = resolveWriteAccount(params.walletClient, params.account);
  const bytecode = params.bytecode ?? (await loadPermissionNftBytecode(params.artifactPath));

  const hash = await params.walletClient.deployContract({
    account,
    abi: permissionNftAbi,
    args: [params.name, params.symbol],
    chain: params.walletClient.chain ?? undefined,
    bytecode
  });

  const receipt = await params.publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    throw new Error("Deployment transaction mined without a contract address.");
  }

  return {
    address: receipt.contractAddress,
    hash
  };
}

export function createNodeClientsFromEnv(): NodeClients {
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  const chainIdRaw = process.env.CHAIN_ID;

  if (!rpcUrl) throw new Error("Missing RPC_URL env var.");
  if (!privateKey) throw new Error("Missing PRIVATE_KEY env var.");
  if (!chainIdRaw) throw new Error("Missing CHAIN_ID env var.");

  const chainId = Number(chainIdRaw);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error(`Invalid CHAIN_ID value: ${chainIdRaw}`);
  }

  const chainName = process.env.CHAIN_NAME ?? `EVM-${chainId}`;
  const chainCurrencySymbol = process.env.CHAIN_CURRENCY_SYMBOL ?? "ETH";

  const chain = defineChain({
    id: chainId,
    name: chainName,
    network: chainName.toLowerCase().replace(/\s+/g, "-"),
    nativeCurrency: {
      name: chainCurrencySymbol,
      symbol: chainCurrencySymbol,
      decimals: 18
    },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] }
    }
  });

  const account = privateKeyToAccount(privateKey as Hex);
  const transport = http(rpcUrl);

  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  return {
    account,
    chain,
    publicClient,
    walletClient
  };
}

export async function deployFilesystemFromEnv(params?: {
  artifactPath?: string;
}): Promise<DeployContractResult> {
  const clients = createNodeClientsFromEnv();

  return deployFilesystem({
    account: clients.account,
    artifactPath: params?.artifactPath,
    publicClient: clients.publicClient,
    walletClient: clients.walletClient
  });
}

export async function deployPermissionNftFromEnv(params?: {
  artifactPath?: string;
  name?: string;
  symbol?: string;
}): Promise<DeployContractResult> {
  const clients = createNodeClientsFromEnv();

  const name = params?.name ?? process.env.PERMISSION_NFT_NAME ?? "PinataFS Access";
  const symbol = params?.symbol ?? process.env.PERMISSION_NFT_SYMBOL ?? "PFSA";

  return deployPermissionNft({
    account: clients.account,
    artifactPath: params?.artifactPath,
    name,
    publicClient: clients.publicClient,
    symbol,
    walletClient: clients.walletClient
  });
}

export async function deployStackFromEnv(params?: {
  filesystemArtifactPath?: string;
  permissionNftArtifactPath?: string;
  permissionNftName?: string;
  permissionNftSymbol?: string;
}): Promise<DeployStackResult> {
  const clients = createNodeClientsFromEnv();

  const permissionNftName =
    params?.permissionNftName ?? process.env.PERMISSION_NFT_NAME ?? "PinataFS Access";
  const permissionNftSymbol =
    params?.permissionNftSymbol ?? process.env.PERMISSION_NFT_SYMBOL ?? "PFSA";

  const permissionNft = await deployPermissionNft({
    account: clients.account,
    artifactPath: params?.permissionNftArtifactPath,
    name: permissionNftName,
    publicClient: clients.publicClient,
    symbol: permissionNftSymbol,
    walletClient: clients.walletClient
  });

  const filesystem = await deployFilesystem({
    account: clients.account,
    artifactPath: params?.filesystemArtifactPath,
    publicClient: clients.publicClient,
    walletClient: clients.walletClient
  });

  return {
    filesystem,
    permissionNft
  };
}

// Backward-compatible aliases kept for existing integrations.
export type DeployPinataFSParams = DeployFilesystemParams;
export type DeployPinataFSResult = DeployContractResult;
export const deployPinataFS = deployFilesystem;

export async function deployPinataFSFromEnv(params?: {
  artifactPath?: string;
  name?: string;
  symbol?: string;
}): Promise<DeployContractResult> {
  return deployFilesystemFromEnv({ artifactPath: params?.artifactPath });
}

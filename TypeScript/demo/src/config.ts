import { defineChain, http, type Address } from "viem";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

const rpcUrl = import.meta.env.VITE_RPC_URL ?? "https://sepolia.base.org";
const chainId = Number(import.meta.env.VITE_CHAIN_ID ?? "84532");
const resolvedChainId = Number.isFinite(chainId) ? chainId : 84532;
const chainName = import.meta.env.VITE_CHAIN_NAME ?? "Base Sepolia";
const chainCurrencySymbol = import.meta.env.VITE_CHAIN_CURRENCY_SYMBOL ?? "ETH";
const blockExplorerUrl = import.meta.env.VITE_BLOCK_EXPLORER_URL ?? "https://sepolia.basescan.org";

const defaultMulticall3ByChain: Record<number, { address: Address; blockCreated: number }> = {
  // Base mainnet
  8453: {
    address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    blockCreated: 5022
  },
  // Base Sepolia
  84532: {
    address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    blockCreated: 1059647
  }
};

const envMulticall3Address = import.meta.env.VITE_MULTICALL3_ADDRESS as Address | undefined;
const envMulticall3BlockCreatedRaw = import.meta.env.VITE_MULTICALL3_BLOCK_CREATED;
const envMulticall3BlockCreated = Number(envMulticall3BlockCreatedRaw);

const multicall3Config = envMulticall3Address
  ? {
      address: envMulticall3Address,
      ...(Number.isFinite(envMulticall3BlockCreated)
        ? { blockCreated: envMulticall3BlockCreated }
        : {})
    }
  : defaultMulticall3ByChain[resolvedChainId];

export const appChain = defineChain({
  id: resolvedChainId,
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
  },
  blockExplorers: {
    default: {
      name: "Explorer",
      url: blockExplorerUrl
    }
  },
  ...(multicall3Config
    ? {
        contracts: {
          multicall3: multicall3Config
        }
      }
    : {})
});

export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors: [injected()],
  transports: {
    [appChain.id]: http(rpcUrl)
  }
});

export const defaultFilesystemAddress =
  (import.meta.env.VITE_FILESYSTEM_ADDRESS as Address | undefined) ?? "";

export const defaultPermissionNftAddress =
  (import.meta.env.VITE_PERMISSION_NFT_ADDRESS as Address | undefined) ?? "";

export const pinataJwt = import.meta.env.VITE_PINATA_JWT ?? "";
export const pinataGateway = import.meta.env.VITE_PINATA_GATEWAY ?? "";

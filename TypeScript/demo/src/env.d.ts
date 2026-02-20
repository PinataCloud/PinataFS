/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_CHAIN_NAME?: string;
  readonly VITE_CHAIN_CURRENCY_SYMBOL?: string;
  readonly VITE_BLOCK_EXPLORER_URL?: string;
  readonly VITE_MULTICALL3_ADDRESS?: `0x${string}`;
  readonly VITE_MULTICALL3_BLOCK_CREATED?: string;
  readonly VITE_FILESYSTEM_ADDRESS?: `0x${string}`;
  readonly VITE_PERMISSION_NFT_ADDRESS?: `0x${string}`;
  readonly VITE_PINATA_JWT?: string;
  readonly VITE_PINATA_GATEWAY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

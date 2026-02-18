import { useEffect, useMemo, useState } from "react";
import { PinataSDK } from "pinata";
import {
  buildIpfsGatewayUrl,
  fileExists,
  getTokenPrefixes,
  isTokenWriteRevoked,
  isValidFilePath,
  mintPermissionNft,
  parsePrefixes,
  permissionNftAbi,
  readFile,
  replaceTokenPrefixes,
  validateFilePath,
  writeFile
} from "@pinatafs/sdk";
import { getAddress, isAddress, type Address } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWalletClient
} from "wagmi";

import {
  appChain,
  defaultFilesystemAddress,
  defaultPermissionNftAddress,
  pinataGateway,
  pinataJwt
} from "./config";

function normalizeAddress(value: string): Address | null {
  if (!isAddress(value)) return null;
  return getAddress(value);
}

function getValidationMessage(value: string, validator: (value: string) => void): string {
  try {
    validator(value);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid value.";
  }
}

function isUnsignedInteger(value: string): boolean {
  return /^\d+$/.test(value);
}

interface DemoTokenEntry {
  tokenId: bigint;
  owner: Address;
}

export default function App() {
  const [readPath, setReadPath] = useState("/agent1/files/manifest.json");
  const [readCid, setReadCid] = useState("");
  const [readError, setReadError] = useState("");

  const [writePath, setWritePath] = useState("/agent1/files/manifest.json");
  const [writeCid, setWriteCid] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [writeNftContractInput, setWriteNftContractInput] = useState("");
  const [writeTokenId, setWriteTokenId] = useState("");
  const [writeStatus, setWriteStatus] = useState("");

  const [demoTokens, setDemoTokens] = useState<DemoTokenEntry[]>([]);
  const [demoTokenStatus, setDemoTokenStatus] = useState("");
  const [demoTokenError, setDemoTokenError] = useState("");

  const [selectedTokenPrefixes, setSelectedTokenPrefixes] = useState<string[]>([]);
  const [selectedTokenWriteRevoked, setSelectedTokenWriteRevoked] = useState<boolean | null>(null);
  const [selectedTokenPermissionStatus, setSelectedTokenPermissionStatus] = useState("");
  const [selectedTokenPermissionError, setSelectedTokenPermissionError] = useState("");

  const [mintTo, setMintTo] = useState("");
  const [mintTransferable, setMintTransferable] = useState(false);
  const [mintStatus, setMintStatus] = useState("");

  const [permissionTokenId, setPermissionTokenId] = useState("");
  const [useDemoPermissionNftForUpsert, setUseDemoPermissionNftForUpsert] = useState(true);
  const [permissionNftContractInput, setPermissionNftContractInput] = useState("");
  const [permissionPrefixesInput, setPermissionPrefixesInput] = useState("");
  const [permissionLoadedPrefixes, setPermissionLoadedPrefixes] = useState<string[]>([]);
  const [permissionLoadStatus, setPermissionLoadStatus] = useState("");
  const [permissionLoadError, setPermissionLoadError] = useState("");
  const [permissionStatus, setPermissionStatus] = useState("");

  const filesystemAddress = useMemo(() => normalizeAddress(defaultFilesystemAddress), []);
  const permissionNftAddress = useMemo(() => normalizeAddress(defaultPermissionNftAddress), []);
  const writeNftContract = useMemo(
    () => normalizeAddress(writeNftContractInput),
    [writeNftContractInput]
  );
  const permissionNftContractForUpsert = useMemo(() => {
    if (useDemoPermissionNftForUpsert) return permissionNftAddress;
    return normalizeAddress(permissionNftContractInput);
  }, [useDemoPermissionNftForUpsert, permissionNftAddress, permissionNftContractInput]);

  const readPathError = useMemo(
    () =>
      readPath.trim() ? getValidationMessage(readPath, validateFilePath) : "File path is required.",
    [readPath]
  );

  const writePathError = useMemo(
    () =>
      writePath.trim()
        ? getValidationMessage(writePath, validateFilePath)
        : "File path is required.",
    [writePath]
  );

  const writeNftContractError = useMemo(() => {
    const value = writeNftContractInput.trim();
    if (!value) return "";
    return writeNftContract ? "" : "NFT contract must be a valid address.";
  }, [writeNftContractInput, writeNftContract]);

  const writeTokenIdError = useMemo(() => {
    const value = writeTokenId.trim();
    if (!value) return "";
    return isUnsignedInteger(value) ? "" : "Write token id must be an unsigned integer.";
  }, [writeTokenId]);

  const writeTokenIdValue = useMemo(() => {
    const value = writeTokenId.trim();
    if (!value || !isUnsignedInteger(value)) return null;
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }, [writeTokenId]);

  const writeTokenReady = writeNftContract !== null && writeTokenIdValue !== null;

  const permissionTokenIdError = useMemo(() => {
    const value = permissionTokenId.trim();
    if (!value) return "";
    return isUnsignedInteger(value) ? "" : "Token id must be an unsigned integer.";
  }, [permissionTokenId]);

  const permissionTokenIdValue = useMemo(() => {
    const value = permissionTokenId.trim();
    if (!value || !isUnsignedInteger(value)) return null;
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }, [permissionTokenId]);
  const permissionPrefixesValidation = useMemo(() => {
    try {
      if (!permissionPrefixesInput.trim()) {
        return { prefixes: [] as string[], error: "" };
      }
      const prefixes = parsePrefixes(permissionPrefixesInput);
      return { prefixes, error: "" };
    } catch (error) {
      return {
        prefixes: [] as string[],
        error: error instanceof Error ? error.message : "Invalid prefix list."
      };
    }
  }, [permissionPrefixesInput]);
  const permissionNftContractForUpsertError = useMemo(() => {
    if (useDemoPermissionNftForUpsert) {
      return permissionNftAddress ? "" : "Set a valid VITE_PERMISSION_NFT_ADDRESS in your frontend env.";
    }

    const value = permissionNftContractInput.trim();
    if (!value) return "Provide an NFT contract address for this prefix update.";
    return permissionNftContractForUpsert ? "" : "NFT contract must be a valid address.";
  }, [
    useDemoPermissionNftForUpsert,
    permissionNftAddress,
    permissionNftContractInput,
    permissionNftContractForUpsert
  ]);

  const gatewayLink = useMemo(() => {
    if (!readCid || !pinataGateway) return "";
    try {
      return buildIpfsGatewayUrl(pinataGateway, readCid);
    } catch {
      return "";
    }
  }, [readCid]);

  const pinata = useMemo(() => {
    if (!pinataJwt || !pinataGateway) return null;

    return new PinataSDK({
      pinataJwt,
      pinataGateway
    });
  }, []);

  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, error: connectError, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const wrongChain = isConnected && chainId !== appChain.id;
  const readPathValid = isValidFilePath(readPath);
  const writePathValid = isValidFilePath(writePath);

  useEffect(() => {
    setSelectedTokenPermissionError("");
    setSelectedTokenPermissionStatus("");
    setSelectedTokenPrefixes([]);
    setSelectedTokenWriteRevoked(null);

    const client = publicClient;
    const fsAddress = filesystemAddress;
    const nftAddress = writeNftContract;
    const tokenId = writeTokenIdValue;

    if (!client || !fsAddress || !writeTokenReady || !nftAddress || tokenId === null) {
      return;
    }

    const checkedClient = client as Parameters<typeof getTokenPrefixes>[0]["publicClient"];
    const checkedFilesystemAddress = fsAddress as Address;
    const checkedNftAddress = nftAddress as Address;
    const checkedTokenId = tokenId as bigint;

    let cancelled = false;

    async function loadPermissions() {
      try {
        setSelectedTokenPermissionStatus("Checking filesystem permissions for selected NFT...");

        const [prefixes, writeRevoked] = await Promise.all([
          getTokenPrefixes({
            filesystemAddress: checkedFilesystemAddress,
            publicClient: checkedClient,
            nftContract: checkedNftAddress,
            tokenId: checkedTokenId
          }),
          isTokenWriteRevoked({
            filesystemAddress: checkedFilesystemAddress,
            publicClient: checkedClient,
            nftContract: checkedNftAddress,
            tokenId: checkedTokenId
          })
        ]);

        if (cancelled) return;

        setSelectedTokenPrefixes(prefixes);
        setSelectedTokenWriteRevoked(writeRevoked);
        setSelectedTokenPermissionStatus(
          prefixes.length > 0 ? "Filesystem permissions loaded." : "No filesystem prefixes found for this NFT."
        );
      } catch (error) {
        if (cancelled) return;
        setSelectedTokenPermissionError(
          error instanceof Error ? error.message : "Failed to load filesystem permissions for selected NFT."
        );
      }
    }

    void loadPermissions();

    return () => {
      cancelled = true;
    };
  }, [publicClient, filesystemAddress, writeTokenReady, writeNftContract, writeTokenIdValue]);

  useEffect(() => {
    setPermissionLoadError("");
    setPermissionLoadStatus("");

    const client = publicClient;
    const fsAddress = filesystemAddress;
    const nftAddress = permissionNftContractForUpsert;
    const tokenId = permissionTokenIdValue;

    if (!client || !fsAddress || !nftAddress || tokenId === null) {
      setPermissionLoadedPrefixes([]);
      setPermissionPrefixesInput("");
      return;
    }

    const checkedClient = client as Parameters<typeof getTokenPrefixes>[0]["publicClient"];
    const checkedFilesystemAddress = fsAddress as Address;
    const checkedNftAddress = nftAddress as Address;
    const checkedTokenId = tokenId as bigint;

    let cancelled = false;

    async function loadCurrentPermissionPrefixes() {
      try {
        setPermissionLoadStatus("Loading current prefixes for selected NFT...");

        const prefixes = await getTokenPrefixes({
          filesystemAddress: checkedFilesystemAddress,
          publicClient: checkedClient,
          nftContract: checkedNftAddress,
          tokenId: checkedTokenId
        });

        if (cancelled) return;

        setPermissionLoadedPrefixes(prefixes);
        setPermissionPrefixesInput(prefixes.join("\n"));
        setPermissionLoadStatus(
          prefixes.length > 0
            ? `Loaded ${prefixes.length} current prefix${prefixes.length === 1 ? "" : "es"} into editor.`
            : "No current prefixes found for this NFT. Add prefixes below to grant access."
        );
      } catch (error) {
        if (cancelled) return;
        setPermissionLoadedPrefixes([]);
        setPermissionPrefixesInput("");
        setPermissionLoadError(
          error instanceof Error ? error.message : "Failed to load current prefixes for selected NFT."
        );
      }
    }

    void loadCurrentPermissionPrefixes();

    return () => {
      cancelled = true;
    };
  }, [publicClient, filesystemAddress, permissionNftContractForUpsert, permissionTokenIdValue]);

  async function handleReadFile() {
    setReadError("");

    if (readPathError) {
      setReadError(readPathError);
      return;
    }

    if (!publicClient) {
      setReadError("Public client is not ready.");
      return;
    }

    if (!filesystemAddress) {
      setReadError("Set a valid VITE_FILESYSTEM_ADDRESS in your frontend env.");
      return;
    }

    try {
      const exists = await fileExists({
        filesystemAddress,
        publicClient,
        path: readPath
      });

      if (!exists) {
        setReadCid("");
        setReadError("No file is currently stored at this path.");
        return;
      }

      const cid = await readFile({
        filesystemAddress,
        publicClient,
        path: readPath
      });

      setReadCid(cid);
    } catch (error) {
      setReadCid("");
      setReadError(error instanceof Error ? error.message : "Failed to read file");
    }
  }

  async function handleLoadDemoContractTokens() {
    setDemoTokenError("");
    setDemoTokenStatus("");

    if (!publicClient) {
      setDemoTokenError("Public client is not ready.");
      return;
    }

    if (!permissionNftAddress) {
      setDemoTokenError("Set a valid VITE_PERMISSION_NFT_ADDRESS in your frontend env.");
      return;
    }

    try {
      setDemoTokenStatus("Scanning first 10 token ids on demo ERC-721 contract...");

      const checks = await Promise.all(
        Array.from({ length: 10 }, (_, index) => BigInt(index + 1)).map(async (tokenId) => {
          try {
            const owner = await publicClient.readContract({
              address: permissionNftAddress,
              abi: permissionNftAbi,
              functionName: "ownerOf",
              args: [tokenId]
            });

            return {
              tokenId,
              owner: getAddress(owner as Address)
            } as DemoTokenEntry;
          } catch {
            return null;
          }
        })
      );

      const tokens = checks.filter((value): value is DemoTokenEntry => value !== null);
      setDemoTokens(tokens);

      if (tokens.length === 0) {
        setDemoTokenStatus("No minted tokens found in ids 1-10.");
      } else {
        setDemoTokenStatus(`Found ${tokens.length} token${tokens.length === 1 ? "" : "s"} in ids 1-10.`);
      }
    } catch (error) {
      setDemoTokens([]);
      setDemoTokenError(error instanceof Error ? error.message : "Failed to load demo contract NFTs.");
    }
  }

  async function handleUploadToPinata() {
    setWriteStatus("");

    if (!pinata) {
      setWriteStatus("Pinata env vars are missing. Set VITE_PINATA_JWT and VITE_PINATA_GATEWAY.");
      return;
    }

    if (!selectedFile) {
      setWriteStatus("Select a file first.");
      return;
    }

    try {
      setWriteStatus("Uploading to IPFS...");

      let result: any;

      if ((pinata as any).upload?.public?.file) {
        result = await (pinata as any).upload.public.file(selectedFile);
      } else if ((pinata as any).upload?.file) {
        result = await (pinata as any).upload.file(selectedFile);
      } else {
        throw new Error("Unsupported Pinata SDK upload method shape.");
      }

      const cid = result?.cid ?? result?.IpfsHash;

      if (!cid || typeof cid !== "string") {
        throw new Error("Pinata upload response did not include a CID.");
      }

      setWriteCid(cid);
      setWriteStatus("Upload complete. CID field pre-filled.");
    } catch (error) {
      setWriteStatus(error instanceof Error ? error.message : "Failed to upload file");
    }
  }

  async function handleWriteFile() {
    setWriteStatus("");

    if (writePathError) {
      setWriteStatus(writePathError);
      return;
    }

    if (!publicClient || !walletClient) {
      setWriteStatus("Connect a wallet before writing.");
      return;
    }

    if (!address) {
      setWriteStatus("Wallet address not available.");
      return;
    }

    if (!filesystemAddress) {
      setWriteStatus("Set a valid VITE_FILESYSTEM_ADDRESS in your frontend env.");
      return;
    }

    if (!writeTokenReady || !writeNftContract || !writeTokenIdValue) {
      setWriteStatus("Please provide NFT to write with.");
      return;
    }

    const cidToWrite = writeCid.trim();
    if (!cidToWrite) {
      setWriteStatus("Provide a CID or upload a file to Pinata first.");
      return;
    }

    try {
      setWriteStatus("Submitting write transaction...");
      const hash = await writeFile({
        filesystemAddress,
        publicClient,
        walletClient,
        account: address,
        nftContract: writeNftContract,
        tokenId: writeTokenIdValue,
        path: writePath,
        cid: cidToWrite
      });

      setWriteStatus(`Write submitted with token ${writeTokenIdValue.toString()}: ${hash}`);
    } catch (error) {
      setWriteStatus(error instanceof Error ? error.message : "Failed to write file");
    }
  }

  async function handleMintPermissions() {
    setMintStatus("");

    if (!publicClient || !walletClient) {
      setMintStatus("Connect an admin wallet first.");
      return;
    }

    if (!address) {
      setMintStatus("Wallet address not available.");
      return;
    }

    if (!permissionNftAddress) {
      setMintStatus("Set a valid VITE_PERMISSION_NFT_ADDRESS in your frontend env.");
      return;
    }

    const recipient = normalizeAddress(mintTo);
    if (!recipient) {
      setMintStatus("Enter a valid recipient address.");
      return;
    }

    try {
      setMintStatus("Submitting permission NFT mint transaction...");

      const hash = await mintPermissionNft({
        permissionNftAddress,
        publicClient,
        walletClient,
        account: address,
        to: recipient,
        transferable: mintTransferable
      });

      setMintStatus(`Mint submitted: ${hash}`);
    } catch (error) {
      setMintStatus(error instanceof Error ? error.message : "Failed to mint permissions");
    }
  }

  async function handleUpsertPermission() {
    setPermissionStatus("");

    if (!publicClient || !walletClient) {
      setPermissionStatus("Connect an admin wallet first.");
      return;
    }

    if (!address) {
      setPermissionStatus("Wallet address not available.");
      return;
    }

    if (!filesystemAddress) {
      setPermissionStatus("Set a valid VITE_FILESYSTEM_ADDRESS in your frontend env.");
      return;
    }

    if (!permissionNftContractForUpsert) {
      setPermissionStatus(permissionNftContractForUpsertError || "Provide a valid NFT contract address.");
      return;
    }

    if (!permissionTokenId.trim()) {
      setPermissionStatus("Provide a token id.");
      return;
    }

    if (permissionTokenIdError) {
      setPermissionStatus(permissionTokenIdError);
      return;
    }

    if (permissionTokenIdValue === null) {
      setPermissionStatus("Provide a valid token id.");
      return;
    }

    if (permissionNftContractForUpsertError) {
      setPermissionStatus(permissionNftContractForUpsertError);
      return;
    }

    if (permissionPrefixesValidation.error) {
      setPermissionStatus(permissionPrefixesValidation.error);
      return;
    }

    try {
      setPermissionStatus("Loading latest on-chain prefixes...");

      const latestOnChainPrefixes = await getTokenPrefixes({
        filesystemAddress,
        publicClient,
        nftContract: permissionNftContractForUpsert,
        tokenId: permissionTokenIdValue
      });

      const desiredPrefixes: string[] = [];
      const seenDesired = new Set<string>();
      for (const prefix of permissionPrefixesValidation.prefixes) {
        if (seenDesired.has(prefix)) continue;
        seenDesired.add(prefix);
        desiredPrefixes.push(prefix);
      }

      const currentSet = new Set(latestOnChainPrefixes);
      const desiredSet = new Set(desiredPrefixes);
      const hasMissing = desiredPrefixes.some((prefix) => !currentSet.has(prefix));
      const hasExtra = latestOnChainPrefixes.some((prefix) => !desiredSet.has(prefix));

      if (!hasMissing && !hasExtra) {
        setPermissionLoadedPrefixes(latestOnChainPrefixes);
        setPermissionStatus("No prefix changes to submit. Editor already matches on-chain state.");
        return;
      }

      setPermissionStatus("Submitting prefix replacement transaction...");
      const hash = await replaceTokenPrefixes({
        filesystemAddress,
        publicClient,
        walletClient,
        account: address,
        nftContract: permissionNftContractForUpsert,
        tokenId: permissionTokenIdValue,
        prefixes: desiredPrefixes
      });

      setPermissionLoadedPrefixes(desiredPrefixes);
      setPermissionPrefixesInput(desiredPrefixes.join("\n"));
      setPermissionStatus(`Submitted prefix replacement transaction: ${hash}`);
    } catch (error) {
      setPermissionStatus(error instanceof Error ? error.message : "Failed to update prefix permission");
    }
  }

  return (
    <main className="app-shell">
      <h1>PinataFS Demo</h1>
      <p className="warning-text">
        Demo-only setup: Pinata credentials are loaded from frontend env vars and are exposed to
        clients. Do not use this approach in production.
      </p>

      <section className="panel">
        <h2>Wallet</h2>
        <div className="row">
          {!isConnected ? (
            connectors.map((connector) => (
              <button
                key={connector.id}
                type="button"
                onClick={() => connect({ connector })}
                disabled={isConnecting}
              >
                Connect {connector.name}
              </button>
            ))
          ) : (
            <>
              <span>Connected: {address}</span>
              <button type="button" onClick={() => disconnect()}>
                Disconnect
              </button>
            </>
          )}
        </div>

        {connectError ? <p className="error-text">{connectError.message}</p> : null}

        <div className="row">
          <span>
            Configured chain: {appChain.name} (id: {appChain.id})
          </span>
          <span>Wallet chain: {chainId ?? "not connected"}</span>
          {wrongChain && switchChain ? (
            <button type="button" onClick={() => switchChain({ chainId: appChain.id })}>
              Switch to {appChain.name}
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2>Contract Targets</h2>
        <p>
          Filesystem address (<code>VITE_FILESYSTEM_ADDRESS</code>):{" "}
          <code>{defaultFilesystemAddress || "(not set)"}</code>
        </p>
        {!filesystemAddress ? (
          <p className="error-text">Set a valid `VITE_FILESYSTEM_ADDRESS` in `.env`.</p>
        ) : null}
        <p>
          Permission NFT address (<code>VITE_PERMISSION_NFT_ADDRESS</code>):{" "}
          <code>{defaultPermissionNftAddress || "(not set)"}</code>
        </p>
        {!permissionNftAddress ? (
          <p className="error-text">Set a valid `VITE_PERMISSION_NFT_ADDRESS` in `.env`.</p>
        ) : null}
      </section>

      <section className="panel rules-panel">
        <h2>Path Rules</h2>
        <ul className="rules-list">
          <li>
            Path must start with <code>/</code> and cannot end with <code>/</code>.
          </li>
          <li>
            Duplicate slashes like <code>//</code> are not allowed.
          </li>
          <li>
            Allowed segment characters: <code>A-Z</code>, <code>a-z</code>, <code>0-9</code>,
            <code>-</code>, <code>_</code>.
          </li>
          <li>
            <code>.</code> is only allowed in the final file segment (max one dot). Prefixes cannot
            contain dots.
          </li>
          <li>
            Valid examples: <code>/agent3/shared-files</code>,{" "}
            <code>/agent3/shared-files/sub_dir/manifest_v1.json</code>.
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>Read File</h2>
        <label>
          File path
          <input
            value={readPath}
            onChange={(event) => setReadPath(event.target.value)}
            spellCheck={false}
          />
        </label>
        {readPathError ? <p className="error-text">{readPathError}</p> : null}
        <button type="button" onClick={handleReadFile} disabled={!readPathValid || !filesystemAddress}>
          Read CID
        </button>

        {readError ? <p className="error-text">{readError}</p> : null}

        {readCid ? (
          <div className="result-block">
            <p>CID: {readCid}</p>
            {gatewayLink ? (
              <a href={gatewayLink} target="_blank" rel="noreferrer">
                Open via gateway
              </a>
            ) : (
              <p className="error-text">
                Set VITE_PINATA_GATEWAY to generate an external gateway link.
              </p>
            )}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>Demo ERC721 Contract NFTs</h2>
        <p className="helper-text">
          For workshop convenience, this scans token ids 1-10 on the configured demo ERC721 contract
          and shows any minted tokens.
        </p>
        <button
          type="button"
          onClick={handleLoadDemoContractTokens}
          disabled={!publicClient || !permissionNftAddress}
        >
          Load Demo ERC721 Contract NFTs
        </button>
        {demoTokenError ? <p className="error-text">{demoTokenError}</p> : null}
        {demoTokenStatus ? <p className="status-text">{demoTokenStatus}</p> : null}

        {demoTokens.length > 0 ? (
          <div className="token-grid">
            {demoTokens.map((token) => (
              <article key={`demo-token-${token.tokenId.toString()}`} className="token-card">
                <h3>Token #{token.tokenId.toString()}</h3>
                <p>
                  Contract: <code>{permissionNftAddress}</code>
                </p>
                <p>
                  Owner: <code>{token.owner}</code>
                </p>
                <button
                  type="button"
                  className="token-select-button"
                  onClick={() => {
                    if (!permissionNftAddress) return;
                    setWriteNftContractInput(permissionNftAddress);
                    setWriteTokenId(token.tokenId.toString());
                  }}
                >
                  Use This NFT for Write
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>Token to Use for Write</h2>
        <label>
          NFT contract address
          <input
            value={writeNftContractInput}
            onChange={(event) => setWriteNftContractInput(event.target.value)}
            placeholder="0x..."
          />
        </label>
        {writeNftContractError ? <p className="error-text">{writeNftContractError}</p> : null}

        <label>
          Token ID
          <input
            value={writeTokenId}
            onChange={(event) => setWriteTokenId(event.target.value)}
            placeholder="1"
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </label>
        {writeTokenIdError ? <p className="error-text">{writeTokenIdError}</p> : null}

        {!writeTokenReady ? (
          <p className="helper-text">
            Provide both NFT contract address and token ID to check filesystem permissions for this
            token.
          </p>
        ) : null}

        {selectedTokenPermissionError ? <p className="error-text">{selectedTokenPermissionError}</p> : null}
        {selectedTokenPermissionStatus ? <p className="status-text">{selectedTokenPermissionStatus}</p> : null}

        {writeTokenReady ? (
          <>
            {selectedTokenWriteRevoked !== null ? (
              <p>
                Writes revoked for this token: <strong>{selectedTokenWriteRevoked ? "yes" : "no"}</strong>
              </p>
            ) : null}

            <p>Filesystem prefixes:</p>
            {selectedTokenPrefixes.length > 0 ? (
              <ul className="prefix-list">
                {selectedTokenPrefixes.map((prefix) => (
                  <li key={`selected-prefix-${prefix}`}>
                    <code>{prefix}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="error-text">No active filesystem prefixes found for this token.</p>
            )}
          </>
        ) : null}
      </section>

      <section className="panel">
        <h2>Write File</h2>
        <label>
          File path
          <input
            value={writePath}
            onChange={(event) => setWritePath(event.target.value)}
            spellCheck={false}
          />
        </label>
        {writePathError ? <p className="error-text">{writePathError}</p> : null}

        <label>
          File upload
          <input type="file" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
        </label>

        <button type="button" onClick={handleUploadToPinata}>
          Upload to IPFS (Pinata)
        </button>

        <label>
          CID to write
          <input
            value={writeCid}
            onChange={(event) => setWriteCid(event.target.value)}
            placeholder="bafy..."
            spellCheck={false}
          />
        </label>

        <button
          type="button"
          onClick={handleWriteFile}
          disabled={
            !writePathValid ||
            !filesystemAddress ||
            !writeTokenReady ||
            Boolean(writeTokenIdError) ||
            Boolean(writeNftContractError)
          }
        >
          Write CID to filesystem
        </button>

        {!writeTokenReady ? <p className="error-text">Please provide NFT to write with</p> : null}

        <p className="status-text">{writeStatus}</p>
      </section>

      <section className="panel">
        <h2>Admin: Mint Permission NFT</h2>
        <label>
          Recipient
          <input value={mintTo} onChange={(event) => setMintTo(event.target.value)} placeholder="0x..." />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={mintTransferable}
            onChange={(event) => setMintTransferable(event.target.checked)}
          />
          Transferable token
        </label>

        <button type="button" onClick={handleMintPermissions} disabled={!permissionNftAddress}>
          Mint permission NFT
        </button>

        <p className="status-text">{mintStatus}</p>
      </section>

      <section className="panel">
        <h2>Admin: Upsert Prefix Permission</h2>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={useDemoPermissionNftForUpsert}
            onChange={(event) => setUseDemoPermissionNftForUpsert(event.target.checked)}
          />
          Use demo NFT contract
        </label>

        {useDemoPermissionNftForUpsert ? (
          <p className="helper-text">
            Using demo NFT contract from env: <code>{defaultPermissionNftAddress || "(not set)"}</code>
          </p>
        ) : (
          <label>
            NFT contract address
            <input
              value={permissionNftContractInput}
              onChange={(event) => setPermissionNftContractInput(event.target.value)}
              placeholder="0x..."
              spellCheck={false}
            />
          </label>
        )}
        {permissionNftContractForUpsertError ? (
          <p className="error-text">{permissionNftContractForUpsertError}</p>
        ) : null}

        <label>
          Token id
          <input
            value={permissionTokenId}
            onChange={(event) => setPermissionTokenId(event.target.value)}
            placeholder="1"
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </label>
        {permissionTokenIdError ? <p className="error-text">{permissionTokenIdError}</p> : null}

        <label>
          Prefixes (newline or comma separated)
          <textarea
            value={permissionPrefixesInput}
            onChange={(event) => setPermissionPrefixesInput(event.target.value)}
            rows={6}
            spellCheck={false}
          />
        </label>
        <p className="helper-text">
          Current on-chain prefixes are automatically loaded into this editor when NFT contract +
          token id are set. Edit the list and submit to sync.
        </p>
        {permissionPrefixesValidation.error ? (
          <p className="error-text">{permissionPrefixesValidation.error}</p>
        ) : null}
        {permissionLoadError ? <p className="error-text">{permissionLoadError}</p> : null}
        {permissionLoadStatus ? <p className="status-text">{permissionLoadStatus}</p> : null}

        {permissionLoadedPrefixes.length > 0 ? (
          <>
            <p>Currently loaded prefixes:</p>
            <ul className="prefix-list">
              {permissionLoadedPrefixes.map((prefix) => (
                <li key={`loaded-prefix-${prefix}`}>
                  <code>{prefix}</code>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <button
          type="button"
          onClick={handleUpsertPermission}
          disabled={
            !filesystemAddress ||
            !permissionNftContractForUpsert ||
            !permissionTokenId.trim() ||
            Boolean(permissionTokenIdError) ||
            Boolean(permissionNftContractForUpsertError) ||
            Boolean(permissionPrefixesValidation.error)
          }
        >
          Sync prefix set
        </button>

        <p className="status-text">{permissionStatus}</p>
      </section>
    </main>
  );
}

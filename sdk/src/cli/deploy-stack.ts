import { deployStackFromEnv } from "../node.js";

const filesystemArtifactPath =
  process.env.FILESYSTEM_FOUNDRY_ARTIFACT_PATH ?? process.env.FOUNDRY_ARTIFACT_PATH;
const permissionNftArtifactPath = process.env.PERMISSION_NFT_FOUNDRY_ARTIFACT_PATH;

const permissionNftName = process.env.PERMISSION_NFT_NAME ?? "PinataFS Access";
const permissionNftSymbol = process.env.PERMISSION_NFT_SYMBOL ?? "PFSA";

async function main() {
  const result = await deployStackFromEnv({
    filesystemArtifactPath,
    permissionNftArtifactPath,
    permissionNftName,
    permissionNftSymbol
  });

  console.log("Stack deployment complete");
  console.log(`Permission NFT Address: ${result.permissionNft.address}`);
  console.log(`Permission NFT Tx Hash: ${result.permissionNft.hash}`);
  console.log(`Filesystem Address: ${result.filesystem.address}`);
  console.log(`Filesystem Tx Hash: ${result.filesystem.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

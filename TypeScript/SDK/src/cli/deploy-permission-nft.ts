import { deployPermissionNftFromEnv } from "../node.js";

const artifactPath = process.env.PERMISSION_NFT_FOUNDRY_ARTIFACT_PATH;
const name = process.env.PERMISSION_NFT_NAME ?? "PinataFS Access";
const symbol = process.env.PERMISSION_NFT_SYMBOL ?? "PFSA";

async function main() {
  const result = await deployPermissionNftFromEnv({
    artifactPath,
    name,
    symbol
  });

  console.log("Permission NFT deployment complete");
  console.log(`Address: ${result.address}`);
  console.log(`Tx Hash: ${result.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

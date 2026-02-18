import { deployFilesystemFromEnv } from "../node.js";

const artifactPath = process.env.FILESYSTEM_FOUNDRY_ARTIFACT_PATH ?? process.env.FOUNDRY_ARTIFACT_PATH;

async function main() {
  const result = await deployFilesystemFromEnv({
    artifactPath
  });

  console.log("Filesystem deployment complete");
  console.log(`Address: ${result.address}`);
  console.log(`Tx Hash: ${result.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

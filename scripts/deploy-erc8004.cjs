/**
 * Deploy ERC-8004 contracts (Identity + Reputation) to Monad Testnet.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-erc8004.cjs --network monadTestnet
 */
const hre = require("hardhat");

async function main() {
  console.log("=== Deploying ERC-8004 Contracts to Monad Testnet ===\n");

  // 1. Deploy IdentityRegistry
  console.log("1. Deploying IdentityRegistry (ERC-721 Agent Identity)...");
  const identity = await hre.viem.deployContract("IdentityRegistry");
  console.log(`   IdentityRegistry deployed: ${identity.address}\n`);

  // 2. Deploy ReputationRegistry with IdentityRegistry address
  console.log("2. Deploying ReputationRegistry (Feedback + Scoring)...");
  const reputation = await hre.viem.deployContract("ReputationRegistry", [
    identity.address,
  ]);
  console.log(`   ReputationRegistry deployed: ${reputation.address}\n`);

  // 3. Verify linkage
  const linkedRegistry = await reputation.read.getIdentityRegistry();
  console.log("3. Verification:");
  console.log(`   Reputation → Identity link: ${linkedRegistry}`);
  console.log(`   Match: ${linkedRegistry.toLowerCase() === identity.address.toLowerCase()}\n`);

  // 4. Print update instructions
  console.log("=== Deployment Complete ===\n");
  console.log("Update src/config.ts with these addresses:");
  console.log(`  erc8004IdentityAddress: "${identity.address}"`);
  console.log(`  erc8004ReputationAddress: "${reputation.address}"`);
  console.log("\nUpdate .env (optional override):");
  console.log(`  ERC8004_IDENTITY_ADDRESS=${identity.address}`);
  console.log(`  ERC8004_REPUTATION_ADDRESS=${reputation.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });

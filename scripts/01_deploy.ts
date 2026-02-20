// ============================================================================
//  01_deploy.ts — Deploy + fondatore entra nella DAO
// ============================================================================
//
//  ORDINE: TimelockController → GovernanceToken → MyGovernor → Treasury
//                                                              → StartupRegistry → MockStartup
//
//  Il fondatore chiama joinDAO() con ETH per ottenere i primi token,
//  poi delega a sé stesso per attivare il voting power.
//
//  ESECUZIONE: npx hardhat run scripts/01_deploy.ts --network localhost
// ============================================================================

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const [deployer] = await ethers.getSigners();
    const TIMELOCK_DELAY = 3600;
    const FOUNDER_DEPOSIT = "100"; // 100 ETH → 100.000 COMP

    console.log("══════════════════════════════════════════════════");
    console.log("  CompetenceDAO — Deploy completo");
    console.log("══════════════════════════════════════════════════");
    console.log(`  Deployer: ${deployer.address}\n`);

    // 1. TimelockController
    const Timelock = await ethers.getContractFactory("TimelockController");
    const timelock = await Timelock.deploy(TIMELOCK_DELAY, [], [], deployer.address);
    await timelock.waitForDeployment();
    console.log(`1️⃣  TimelockController: ${await timelock.getAddress()}`);

    // 2. GovernanceToken
    const Token = await ethers.getContractFactory("GovernanceToken");
    const token = await Token.deploy(await timelock.getAddress());
    await token.waitForDeployment();
    console.log(`2️⃣  GovernanceToken:    ${await token.getAddress()}`);

    // 2b. Fondatore entra con 100 ETH → 100.000 COMP
    await token.joinDAO({ value: ethers.parseEther(FOUNDER_DEPOSIT) });
    await token.delegate(deployer.address);
    console.log(`   🔑 Fondatore: ${FOUNDER_DEPOSIT} ETH → ${Number(FOUNDER_DEPOSIT) * 1000} COMP (delegato)`);

    // 3. MyGovernor
    const Governor = await ethers.getContractFactory("MyGovernor");
    const governor = await Governor.deploy(
        await token.getAddress(), await timelock.getAddress(), 1, 50, 0, 4, 20
    );
    await governor.waitForDeployment();
    console.log(`3️⃣  MyGovernor:         ${await governor.getAddress()}`);

    // 4. Treasury
    const Treasury = await ethers.getContractFactory("Treasury");
    const treasury = await Treasury.deploy(await timelock.getAddress());
    await treasury.waitForDeployment();
    console.log(`4️⃣  Treasury:           ${await treasury.getAddress()}`);

    // 5-6. StartupRegistry + MockStartup
    const Registry = await ethers.getContractFactory("StartupRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();
    const MS = await ethers.getContractFactory("MockStartup");
    const mockStartup = await MS.deploy();
    await mockStartup.waitForDeployment();
    console.log(`5️⃣  StartupRegistry:    ${await registry.getAddress()}`);
    console.log(`6️⃣  MockStartup:        ${await mockStartup.getAddress()}`);

    // Setup ruoli Timelock
    const governorAddr = await governor.getAddress();
    await timelock.grantRole(await timelock.PROPOSER_ROLE(), governorAddr);
    await timelock.grantRole(await timelock.EXECUTOR_ROLE(), ethers.ZeroAddress);
    await timelock.grantRole(await timelock.CANCELLER_ROLE(), governorAddr);
    await timelock.revokeRole(await timelock.DEFAULT_ADMIN_ROLE(), deployer.address);
    console.log(`\n🔐 Ruoli Timelock configurati`);

    // Salva indirizzi
    const addresses = {
        token: await token.getAddress(),
        timelock: await timelock.getAddress(),
        governor: governorAddr,
        treasury: await treasury.getAddress(),
        registry: await registry.getAddress(),
        mockStartup: await mockStartup.getAddress(),
        deployer: deployer.address,
    };
    fs.writeFileSync(path.join(__dirname, "..", "deployedAddresses.json"), JSON.stringify(addresses, null, 2));

    console.log("\n══════════════════════════════════════════════════");
    console.log("  ✅ Deploy completo! Prossimo: 02_joinMembers.ts");
    console.log("══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

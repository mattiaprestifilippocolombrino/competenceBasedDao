// ============================================================================
//  01_deploy.ts — Deploy di tutti i contratti + fondatore entra nella DAO
// ============================================================================
//
//  ORDINE DI DEPLOY:
//  ──────────────────
//  1. TimelockController — esegue le azioni approvate dalla governance
//  2. GovernanceToken   — token ERC20 con voting e membership (joinDAO)
//  3. MyGovernor        — contratto di governance (proposte, voti, quorum)
//  4. Treasury          — custodisce gli ETH della DAO
//  5. StartupRegistry   — registro delle startup (facoltativo)
//  6. MockStartup       — startup finta per i test di investimento
//
//  DOPO IL DEPLOY:
//  - Il fondatore (deployer) chiama joinDAO() con 100 ETH → 100.000 COMP
//  - Gli ETH del fondatore vanno nel Treasury automaticamente
//  - Il fondatore delega i voti a sé stesso per poter votare
//  - I ruoli del Timelock vengono configurati (solo il Governor può proporre)
//  - Gli indirizzi dei contratti vengono salvati in deployedAddresses.json
//
//  ESECUZIONE: npx hardhat run scripts/01_deploy.ts --network localhost
// ============================================================================

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    // Ottieni il primo account Hardhat (il deployer/fondatore)
    const [deployer] = await ethers.getSigners();

    // Parametri di configurazione
    const TIMELOCK_DELAY = 3600;       // 1 ora di attesa prima dell'esecuzione
    const FOUNDER_DEPOSIT = "100";     // 100 ETH → 100.000 COMP base

    console.log("══════════════════════════════════════════════════");
    console.log("  CompetenceDAO — Deploy completo");
    console.log("══════════════════════════════════════════════════");
    console.log(`  Deployer: ${deployer.address}\n`);

    // ── 1. TimelockController ──
    // Contratto che "ritarda" l'esecuzione delle proposte approvate.
    // Parametri: delay (1h), proposers (vuoto, aggiunti dopo), executors (vuoto),
    //            admin (deployer, poi revocato per decentralizzare)
    const Timelock = await ethers.getContractFactory("TimelockController");
    const timelock = await Timelock.deploy(TIMELOCK_DELAY, [], [], deployer.address);
    await timelock.waitForDeployment();
    console.log(`1️⃣  TimelockController: ${await timelock.getAddress()}`);

    // ── 2. GovernanceToken ──
    // Token ERC20 con ERC20Votes (checkpoint storici per il voting power).
    // Riceve l'indirizzo del Timelock perché solo il Timelock può fare upgrade.
    const Token = await ethers.getContractFactory("GovernanceToken");
    const token = await Token.deploy(await timelock.getAddress());
    await token.waitForDeployment();
    console.log(`2️⃣  GovernanceToken:    ${await token.getAddress()}`);

    // ── 3. MyGovernor ──
    // Contratto di governance che gestisce proposte e votazioni.
    // Parametri: token, timelock, votingDelay(1), votingPeriod(50),
    //            proposalThreshold(0), quorumPercent(20%), superQuorum(70%)
    const Governor = await ethers.getContractFactory("MyGovernor");
    const governor = await Governor.deploy(
        await token.getAddress(),       // Token per il voting power
        await timelock.getAddress(),    // Timelock per eseguire le proposte
        1,                              // votingDelay: 1 blocco prima di votare
        50,                             // votingPeriod: 50 blocchi per votare
        0,                              // proposalThreshold: 0 COMP per proporre
        20,                             // quorumPercent: 20% della supply
        70                              // superQuorum: 70% → approvazione immediata
    );
    await governor.waitForDeployment();
    console.log(`3️⃣  MyGovernor:         ${await governor.getAddress()}`);

    // ── 4. Treasury ──
    // Il "portafoglio" della DAO: riceve gli ETH e li investe in startup.
    // Solo il Timelock può chiamare invest() → serve approvazione governance.
    const Treasury = await ethers.getContractFactory("Treasury");
    const treasury = await Treasury.deploy(await timelock.getAddress());
    await treasury.waitForDeployment();
    console.log(`4️⃣  Treasury:           ${await treasury.getAddress()}`);

    // ── 4b. Collegamento Token → Treasury (one-shot) ──
    // Il GovernanceToken ha bisogno di sapere dove inviare gli ETH di joinDAO().
    // setTreasury() può essere chiamata UNA SOLA volta dal deployer.
    await token.setTreasury(await treasury.getAddress());
    console.log(`   🔗 Token → Treasury collegato`);

    // ── 4c. Il fondatore entra nella DAO ──
    // Chiama joinDAO() con 100 ETH → riceve 100.000 COMP (=100 × 1.000).
    // Gli ETH vengono trasferiti automaticamente al Treasury.
    // Poi delega i voti a sé stesso per attivare il voting power.
    await token.joinDAO({ value: ethers.parseEther(FOUNDER_DEPOSIT) });
    await token.delegate(deployer.address);
    console.log(`   🔑 Fondatore: ${FOUNDER_DEPOSIT} ETH → ${Number(FOUNDER_DEPOSIT) * 1000} COMP (delegato)`);

    // ── 5-6. Contratti accessori ──
    // StartupRegistry: registro on-chain delle startup (facoltativo, per demo)
    // MockStartup: contratto fittizio che riceve gli investimenti nei test
    const Registry = await ethers.getContractFactory("StartupRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();
    const MS = await ethers.getContractFactory("MockStartup");
    const mockStartup = await MS.deploy();
    await mockStartup.waitForDeployment();
    console.log(`5️⃣  StartupRegistry:    ${await registry.getAddress()}`);
    console.log(`6️⃣  MockStartup:        ${await mockStartup.getAddress()}`);

    // ── Configurazione ruoli del Timelock ──
    // PROPOSER_ROLE → solo il Governor può mettere in coda le proposte
    // EXECUTOR_ROLE → chiunque (address(0)) può eseguire dopo il delay
    // CANCELLER_ROLE → il Governor può cancellare proposte
    // Infine revochiamo l'admin al deployer → la DAO è completamente decentralizzata
    const governorAddr = await governor.getAddress();
    await timelock.grantRole(await timelock.PROPOSER_ROLE(), governorAddr);
    await timelock.grantRole(await timelock.EXECUTOR_ROLE(), ethers.ZeroAddress);
    await timelock.grantRole(await timelock.CANCELLER_ROLE(), governorAddr);
    await timelock.revokeRole(await timelock.DEFAULT_ADMIN_ROLE(), deployer.address);
    console.log(`\n🔐 Ruoli Timelock configurati`);

    // ── Salvataggio indirizzi ──
    // Tutti gli indirizzi dei contratti vengono salvati in un file JSON
    // così gli script successivi possono riconnettersi ai contratti deployati.
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

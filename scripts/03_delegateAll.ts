// ============================================================================
//  03_delegateAll.ts — Auto-delega di tutti i 15 membri
// ============================================================================

import { ethers } from "hardhat";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const signers = await ethers.getSigners();

    console.log("══════════════════════════════════════════════════");
    console.log("  CompetenceDAO — Auto-delega di tutti i membri");
    console.log("══════════════════════════════════════════════════\n");

    const addressesPath = path.join(__dirname, "..", "deployedAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    const token = await ethers.getContractAt("GovernanceToken", addresses.token);

    const labels = [
        "Professor 1 (Fondatore)", "Professor 2", "Professor 3", "Professor 4", "Professor 5",
        "PhD 1", "PhD 2", "PhD 3", "Master 1", "Master 2",
        "Bachelor 1", "Bachelor 2", "Bachelor 3", "Student 1", "Student 2",
    ];

    for (let i = 0; i < 15; i++) {
        const bal = await token.balanceOf(signers[i].address);
        if (bal === 0n) continue;
        await token.connect(signers[i]).delegate(signers[i].address);
        console.log(`   ✅ ${labels[i]}: ${ethers.formatUnits(bal, 18)} voti`);
    }

    await mine(1); // Consolida checkpoint
    console.log("\n══════════════════════════════════════════════════");
    console.log("  ✅ Tutti delegati! Prossimo: 04_upgradeCompetences.ts");
    console.log("══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

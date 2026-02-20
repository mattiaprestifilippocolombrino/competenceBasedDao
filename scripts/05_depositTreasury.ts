// ============================================================================
//  05_depositTreasury.ts — Donazioni al Treasury
// ============================================================================
//
//  I Professori donano di più (hanno più ETH rimasti), altri meno.
//
//  ESECUZIONE: npx hardhat run scripts/05_depositTreasury.ts --network localhost
// ============================================================================

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const signers = await ethers.getSigners();

    console.log("══════════════════════════════════════════════════");
    console.log("  CompetenceDAO — Donazioni al Treasury");
    console.log("══════════════════════════════════════════════════\n");

    const addressesPath = path.join(__dirname, "..", "deployedAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    const treasury = await ethers.getContractAt("Treasury", addresses.treasury);

    const deposits = [
        { signer: signers[0], eth: "50", label: "Professor 1" },
        { signer: signers[1], eth: "40", label: "Professor 2" },
        { signer: signers[2], eth: "45", label: "Professor 3" },
        { signer: signers[3], eth: "35", label: "Professor 4" },
        { signer: signers[4], eth: "30", label: "Professor 5" },
        { signer: signers[5], eth: "10", label: "PhD 1" },
        { signer: signers[6], eth: "8", label: "PhD 2" },
        { signer: signers[8], eth: "5", label: "Master 1" },
        { signer: signers[10], eth: "2", label: "Bachelor 1" },
    ];

    for (const d of deposits) {
        await treasury.connect(d.signer).deposit({ value: ethers.parseEther(d.eth) });
        console.log(`   💰 ${d.label}: ${d.eth} ETH`);
    }

    const balance = await treasury.getBalance();
    console.log(`\n   🏦 Saldo Treasury: ${ethers.formatEther(balance)} ETH`);
    console.log("\n══════════════════════════════════════════════════");
    console.log("  ✅ Donazioni completate! Prossimo: 06_createProposals.ts");
    console.log("══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

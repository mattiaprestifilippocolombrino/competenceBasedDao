// ============================================================================
//  08_executeProposals.ts — Esecuzione proposte approvate + riepilogo
// ============================================================================

import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import * as fs from "fs";
import * as path from "path";

const STATES: Record<number, string> = {
    0: "Pending", 1: "Active", 3: "Defeated", 4: "Succeeded", 5: "Queued", 7: "Executed",
};

async function main() {
    console.log("══════════════════════════════════════════════════");
    console.log("  CompetenceDAO — Esecuzione proposte");
    console.log("══════════════════════════════════════════════════\n");

    const addresses = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployedAddresses.json"), "utf8"));
    const governor = await ethers.getContractAt("MyGovernor", addresses.governor);
    const treasury = await ethers.getContractAt("Treasury", addresses.treasury);
    const mockStartup = await ethers.getContractAt("MockStartup", addresses.mockStartup);
    const pState = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "proposalState.json"), "utf8"));

    const balBefore = await treasury.getBalance();
    console.log(`🏦 Treasury PRIMA: ${ethers.formatEther(balBefore)} ETH\n`);

    console.log("⏳ Avanzamento delay Timelock (1 ora)...");
    await time.increase(3601);

    const LABELS = ["A", "B", "C", "D"];
    for (let i = 0; i < 2; i++) {
        const p = pState.proposals[i];
        if (Number(await governor.state(p.id)) !== 5) continue; // 5 = Queued
        const calldata = treasury.interface.encodeFunctionData("invest", [
            addresses.mockStartup, ethers.parseEther(p.amount),
        ]);
        await governor.execute([addresses.treasury], [0n], [calldata], ethers.id(p.desc));
        console.log(`   🚀 Proposta ${LABELS[i]} ESEGUITA — ${p.amount} ETH investiti`);
    }

    // ── Riepilogo ──
    console.log("\n══════════════════════════════════════════════════");
    console.log("  📋 RIEPILOGO FINALE");
    console.log("══════════════════════════════════════════════════\n");

    console.log("📊 Stato proposte:");
    for (let i = 0; i < 4; i++) {
        const s = Number(await governor.state(pState.proposals[i].id));
        const icon = s === 7 ? "✅" : "❌";
        console.log(`   ${icon} ${LABELS[i]} (${pState.proposals[i].amount} ETH): ${STATES[s]}`);
    }

    const balAfter = await treasury.getBalance();
    const startupBal = await mockStartup.getBalance();
    console.log(`\n💰 Bilanci:`);
    console.log(`   🏦 Treasury:    ${ethers.formatEther(balAfter)} ETH`);
    console.log(`   🏢 Startup:     ${ethers.formatEther(startupBal)} ETH`);
    console.log(`   📉 Investito:   ${ethers.formatEther(balBefore - balAfter)} ETH`);

    console.log("\n══════════════════════════════════════════════════");
    console.log("  ✅ Pipeline completata!");
    console.log("══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

// ============================================================================
//  07_voteOnProposals.ts — Voto + Queue delle proposte
// ============================================================================
//
//  Avanza votingDelay → vota → avanza votingPeriod → queue proposte vincenti
//
//  A — SUPERQUORUM: Prof 1 (500.000) vota FOR → >483.200 → Succeeded subito
//  B — ~57% WIN:    PhD1 + Master1 + Bachelor1 FOR; PhD3 + Master2 + Bachelors2,3 + Students AGAINST
//  C — QUORUM MA PERDE: PhD2 + Student1 FOR; Prof1 AGAINST
//  D — SOTTO QUORUM: Student1 + Student2 FOR soltanto (3.000 < 96.640)
//
//  ESECUZIONE: npx hardhat run scripts/07_voteOnProposals.ts --network localhost
// ============================================================================

import { ethers } from "hardhat";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import * as fs from "fs";
import * as path from "path";

const FOR = 1, AGAINST = 0;
const STATES: Record<number, string> = {
    0: "Pending", 1: "Active", 3: "Defeated", 4: "Succeeded", 5: "Queued", 7: "Executed",
};

async function main() {
    const signers = await ethers.getSigners();

    console.log("══════════════════════════════════════════════════");
    console.log("  CompetenceDAO — Votazione + Queue");
    console.log("══════════════════════════════════════════════════\n");

    const addresses = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployedAddresses.json"), "utf8"));
    const governor = await ethers.getContractAt("MyGovernor", addresses.governor);
    const treasury = await ethers.getContractAt("Treasury", addresses.treasury);
    const pState = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "proposalState.json"), "utf8"));
    const [pA, pB, pC, pD] = pState.proposals;

    console.log("⏳ Avanzamento votingDelay...");
    await mine(2);

    // ── A — SUPERQUORUM ──
    console.log("\n🅰️  PROPOSTA A — Superquorum:");
    await governor.connect(signers[0]).castVote(pA.id, FOR);
    console.log(`   ✅ Prof 1 vota FOR (500.000) → Stato: ${STATES[Number(await governor.state(pA.id))]}`);

    // ── B — ~57% WIN ──
    console.log("\n🅱️  PROPOSTA B — ~57% FOR:");
    // FOR: PhD1(120k) + Master1(45k) + Bachelor1(16k) = 181k
    await governor.connect(signers[5]).castVote(pB.id, FOR);
    await governor.connect(signers[8]).castVote(pB.id, FOR);
    await governor.connect(signers[10]).castVote(pB.id, FOR);
    // AGAINST: PhD3(80k) + Master2(30k) + Bachelor2(10k) + Bachelor3(12k) + Student1(2k) + Student2(1k) = 135k
    await governor.connect(signers[7]).castVote(pB.id, AGAINST);
    await governor.connect(signers[9]).castVote(pB.id, AGAINST);
    await governor.connect(signers[11]).castVote(pB.id, AGAINST);
    await governor.connect(signers[12]).castVote(pB.id, AGAINST);
    await governor.connect(signers[13]).castVote(pB.id, AGAINST);
    await governor.connect(signers[14]).castVote(pB.id, AGAINST);
    const [agB, fB] = await governor.proposalVotes(pB.id);
    console.log(`   FOR: ${ethers.formatUnits(fB, 18)} | AGAINST: ${ethers.formatUnits(agB, 18)} (${Number(fB * 100n / (fB + agB))}%)`);

    // ── C — QUORUM MA PERDE ──
    console.log("\n🅲  PROPOSTA C — Quorum raggiunto, ma perde:");
    // FOR: PhD2(100k) + Student1(2k) = 102k
    await governor.connect(signers[6]).castVote(pC.id, FOR);
    await governor.connect(signers[13]).castVote(pC.id, FOR);
    // AGAINST: Prof1(500k)
    await governor.connect(signers[0]).castVote(pC.id, AGAINST);
    const [agC, fC] = await governor.proposalVotes(pC.id);
    console.log(`   FOR: ${ethers.formatUnits(fC, 18)} | AGAINST: ${ethers.formatUnits(agC, 18)}`);

    // ── D — SOTTO QUORUM ──
    console.log("\n🅳  PROPOSTA D — Sotto quorum:");
    await governor.connect(signers[13]).castVote(pD.id, FOR);
    await governor.connect(signers[14]).castVote(pD.id, FOR);
    const [, fD] = await governor.proposalVotes(pD.id);
    console.log(`   FOR: ${ethers.formatUnits(fD, 18)} (sotto quorum di 96.640)`);

    // ── Avanziamo oltre il voting period ──
    console.log("\n⏳ Avanzamento voting period (50 blocchi)...");
    await mine(51);

    // ── Stato finale ──
    const LABELS = ["A", "B", "C", "D"];
    console.log("\n📊 Stato finale:");
    for (let i = 0; i < 4; i++) {
        const s = Number(await governor.state(pState.proposals[i].id));
        const icon = s === 4 ? "✅" : "❌";
        console.log(`   ${icon} Proposta ${LABELS[i]}: ${STATES[s]}`);
    }

    // ── Queue proposte vincenti (A e B) ──
    console.log("\n🔒 Queue delle proposte vincenti...");
    for (let i = 0; i < 2; i++) {
        const p = pState.proposals[i];
        if (Number(await governor.state(p.id)) !== 4) continue;
        const calldata = treasury.interface.encodeFunctionData("invest", [
            addresses.mockStartup, ethers.parseEther(p.amount),
        ]);
        await governor.queue([addresses.treasury], [0n], [calldata], ethers.id(p.desc));
        console.log(`   🔒 Proposta ${LABELS[i]} in coda`);
    }

    console.log("\n══════════════════════════════════════════════════");
    console.log("  ✅ Voto e queue completati! Prossimo: 08_executeProposals.ts");
    console.log("══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

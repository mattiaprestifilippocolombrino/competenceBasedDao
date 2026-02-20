// ============================================================================
//  07_voteOnProposals.ts — Votazione e Queue delle proposte
// ============================================================================
//
//  COSA FA QUESTO SCRIPT:
//  ──────────────────────
//  1. Avanza il votingDelay (1 blocco) per entrare nella fase di voto
//  2. I membri votano sulle 4 proposte create nello script 06
//  3. Avanza il votingPeriod (50 blocchi) per chiudere le votazioni
//  4. Mette in coda (queue) le proposte vincenti nel Timelock
//
//  SCENARIO DI VOTO:
//  ────────────────
//  A — SUPERQUORUM: Prof 1 (500.000) vota FOR → supera il 20% → Succeeded subito!
//  B — ~57% WIN:    PhD1 + Master1 + Bachelor1 votano FOR (181.000)
//                   PhD3 + Master2 + Bachelor2,3 + Students votano AGAINST (135.000)
//                   → 57% FOR → approvata alla fine del voting period
//  C — QUORUM MA PERDE: PhD2 + Student1 votano FOR (102.000)
//                        Prof1 vota AGAINST (500.000) → bocciata
//  D — SOTTO QUORUM: Solo Student1 + Student2 votano FOR (3.000)
//                     → non raggiunge il quorum di 96.640 → bocciata
//
//  VALORI DI VOTO: 0 = AGAINST (contrario), 1 = FOR (favorevole)
//
//  ESECUZIONE: npx hardhat run scripts/07_voteOnProposals.ts --network localhost
// ============================================================================

import { ethers } from "hardhat";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import * as fs from "fs";
import * as path from "path";

// Costanti per i voti (OpenZeppelin GovernorCountingSimple)
const FOR = 1, AGAINST = 0;

// Mappa degli stati delle proposte (enum ProposalState in Governor)
const STATES: Record<number, string> = {
    0: "Pending", 1: "Active", 3: "Defeated", 4: "Succeeded", 5: "Queued", 7: "Executed",
};

async function main() {
    const signers = await ethers.getSigners();

    console.log("══════════════════════════════════════════════════");
    console.log("  CompetenceDAO — Votazione + Queue");
    console.log("══════════════════════════════════════════════════\n");

    // Carica indirizzi contratti e stato delle proposte
    const addresses = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployedAddresses.json"), "utf8"));
    const governor = await ethers.getContractAt("MyGovernor", addresses.governor);
    const treasury = await ethers.getContractAt("Treasury", addresses.treasury);
    const pState = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "proposalState.json"), "utf8"));
    const [pA, pB, pC, pD] = pState.proposals;

    // Avanziamo il votingDelay (1 blocco + 1) per entrare nella fase Active
    console.log("⏳ Avanzamento votingDelay...");
    await mine(2);

    // ── PROPOSTA A — SUPERQUORUM (approvazione immediata) ──
    // Prof 1 ha 500.000 voti → supera il 20% della supply → Succeeded subito!
    console.log("\n🅰️  PROPOSTA A — Superquorum:");
    await governor.connect(signers[0]).castVote(pA.id, FOR);
    console.log(`   ✅ Prof 1 vota FOR (500.000) → Stato: ${STATES[Number(await governor.state(pA.id))]}`);

    // ── PROPOSTA B — Maggioranza semplice (~57% FOR) ──
    // FOR: PhD1 (120k) + Master1 (45k) + Bachelor1 (16k) = 181k
    // AGAINST: PhD3 (80k) + Master2 (30k) + Bachelor2 (10k) + Bachelor3 (12k) + Student1 (2k) + Student2 (1k) = 135k
    console.log("\n🅱️  PROPOSTA B — ~57% FOR:");
    await governor.connect(signers[5]).castVote(pB.id, FOR);     // PhD 1
    await governor.connect(signers[8]).castVote(pB.id, FOR);     // Master 1
    await governor.connect(signers[10]).castVote(pB.id, FOR);    // Bachelor 1
    await governor.connect(signers[7]).castVote(pB.id, AGAINST); // PhD 3
    await governor.connect(signers[9]).castVote(pB.id, AGAINST); // Master 2
    await governor.connect(signers[11]).castVote(pB.id, AGAINST);// Bachelor 2
    await governor.connect(signers[12]).castVote(pB.id, AGAINST);// Bachelor 3
    await governor.connect(signers[13]).castVote(pB.id, AGAINST);// Student 1
    await governor.connect(signers[14]).castVote(pB.id, AGAINST);// Student 2

    // proposalVotes() restituisce [againstVotes, forVotes, abstainVotes]
    const [agB, fB] = await governor.proposalVotes(pB.id);
    console.log(`   FOR: ${ethers.formatUnits(fB, 18)} | AGAINST: ${ethers.formatUnits(agB, 18)} (${Number(fB * 100n / (fB + agB))}%)`);

    // ── PROPOSTA C — Quorum raggiunto ma la maggioranza è contraria ──
    // FOR: PhD2 (100k) + Student1 (2k) = 102k → supera quorum (96.640)
    // AGAINST: Prof1 (500k) → maggioranza contraria → bocciata
    console.log("\n🅲  PROPOSTA C — Quorum raggiunto, ma perde:");
    await governor.connect(signers[6]).castVote(pC.id, FOR);     // PhD 2
    await governor.connect(signers[13]).castVote(pC.id, FOR);    // Student 1
    await governor.connect(signers[0]).castVote(pC.id, AGAINST); // Prof 1
    const [agC, fC] = await governor.proposalVotes(pC.id);
    console.log(`   FOR: ${ethers.formatUnits(fC, 18)} | AGAINST: ${ethers.formatUnits(agC, 18)}`);

    // ── PROPOSTA D — Sotto quorum (insufficiente partecipazione) ──
    // Solo Student1 (2k) + Student2 (1k) = 3k → molto sotto il quorum di 96.640
    console.log("\n🅳  PROPOSTA D — Sotto quorum:");
    await governor.connect(signers[13]).castVote(pD.id, FOR);    // Student 1
    await governor.connect(signers[14]).castVote(pD.id, FOR);    // Student 2
    const [, fD] = await governor.proposalVotes(pD.id);
    console.log(`   FOR: ${ethers.formatUnits(fD, 18)} (sotto quorum di 96.640)`);

    // ── Fine del voting period ──
    // Avanziamo di 51 blocchi per chiudere le votazioni.
    // Solo dopo la chiusura le proposte cambiano stato: Succeeded o Defeated.
    console.log("\n⏳ Avanzamento voting period (50 blocchi)...");
    await mine(51);

    // ── Stampa lo stato finale di ogni proposta ──
    const LABELS = ["A", "B", "C", "D"];
    console.log("\n📊 Stato finale:");
    for (let i = 0; i < 4; i++) {
        const s = Number(await governor.state(pState.proposals[i].id));
        const icon = s === 4 ? "✅" : "❌";
        console.log(`   ${icon} Proposta ${LABELS[i]}: ${STATES[s]}`);
    }

    // ── Queue delle proposte vincenti (A e B) ──
    // Solo le proposte con stato Succeeded (4) possono essere messe in coda.
    // Il queue() inserisce la proposta nel Timelock con il delay configurato (1 ora).
    console.log("\n🔒 Queue delle proposte vincenti...");
    for (let i = 0; i < 2; i++) {
        const p = pState.proposals[i];
        if (Number(await governor.state(p.id)) !== 4) continue; // Salta se non Succeeded

        // Ricostruiamo il calldata per la queue (deve essere identico alla proposta)
        const calldata = treasury.interface.encodeFunctionData("invest", [
            addresses.mockStartup, ethers.parseEther(p.amount),
        ]);
        // Il descHash (keccak256 della descrizione) identifica univocamente la proposta
        await governor.queue([addresses.treasury], [0n], [calldata], ethers.id(p.desc));
        console.log(`   🔒 Proposta ${LABELS[i]} in coda`);
    }

    console.log("\n══════════════════════════════════════════════════");
    console.log("  ✅ Voto e queue completati! Prossimo: 08_executeProposals.ts");
    console.log("══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

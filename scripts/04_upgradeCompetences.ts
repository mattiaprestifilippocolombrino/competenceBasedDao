// ============================================================================
//  04_upgradeCompetences.ts — Upgrade di competenza via governance (batch)
// ============================================================================
//
//  Crea UNA proposta batch che upgrada tutte i 13 membri non-student
//  in un'unica operazione. I 2 Student restano al grado base.
//
//  Il fondatore (100.000 COMP) + Prof 2 (80.000 COMP) votano FOR.
//  Insieme hanno 180.000 / 522.000 = 34.5% → superquorum (20%) raggiunto!
//
//  DOPO L'UPGRADE:
//  - Professors: base × 5     (Es: 100.000 × 5 = 500.000 COMP)
//  - PhDs:       base × 4
//  - Masters:    base × 3
//  - Bachelors:  base × 2
//  - Students:   nessun upgrade (restano base × 1)
//
//  ESECUZIONE: npx hardhat run scripts/04_upgradeCompetences.ts --network localhost
// ============================================================================

import { ethers } from "hardhat";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";
import * as fs from "fs";
import * as path from "path";

const GRADE_NAMES: Record<number, string> = {
    0: "Student", 1: "Bachelor", 2: "Master", 3: "PhD", 4: "Professor",
};

async function main() {
    const signers = await ethers.getSigners();

    console.log("══════════════════════════════════════════════════");
    console.log("  CompetenceDAO — Upgrade competenze (batch)");
    console.log("══════════════════════════════════════════════════\n");

    const addressesPath = path.join(__dirname, "..", "deployedAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    const token = await ethers.getContractAt("GovernanceToken", addresses.token);
    const governor = await ethers.getContractAt("MyGovernor", addresses.governor);

    const VOTING_DELAY = 1;
    const VOTING_PERIOD = 50;
    const TIMELOCK_DELAY = 3600;

    // ── Lista upgrade: tutti tranne Student 1 e Student 2 ──
    const upgrades = [
        { signer: signers[0], grade: 4, proof: "Professore Ordinario di AI, Politecnico di Milano" },
        { signer: signers[1], grade: 4, proof: "Professore Associato di Blockchain, UniMi" },
        { signer: signers[2], grade: 4, proof: "Professore Ordinario di Economia, Bocconi" },
        { signer: signers[3], grade: 4, proof: "Professore Associato di Ingegneria, PoliTo" },
        { signer: signers[4], grade: 4, proof: "Professore Ordinario di Matematica, SNS Pisa" },
        { signer: signers[5], grade: 3, proof: "PhD in Computer Science, ETH Zürich, 2023" },
        { signer: signers[6], grade: 3, proof: "PhD in Economics, LSE, 2024" },
        { signer: signers[7], grade: 3, proof: "PhD in Engineering, TU München, 2022" },
        { signer: signers[8], grade: 2, proof: "Laurea Magistrale in Data Science, PoliMi, 2024" },
        { signer: signers[9], grade: 2, proof: "Laurea Magistrale in Finance, Bocconi, 2023" },
        { signer: signers[10], grade: 1, proof: "Laurea Triennale in Informatica, UniMi, 2024" },
        { signer: signers[11], grade: 1, proof: "Laurea Triennale in Economia, UniPd, 2023" },
        { signer: signers[12], grade: 1, proof: "Laurea Triennale in Ingegneria, UniRm, 2024" },
    ];

    // ── Costruisci proposta batch (13 chiamate in un'unica proposta) ──
    const tokenAddr = addresses.token;
    const targets: string[] = [];
    const values: bigint[] = [];
    const calldatas: string[] = [];

    for (const u of upgrades) {
        targets.push(tokenAddr);
        values.push(0n);
        calldatas.push(
            token.interface.encodeFunctionData("upgradeCompetence", [
                u.signer.address, u.grade, u.proof,
            ])
        );
    }

    const description = "Batch upgrade: 5 Professors, 3 PhDs, 2 Masters, 3 Bachelors";

    // ── Proposta ──
    console.log("📝 Creazione proposta batch (13 upgrade)...");
    const tx = await governor.propose(targets, values, calldatas, description);
    const receipt = await tx.wait();
    const proposalId = receipt!.logs
        .map((log: any) => { try { return governor.interface.parseLog(log); } catch { return null; } })
        .find((p: any) => p?.name === "ProposalCreated")?.args?.proposalId;

    // ── Voto ──
    await mine(VOTING_DELAY + 1);
    // Fondatore (100.000) + Prof 2 (80.000) → 180.000 > 20% superquorum
    await governor.connect(signers[0]).castVote(proposalId, 1);
    await governor.connect(signers[1]).castVote(proposalId, 1);

    const state = Number(await governor.state(proposalId));
    if (state !== 4) {
        console.log("   ⏳ Superquorum non raggiunto, attendo fine voting period...");
        await mine(VOTING_PERIOD + 1);
    }
    console.log("   ✅ Proposta approvata!");

    // ── Queue + Execute ──
    const descHash = ethers.id(description);
    await governor.queue(targets, values, calldatas, descHash);
    console.log("   🔒 Proposta in coda nel Timelock");
    await time.increase(TIMELOCK_DELAY + 1);
    await governor.execute(targets, values, calldatas, descHash);
    console.log("   🚀 Upgrade eseguiti!\n");

    // ── Riepilogo ──
    console.log("📊 Token dopo gli upgrade:");
    const labels = [
        "Professor 1", "Professor 2", "Professor 3", "Professor 4", "Professor 5",
        "PhD 1", "PhD 2", "PhD 3", "Master 1", "Master 2",
        "Bachelor 1", "Bachelor 2", "Bachelor 3", "Student 1", "Student 2",
    ];
    for (let i = 0; i < 15; i++) {
        const bal = await token.balanceOf(signers[i].address);
        const grade = Number(await token.getMemberGrade(signers[i].address));
        console.log(`   ${labels[i]}: ${ethers.formatUnits(bal, 18)} COMP (${GRADE_NAMES[grade]})`);
    }

    const supply = await token.totalSupply();
    console.log(`\n   📊 Supply totale: ${ethers.formatUnits(supply, 18)} COMP`);
    console.log(`   📊 Quorum (4%): ${ethers.formatUnits(supply * 4n / 100n, 18)} COMP`);
    console.log(`   📊 Superquorum (20%): ${ethers.formatUnits(supply * 20n / 100n, 18)} COMP`);

    console.log("\n══════════════════════════════════════════════════");
    console.log("  ✅ Upgrade completati! Prossimo: 05_depositTreasury.ts");
    console.log("══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

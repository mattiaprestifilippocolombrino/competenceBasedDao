// ============================================================================
//  06_createProposals.ts — Crea 4 proposte di investimento
// ============================================================================
//
//  SUPPLY DOPO UPGRADE: 2.416.000 COMP
//  QUORUM (4%):         96.640 COMP
//  SUPERQUORUM (20%):   483.200 COMP
//
//  A — "Lab AI" (10 ETH)         → vincerà con SUPERQUORUM
//  B — "Ricerca" (3 ETH)         → vincerà con ~57% a fine votazione
//  C — "Espansione" (8 ETH)      → perderà nonostante il quorum
//  D — "Fondo Minore" (1 ETH)    → non raggiungerà il quorum
//
//  ESECUZIONE: npx hardhat run scripts/06_createProposals.ts --network localhost
// ============================================================================

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    console.log("══════════════════════════════════════════════════");
    console.log("  CompetenceDAO — Creazione di 4 proposte");
    console.log("══════════════════════════════════════════════════\n");

    const addressesPath = path.join(__dirname, "..", "deployedAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    const treasury = await ethers.getContractAt("Treasury", addresses.treasury);
    const governor = await ethers.getContractAt("MyGovernor", addresses.governor);

    const proposals = [
        { amount: "10", desc: "Proposta A: Investire 10 ETH in Laboratorio AI" },
        { amount: "3", desc: "Proposta B: Investire 3 ETH in Ricerca Congiunta" },
        { amount: "8", desc: "Proposta C: Investire 8 ETH in Espansione Campus" },
        { amount: "1", desc: "Proposta D: Investire 1 ETH in Fondo Sperimentale" },
    ];

    const proposalIds: string[] = [];
    for (const p of proposals) {
        const calldata = treasury.interface.encodeFunctionData("invest", [
            addresses.mockStartup, ethers.parseEther(p.amount),
        ]);
        const tx = await governor.propose([addresses.treasury], [0n], [calldata], p.desc);
        const receipt = await tx.wait();
        const id = receipt!.logs
            .map((log: any) => { try { return governor.interface.parseLog(log); } catch { return null; } })
            .find((pr: any) => pr?.name === "ProposalCreated")?.args?.proposalId;
        proposalIds.push(id.toString());
        console.log(`   📝 ${p.desc} (ID: ${id})`);
    }

    const state = { proposals: proposals.map((p, i) => ({ ...p, id: proposalIds[i] })) };
    fs.writeFileSync(path.join(__dirname, "..", "proposalState.json"), JSON.stringify(state, null, 2));

    console.log("\n══════════════════════════════════════════════════");
    console.log("  ✅ 4 proposte create! Prossimo: 07_voteOnProposals.ts");
    console.log("══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

// ============================================================================
//  02_joinMembers.ts — 14 membri entrano nella DAO con ETH
// ============================================================================
//
//  Ogni membro chiama joinDAO() inviando ETH. I professori, essendo più
//  ricchi, versano di più. Tutti partono come Student (coefficiente 1).
//
//  DEPOSITI:
//  - 4 Professors:  80-100 ETH ciascuno
//  - 3 PhDs:        20-30 ETH ciascuno
//  - 2 Masters:     10-15 ETH ciascuno
//  - 3 Bachelors:   5-8 ETH ciascuno
//  - 2 Students:    1-2 ETH ciascuno
//
//  ESECUZIONE: npx hardhat run scripts/02_joinMembers.ts --network localhost
// ============================================================================

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const signers = await ethers.getSigners();

    console.log("══════════════════════════════════════════════════");
    console.log("  CompetenceDAO — 14 membri entrano nella DAO");
    console.log("══════════════════════════════════════════════════\n");

    const addressesPath = path.join(__dirname, "..", "deployedAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    const token = await ethers.getContractAt("GovernanceToken", addresses.token);

    // Lista dei 14 nuovi membri (signer[0] = fondatore, già entrato nel deploy)
    const members = [
        { signer: signers[1], eth: "80", label: "Professor 2" },
        { signer: signers[2], eth: "90", label: "Professor 3" },
        { signer: signers[3], eth: "70", label: "Professor 4" },
        { signer: signers[4], eth: "60", label: "Professor 5" },
        { signer: signers[5], eth: "30", label: "PhD 1" },
        { signer: signers[6], eth: "25", label: "PhD 2" },
        { signer: signers[7], eth: "20", label: "PhD 3" },
        { signer: signers[8], eth: "15", label: "Master 1" },
        { signer: signers[9], eth: "10", label: "Master 2" },
        { signer: signers[10], eth: "8", label: "Bachelor 1" },
        { signer: signers[11], eth: "5", label: "Bachelor 2" },
        { signer: signers[12], eth: "6", label: "Bachelor 3" },
        { signer: signers[13], eth: "2", label: "Student 1" },
        { signer: signers[14], eth: "1", label: "Student 2" },
    ];

    for (const m of members) {
        await token.connect(m.signer).joinDAO({ value: ethers.parseEther(m.eth) });
        const bal = await token.balanceOf(m.signer.address);
        console.log(`   💰 ${m.label}: ${m.eth} ETH → ${ethers.formatUnits(bal, 18)} COMP`);
    }

    const supply = await token.totalSupply();
    console.log(`\n   📊 Supply totale: ${ethers.formatUnits(supply, 18)} COMP`);
    console.log("\n══════════════════════════════════════════════════");
    console.log("  ✅ 14 membri aggiunti! Prossimo: 03_delegateAll.ts");
    console.log("══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

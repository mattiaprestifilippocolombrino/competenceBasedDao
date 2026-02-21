# CompetenceDAO — Documentazione Completa

> **From Token-Based to Competence-Based Governance: Voting in DAOs Meets Verifiable Credentials**

Questo progetto implementa una **DAO (Decentralized Autonomous Organization)** in cui il potere di voto non è determinato solo dalla quantità di token posseduti, ma è modulato dal **grado di competenza** del membro. I membri con credenziali verificabili più elevate (PhD, Professore) ricevono un moltiplicatore sui propri token, amplificando il loro peso decisionale.

---

## Indice

1. [Panoramica del Progetto](#1-panoramica-del-progetto)
2. [Stack Tecnologico](#2-stack-tecnologico)
3. [Struttura del Progetto](#3-struttura-del-progetto)
4. [Smart Contracts](#4-smart-contracts)
   - 4.1 [GovernanceToken.sol](#41-governancetokensol)
   - 4.2 [MyGovernor.sol](#42-mygovernorsol)
   - 4.3 [Treasury.sol](#43-treasurysol)
   - 4.4 [StartupRegistry.sol](#44-startupregistrysol)
   - 4.5 [MockStartup.sol](#45-mockstartupsol)
5. [Pipeline degli Script](#5-pipeline-degli-script)
6. [Suite di Test](#6-suite-di-test)
7. [Modulo Hardhat Ignition](#7-modulo-hardhat-ignition)
8. [Configurazione](#8-configurazione)
9. [Flussi Principali](#9-flussi-principali)
10. [Parametri di Governance](#10-parametri-di-governance)

---

## 1. Panoramica del Progetto

La CompetenceDAO è un sistema di governance decentralizzata che combina tre concetti chiave:

| Concetto | Descrizione |
|---|---|
| **Membership Aperta** | Chiunque può entrare nella DAO inviando ETH e ricevendo token COMP |
| **Governance Basata su Competenze** | Il peso di voto è moltiplicato dal grado accademico del membro |
| **Investimenti Collettivi** | La DAO decide collettivamente come investire i fondi in startup |

### Formula dei Token

```
TokenTotali = TokenBase × CoefficienteCompetenza
```

| Grado | Coefficiente | Esempio (10 ETH depositati) |
|---|---|---|
| Student | ×1 | 10.000 COMP |
| Bachelor Degree | ×2 | 20.000 COMP |
| Master Degree | ×3 | 30.000 COMP |
| PhD | ×4 | 40.000 COMP |
| Professor | ×5 | 50.000 COMP |

### Ciclo di Vita di una Proposta

```
propose → (votingDelay) → vote → (votingPeriod) → queue → (timelockDelay) → execute
```

Se viene raggiunto il **superquorum** (70%), la proposta viene approvata immediatamente senza attendere la fine del voting period.

---

## 2. Stack Tecnologico

| Componente | Versione | Scopo |
|---|---|---|
| **Solidity** | 0.8.28 | Linguaggio smart contracts |
| **Hardhat** | 2.28.6 | Framework di sviluppo e testing |
| **OpenZeppelin Contracts** | 5.4.0 | Libreria di contratti sicuri e standard |
| **TypeScript** | — | Script e test |
| **Hardhat Toolbox** | 6.1.0 | Plugin integrati (ethers, chai, coverage, ecc.) |
| **EVM Version** | Cancun | Versione target della Ethereum Virtual Machine |

---

## 3. Struttura del Progetto

```
competencesDao/
├── contracts/                      # Smart contracts Solidity
│   ├── GovernanceToken.sol         # Token ERC20 con membership e competenze
│   ├── MyGovernor.sol              # Contratto di governance (proposte e voti)
│   ├── Treasury.sol                # Tesoro della DAO (gestione fondi)
│   ├── StartupRegistry.sol         # Registro delle startup
│   └── MockStartup.sol             # Startup fittizia per test
│
├── scripts/                        # Pipeline di demo (esecuzione sequenziale)
│   ├── 01_deploy.ts                # Deploy di tutti i contratti
│   ├── 02_joinMembers.ts           # 14 membri entrano nella DAO
│   ├── 03_delegateAll.ts           # Auto-delega dei voti
│   ├── 04_upgradeCompetences.ts    # Upgrade competenze via governance
│   ├── 05_depositTreasury.ts       # Mint aggiuntivo di token
│   ├── 06_createProposals.ts       # Creazione di 4 proposte di investimento
│   ├── 07_voteOnProposals.ts       # Votazione e queue delle proposte
│   └── 08_executeProposals.ts      # Esecuzione proposte approvate
│
├── test/                           # Suite di test automatizzati
│   ├── 01_tokenVotes.test.ts       # Test joinDAO, mintTokens, delega
│   ├── 02_governorLifecycle.test.ts# Ciclo completo di governance
│   ├── 03_treasuryInvestmentFlow.test.ts # Flusso di investimento
│   ├── 04_superquorum.test.ts      # Test del superquorum
│   └── 05_competenceUpgrade.test.ts# Upgrade competenze via governance
│
├── ignition/                       # Deploy dichiarativo Hardhat Ignition
│   └── InvestmentDAO.ts            # Modulo di deploy
│
├── hardhat.config.ts               # Configurazione Hardhat
├── package.json                    # Dipendenze Node.js
├── deployedAddresses.json          # Indirizzi dei contratti deployati
├── proposalState.json              # Stato delle proposte (usato tra script)
└── tsconfig.json                   # Configurazione TypeScript
```

---

## 4. Smart Contracts

### 4.1 GovernanceToken.sol

**Ruolo:** Token ERC20 con sistema di membership e competenze.

**Ereditarietà:**
- `ERC20` → funzionalità base del token (transfer, balanceOf)
- `ERC20Permit` → approvazioni off-chain con firma gasless
- `ERC20Votes` → checkpoint storici e potere di voto delegabile

**Costanti:**
- `TOKENS_PER_ETH = 1000` — tasso di conversione: 1 ETH = 1.000 COMP
- `MAX_DEPOSIT = 100 ether` — deposito massimo per membro

**Variabili di Stato:**
| Variabile | Tipo | Descrizione |
|---|---|---|
| `timelock` | `address` | Indirizzo del TimelockController (autorizza gli upgrade) |
| `treasury` | `address` | Indirizzo del Treasury (riceve gli ETH) |
| `deployer` | `address immutable` | Indirizzo del deployer (può chiamare `setTreasury` una volta) |
| `competenceScore` | `mapping(CompetenceGrade => uint256)` | Coefficiente per ogni grado |
| `baseTokens` | `mapping(address => uint256)` | Token base di ogni membro (pre-moltiplicatore) |
| `memberGrade` | `mapping(address => CompetenceGrade)` | Grado corrente di ogni membro |
| `isMember` | `mapping(address => bool)` | Flag di membership |
| `competenceProof` | `mapping(address => string)` | Prova di competenza |

**Funzioni Principali:**

| Funzione | Accesso | Descrizione |
|---|---|---|
| `joinDAO()` | Chiunque (payable) | Entra nella DAO inviando ETH, riceve COMP proporzionali. Registra il membro come Student. Gli ETH vanno al Treasury. |
| `mintTokens()` | Solo membri (payable) | Minta token aggiuntivi con il moltiplicatore del grado corrente. Aggiorna i `baseTokens`. |
| `upgradeCompetence(address, grade, proof)` | Solo Timelock | Promuove un membro a un grado superiore. Minta token aggiuntivi: `baseTokens × (nuovoCoeff − vecchioCoeff)`. |
| `setTreasury(address)` | Solo deployer (one-shot) | Imposta l'indirizzo del Treasury. Può essere chiamata una sola volta. |
| `getMemberGrade(address)` | View | Restituisce il grado di competenza di un membro. |

**Errori Custom:**
`OnlyTimelock`, `OnlyDeployer`, `AlreadyMember`, `NotMember`, `ZeroDeposit`, `ExceedsMaxDeposit`, `CannotDowngrade`, `ZeroAddress`, `TreasuryNotSet`, `TreasuryAlreadySet`, `TreasuryTransferFailed`

---

### 4.2 MyGovernor.sol

**Ruolo:** Il "cervello" della DAO — gestisce l'intero ciclo di vita delle proposte.

**Ereditarietà (7 moduli OpenZeppelin):**

| Modulo | Funzione |
|---|---|
| `Governor` | Nucleo: propose, state, castVote |
| `GovernorSettings` | Parametri: votingDelay, votingPeriod, threshold |
| `GovernorCountingSimple` | Conteggio voti: For / Against / Abstain |
| `GovernorVotes` | Collega il token ERC20Votes per il peso di voto |
| `GovernorVotesQuorumFraction` | Quorum in % della supply totale |
| `GovernorVotesSuperQuorumFraction` | Superquorum (approvazione rapida) |
| `GovernorTimelockControl` | Delay di sicurezza prima dell'esecuzione |

**Parametri del Costruttore:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `token_` | `IVotes` | Token ERC20Votes per il peso di voto |
| `timelock_` | `TimelockController` | Delay di sicurezza |
| `votingDelay_` | `uint48` | Blocchi di attesa prima del voto |
| `votingPeriod_` | `uint32` | Durata della finestra di voto |
| `proposalThreshold_` | `uint256` | Voti minimi per creare una proposta |
| `quorumNumerator_` | `uint256` | Quorum in % (es. 20 = 20%) |
| `superQuorumNumerator_` | `uint256` | Superquorum in % (es. 70 = 70%) |

**Funzione Chiave — `state()`:**
Unisce due logiche:
1. **Superquorum:** se il 70% della supply vota FOR, la proposta è approvata immediatamente
2. **Timelock:** gestisce gli stati Queued → Executed / Canceled

Il contratto contiene numerosi override necessari per risolvere i conflitti di ereditarietà multipla (linearizzazione C3 di Solidity), tutti documentati nel codice sorgente.

---

### 4.3 Treasury.sol

**Ruolo:** Custodisce i fondi ETH della DAO e gestisce gli investimenti.

**Regola Fondamentale:** L'UNICO indirizzo che può chiamare `invest()` è il TimelockController. Questo garantisce che nessun individuo possa spostare fondi senza il consenso della comunità.

**Funzioni:**

| Funzione | Accesso | Descrizione |
|---|---|---|
| `deposit()` | Chiunque (payable) | Deposita ETH nel Treasury |
| `receive()` | Automatica | Permette di ricevere ETH direttamente |
| `invest(address, uint256)` | Solo Timelock | Trasferisce ETH a una startup. Registra l'investimento nello storico. |
| `getBalance()` | View | Restituisce il saldo ETH corrente |

**Flusso di Investimento:**
```
Membro propone → Comunità vota → Governor mette in coda → Timelock attende → Treasury.invest() → ETH alla startup
```

---

### 4.4 StartupRegistry.sol

**Ruolo:** Registro on-chain delle startup in cui la DAO può investire.

**Struttura Dati:**
```solidity
struct Startup {
    string name;           // Nome della startup
    address wallet;        // Indirizzo wallet
    string description;    // Descrizione del progetto
    bool active;           // true = può ricevere investimenti
}
```

**Funzioni:**

| Funzione | Accesso | Descrizione |
|---|---|---|
| `registerStartup(name, wallet, desc)` | Solo owner | Registra una nuova startup |
| `deactivateStartup(id)` | Solo owner | Disattiva una startup |
| `getStartup(id)` | View | Restituisce i dati completi |
| `isActive(id)` | View | Verifica se una startup è attiva |

> **Nota didattica:** Questo contratto non è necessario per il funzionamento del Governor, ma rende il progetto più realistico. In una versione avanzata, la registrazione potrebbe essere gestita tramite governance.

---

### 4.5 MockStartup.sol

**Ruolo:** Contratto fittizio che simula una startup ricevente investimenti.

Registra automaticamente ogni investimento ricevuto (contatore e totale), emette l'evento `FundsReceived` e espone il saldo corrente tramite `getBalance()`.

Viene usato esclusivamente per scopi di test e demo.

---

## 5. Pipeline degli Script

Gli 8 script nella cartella `scripts/` formano una pipeline sequenziale che dimostra l'intero ciclo di vita della DAO. Devono essere eseguiti in ordine su un nodo Hardhat locale.

### Avvio del nodo locale

```bash
npx hardhat node
```

### Esecuzione sequenziale

```bash
npx hardhat run scripts/01_deploy.ts --network localhost
npx hardhat run scripts/02_joinMembers.ts --network localhost
npx hardhat run scripts/03_delegateAll.ts --network localhost
npx hardhat run scripts/04_upgradeCompetences.ts --network localhost
npx hardhat run scripts/05_depositTreasury.ts --network localhost
npx hardhat run scripts/06_createProposals.ts --network localhost
npx hardhat run scripts/07_voteOnProposals.ts --network localhost
npx hardhat run scripts/08_executeProposals.ts --network localhost
```

---

### 5.1 — `01_deploy.ts` (Deploy + Fondatore)

**Ordine di deploy:**
1. **TimelockController** — delay di 1 ora
2. **GovernanceToken** — riceve l'indirizzo del Timelock
3. **MyGovernor** — parametri: votingDelay=1, votingPeriod=50, quorum=20%, superquorum=70%
4. **Treasury** — controllato dal Timelock
5. **StartupRegistry** + **MockStartup** — contratti accessori

**Post-deploy:**
- Il token viene collegato al Treasury (`setTreasury`)
- Il fondatore entra nella DAO con 100 ETH → 100.000 COMP
- Il fondatore auto-delega i propri voti
- Ruoli del Timelock configurati: Governor = PROPOSER + CANCELLER, chiunque = EXECUTOR
- L'admin del Timelock viene revocato al deployer → DAO decentralizzata
- Gli indirizzi vengono salvati in `deployedAddresses.json`

---

### 5.2 — `02_joinMembers.ts` (14 Nuovi Membri)

14 nuovi membri entrano nella DAO con depositi variabili:

| # | Ruolo futuro | Membro | ETH Depositati | COMP Ricevuti |
|---|---|---|---|---|
| 1-4 | Professor | signers[1..4] | 60-90 ETH | 60.000-90.000 |
| 5-7 | PhD | signers[5..7] | 20-30 ETH | 20.000-30.000 |
| 8-9 | Master | signers[8..9] | 10-15 ETH | 10.000-15.000 |
| 10-12 | Bachelor | signers[10..12] | 5-8 ETH | 5.000-8.000 |
| 13-14 | Student | signers[13..14] | 1-2 ETH | 1.000-2.000 |

Tutti entrano come Student. L'upgrade avviene nello script 04.

---

### 5.3 — `03_delegateAll.ts` (Auto-Delega)

Ogni membro delega i propri voti a sé stesso (`delegate(self)`). Questo è necessario perché in OpenZeppelin `ERC20Votes`, possedere token **non** dà automaticamente diritto di voto. Senza delega, `getVotes()` restituisce 0.

Dopo le deleghe viene minato 1 blocco per consolidare i checkpoint on-chain.

---

### 5.4 — `04_upgradeCompetences.ts` (Upgrade di Competenza)

Crea **una singola proposta batch** contenente 13 chiamate a `upgradeCompetence()`:

| Membro | Grado Finale | Prova di Competenza |
|---|---|---|
| signers[0..4] | Professor (×5) | Professori universitari italiani |
| signers[5..7] | PhD (×4) | Dottorati da ETH Zürich, LSE, TU München |
| signers[8..9] | Master (×3) | Lauree magistrali da PoliMi, Bocconi |
| signers[10..12] | Bachelor (×2) | Lauree triennali |
| signers[13..14] | Student (×1) | Nessun upgrade |

**Processo:**
1. Proposta batch creata dal fondatore
2. Fondatore + Professor 2 votano FOR → superquorum raggiunto
3. Queue nel Timelock
4. Avanzamento tempo di 1 ora
5. Esecuzione: tutti i 13 upgrade applicati in una transazione

**Risultato:** I token di ogni membro vengono ricalcolati secondo la formula `baseTokens × coefficiente`.

---

### 5.5 — `05_depositTreasury.ts` (Mint Aggiuntivo)

9 membri mintano token aggiuntivi con `mintTokens()`. I token ricevuti tengono conto del grado di competenza corrente:

```
TokenMintati = ETH × 1.000 × CoefficienteCompetenza
```

Esempio: un Professor che invia 50 ETH riceve 50 × 1.000 × 5 = 250.000 COMP. Gli ETH vanno nel Treasury.

---

### 5.6 — `06_createProposals.ts` (4 Proposte di Investimento)

Crea 4 proposte per investire ETH dal Treasury nella MockStartup:

| Proposta | Descrizione | ETH | Esito Atteso |
|---|---|---|---|
| A | Laboratorio AI | 10 | ✅ Superquorum (>70% FOR) |
| B | Ricerca Congiunta | 3 | ✅ ~63% maggioranza FOR |
| C | Espansione Campus | 8 | ❌ Quorum raggiunto, maggioranza contraria |
| D | Fondo Sperimentale | 1 | ❌ Sotto quorum (20%) |

Gli ID delle proposte vengono salvati in `proposalState.json`.

---

### 5.7 — `07_voteOnProposals.ts` (Votazione e Queue)

**Scenari di voto (supply ≈ 3.507.000 COMP, quorum 20% ≈ 701.400, superquorum 70% ≈ 2.454.900):**

- **Proposta A — Superquorum (70%):** Prof1 (750k) + Prof2 (600k) + Prof3 (675k) + Prof4 (525k) = 2.550.000 FOR (72.7%) → approvata immediatamente
- **Proposta B — Quorum + maggioranza FOR (~63%):** Prof1 (750k) + PhD1 (160k) = 910.000 FOR vs Prof5 (450k) + PhD3 (80k) = 530.000 AGAINST → approvata a fine period
- **Proposta C — Quorum raggiunto ma perde:** Prof5 (450k) + PhD1 (160k) + PhD2 (132k) = 742.000 FOR vs Prof1 (750k) + Prof2 (600k) = 1.350.000 AGAINST → bocciata
- **Proposta D — Sotto quorum:** Bachelor2 (10k) + Bachelor3 (12k) + Student1 (2k) + Student2 (1k) = 25.000 FOR (0.7%) → bocciata

Dopo la votazione, le proposte A e B vengono messe in coda nel Timelock.

---

### 5.8 — `08_executeProposals.ts` (Esecuzione + Riepilogo)

1. Avanza il tempo di 1 ora (delay del Timelock)
2. Esegue le proposte A e B: il Timelock chiama `treasury.invest(startup, importo)`
3. Mostra il riepilogo finale: stato di tutte le proposte, bilanci di Treasury e MockStartup

**Risultato:** 13 ETH totali investiti nella startup (10 + 3), il Treasury mantiene i fondi rimanenti.

---

## 6. Suite di Test

I 5 file di test coprono tutti gli aspetti critici del sistema. Esecuzione:

```bash
npx hardhat test
```

### 6.1 — `01_tokenVotes.test.ts` (GovernanceToken)

| Test | Verifica |
|---|---|
| `joinDAO() minta 1.000 COMP per 1 ETH` | Conversione corretta |
| `joinDAO() minta 50.000 COMP per 50 ETH` | Proporzionalità |
| `joinDAO() registra come Student` | Membership e grado iniziale |
| `joinDAO() salva i token base` | Correttezza dei `baseTokens` |
| `joinDAO() reverta senza ETH` | Errore `ZeroDeposit` |
| `joinDAO() reverta oltre 100 ETH` | Errore `ExceedsMaxDeposit` |
| `joinDAO() reverta se già membro` | Errore `AlreadyMember` |
| `competenceScore restituisce valori corretti` | Tabella coefficienti |
| `senza delega, getVotes = 0` | Necessità della delega |
| `dopo delegate(self), getVotes = balanceOf` | Attivazione voting power |
| `trasferimento aggiorna i checkpoint` | Coerenza ERC20Votes |
| `getPastVotes snapshot storici` | Voti al blocco passato |
| `upgradeCompetence reverta se non Timelock` | Access control |
| `mintTokens() con moltiplicatore Student` | Mint aggiuntivo |
| `mintTokens() reverta se non membro` | Access control |
| `mintTokens() reverta senza ETH` | Errore `ZeroDeposit` |
| `mintTokens() invia ETH al Treasury` | Trasferimento corretto |

### 6.2 — `02_governorLifecycle.test.ts` (Ciclo di Vita)

| Test | Verifica |
|---|---|
| `deploy corretto` | Parametri di governance impostati |
| `ciclo completo propose → vote → queue → execute` | Upgrade competenza via governance end-to-end |
| `proposta bocciata se maggioranza contro` | Stato Defeated con voti 50/50 |

### 6.3 — `03_treasuryInvestmentFlow.test.ts` (Treasury)

| Test | Verifica |
|---|---|
| `accetta depositi tramite deposit()` | Ricezione ETH |
| `invest() reverta se non dal Timelock` | Access control |
| `flusso completo deposito → proposta → execute` | Investimento end-to-end, bilanci verificati |

### 6.4 — `04_superquorum.test.ts` (SuperQuorum)

| Test | Verifica |
|---|---|
| `superquorum → Succeeded prima della fine` | 100% della supply vota → approvazione immediata |
| `sotto superquorum → resta Active` | 10% vota → resta Active fino a fine period |

### 6.5 — `05_competenceUpgrade.test.ts` (Upgrade Competenza)

| Test | Verifica |
|---|---|
| `Student → PhD: calcolo token aggiuntivi` | 5.000 × (4−1) = 15.000 → 20.000 totali |
| `Student → Professor: calcolo corretto` | 5.000 × (5−1) = 20.000 → 25.000 totali |
| `Upgrade progressivo: Student → Bachelor → Professor` | Multi-step corretto |
| `downgrade impossibile` | Revert su tentativo di retrocessione |
| `membro upgraded ha più voting power` | Voting power incrementato |

---

## 7. Modulo Hardhat Ignition

Il file `ignition/InvestmentDAO.ts` fornisce un sistema di deploy **dichiarativo** alternativo agli script imperativi. Hardhat Ignition gestisce automaticamente l'ordine di deploy basandosi sulle dipendenze dichiarate.

**Deployment:** `npx hardhat ignition deploy ignition/InvestmentDAO.ts --network localhost`

Il modulo dichiara gli stessi 6 contratti degli script manuali e configura i ruoli del Timelock nello stesso modo.

---

## 8. Configurazione

### `hardhat.config.ts`

```typescript
solidity: {
    version: "0.8.28",
    settings: {
        evmVersion: "cancun",        // Versione EVM target
        optimizer: {
            enabled: true,
            runs: 200,               // Ottimizzazione per 200 esecuzioni
        },
    },
}
```

### `package.json` — Dipendenze

| Pacchetto | Tipo | Scopo |
|---|---|---|
| `hardhat@2.28.6` | Dev | Framework di sviluppo |
| `@nomicfoundation/hardhat-toolbox@6.1.0` | Dev | Plugin integrati |
| `@openzeppelin/contracts@5.4.0` | Prod | Contratti standard sicuri |

---

## 9. Flussi Principali

### 9.1 — Ingresso nella DAO

```
Utente chiama joinDAO({value: X ETH})
  ├── Verifica: Treasury impostato, non già membro, 0 < X ≤ 100 ETH
  ├── Calcolo: tokenAmount = X × 1.000
  ├── Registrazione: isMember = true, grade = Student, baseTokens = tokenAmount
  ├── Mint: _mint(utente, tokenAmount)
  └── Trasferimento: ETH → Treasury
```

### 9.2 — Upgrade di Competenza

```
1. Un membro propone l'upgrade tramite il Governor
2. La comunità vota FOR/AGAINST
3. Se quorum raggiunto e maggioranza favorevole → Succeeded
   (oppure Succeeded immediato se superquorum raggiunto)
4. Queue nel Timelock (attesa 1 ora)
5. Execute: Timelock chiama upgradeCompetence()
   ├── tokenAggiuntivi = baseTokens × (nuovoCoeff − vecchioCoeff)
   ├── Aggiorna memberGrade e competenceProof
   └── Mint token aggiuntivi
```

### 9.3 — Investimento in Startup

```
1. Un membro propone: treasury.invest(startup, importo)
2. Votazione della comunità
3. Approvazione + Queue + Delay Timelock
4. Execute: Timelock → Treasury.invest() → ETH trasferiti alla startup
```

---

## 10. Parametri di Governance

| Parametro | Valore | Descrizione |
|---|---|---|
| `votingDelay` | 1 blocco | Attesa prima dell'inizio del voto |
| `votingPeriod` | 50 blocchi | Durata della finestra di voto |
| `proposalThreshold` | 0 COMP | Chiunque può proporre (didattico) |
| `quorumPercent` | 20% | Partecipazione minima per validità |
| `superQuorumPercent` | 70% | Soglia per approvazione immediata |
| `timelockDelay` | 3600 secondi (1 ora) | Attesa prima dell'esecuzione |
| `TOKENS_PER_ETH` | 1.000 | Tasso di conversione ETH → COMP |
| `MAX_DEPOSIT` | 100 ETH | Deposito massimo per membro |

---

> **Nota:** Questo progetto ha scopi didattici e dimostrativi. I parametri di governance (specialmente `votingPeriod` e `proposalThreshold`) sono impostati per facilità di testing e non sono adatti a un ambiente di produzione.

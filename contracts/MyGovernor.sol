// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ============================================================================
//  MyGovernor.sol — Il cervello della DAO
// ============================================================================
//
//  COSA FA QUESTO CONTRATTO:
//  -------------------------
//  Gestisce l'intero ciclo di vita delle proposte di investimento:
//    propose → vote → queue → (delay) → execute
//
//  È composto da 7 moduli OpenZeppelin che lavorano insieme:
//
//  1. Governor (core)         → motore base: propose, state, castVote
//  2. GovernorSettings        → parametri: votingDelay, votingPeriod, threshold
//  3. GovernorCountingSimple  → conteggio: For / Against / Abstain
//  4. GovernorVotes           → collega il token ERC20Votes per il peso di voto
//  5. GovernorVotesQuorumFraction   → quorum in % della supply totale
//  6. GovernorVotesSuperQuorumFraction → superquorum (approvazione rapida)
//  7. GovernorTimelockControl → delay di sicurezza prima dell'esecuzione
//
//  CATENA DI EREDITARIETÀ (linearizzazione C3):
//  ─────────────────────────────────────────────
//  MyGovernor
//    → GovernorTimelockControl     (esecuzione ritardata via timelock)
//    → GovernorVotesSuperQuorumFraction (superquorum % della supply)
//      → GovernorVotesQuorumFraction    (quorum % della supply)
//      → GovernorSuperQuorum            (logica superquorum base)
//    → GovernorVotes               (peso di voto dal token ERC20Votes)
//    → GovernorCountingSimple      (conteggio: for/against/abstain)
//    → GovernorSettings            (votingDelay, votingPeriod, threshold)
//    → Governor                    (nucleo del sistema)
//
//  FLUSSO DI UNA PROPOSTA:
//  -----------------------
//  1. propose()   → crea la proposta, stato = Pending
//  2. (voting delay passa) → stato = Active
//  3. castVote()  → i membri votano For/Against/Abstain
//  4. (voting period finisce) → stato = Succeeded o Defeated
//     OPPURE: se superquorum raggiunto → Succeeded prima della scadenza!
//  5. queue()     → mette la proposta nel Timelock (stato = Queued)
//  6. (timelock delay passa)
//  7. execute()   → il Timelock esegue l'operazione (stato = Executed)
// ============================================================================

// --- Import dei moduli OpenZeppelin Governance v5 ---
import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesSuperQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";

import "@openzeppelin/contracts/governance/TimelockController.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";

/// @title MyGovernor
/// @notice Logica della DAO: gestisce proposte, votazioni, quorum/superquorum e timelock
contract MyGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorVotesSuperQuorumFraction,
    GovernorTimelockControl
{
    // ======================================================================
    //  Constructor — Configura tutti i parametri della governance
    // ======================================================================

    /// @param token_                Token ERC20Votes (chi lo possiede può votare)
    /// @param timelock_             TimelockController (delay di sicurezza)
    /// @param votingDelay_          Blocchi/secondi di attesa prima dell'inizio del voto
    /// @param votingPeriod_         Durata della finestra di voto
    /// @param proposalThreshold_    Voti minimi per creare una proposta
    /// @param quorumNumerator_      Quorum in % (es. 4 = 4% della supply)
    /// @param superQuorumNumerator_ Superquorum in % (es. 20 = 20%, deve essere ≥ quorum)
    constructor(
        IVotes token_,
        TimelockController timelock_,
        uint48 votingDelay_,
        uint32 votingPeriod_,
        uint256 proposalThreshold_,
        uint256 quorumNumerator_,
        uint256 superQuorumNumerator_
    )
        Governor("MyGovernor")
        GovernorSettings(votingDelay_, votingPeriod_, proposalThreshold_)
        GovernorVotes(token_)
        GovernorVotesQuorumFraction(quorumNumerator_)
        GovernorVotesSuperQuorumFraction(superQuorumNumerator_)
        GovernorTimelockControl(timelock_)
    {}

    // ======================================================================
    //  Override richiesti da Solidity per risolvere conflitti di ereditarietà
    // ======================================================================
    //
    //  PERCHÉ SERVONO QUESTI OVERRIDE?
    //  ───────────────────────────────
    //  Quando un contratto eredita da più contratti che definiscono la STESSA
    //  funzione, Solidity richiede un override esplicito per chiarire quale
    //  implementazione usare. In tutti i casi usiamo `super.xxx()` che segue
    //  la linearizzazione C3 (chiama la versione "più in alto" nella catena).

    // ----- Parametri di governance (GovernorSettings ↔ Governor) -----

    /// @notice Ritardo prima dell'inizio della votazione
    /// @dev Override necessario: sia Governor che GovernorSettings definiscono questa funzione
    function votingDelay()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    /// @notice Durata della finestra di voto
    function votingPeriod()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    /// @notice Soglia minima di voti per poter creare una proposta
    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    // ----- Quorum (GovernorVotesQuorumFraction ↔ Governor) -----

    /// @notice Numero minimo di voti richiesti perché la proposta sia valida
    /// @dev Il quorum è calcolato come percentuale della supply totale votabile
    ///      al blocco di snapshot della proposta
    function quorum(
        uint256 timepoint
    )
        public
        view
        override(Governor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(timepoint);
    }

    // ----- Clock (GovernorVotes ↔ Governor) -----

    /// @notice Clock corrente (blocco o timestamp, dipende dal token)
    function clock()
        public
        view
        override(Governor, GovernorVotes)
        returns (uint48)
    {
        return super.clock();
    }

    /// @notice Modalità del clock (es. "mode=blocknumber&from=default")
    function CLOCK_MODE()
        public
        view
        override(Governor, GovernorVotes)
        returns (string memory)
    {
        return super.CLOCK_MODE();
    }

    // ----- Conteggio voti (GovernorCountingSimple ↔ GovernorSuperQuorum) -----

    /// @notice Restituisce i voti di una proposta: contrari, favorevoli, astenuti
    /// @dev Serve sia a GovernorCountingSimple (conteggio) sia a GovernorSuperQuorum
    ///      (verifica se il superquorum è stato raggiunto)
    function proposalVotes(
        uint256 proposalId
    )
        public
        view
        override(GovernorCountingSimple, GovernorSuperQuorum)
        returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)
    {
        return super.proposalVotes(proposalId);
    }

    // ----- Stato della proposta (SuperQuorumFraction ↔ TimelockControl) -----

    /// @notice Stato corrente di una proposta
    /// @dev Unisce DUE logiche:
    ///      1. Superquorum: può far passare la proposta PRIMA della scadenza
    ///      2. Timelock: gestisce stati Queued → Executed / Canceled
    function state(
        uint256 proposalId
    )
        public
        view
        override(
            Governor,
            GovernorVotesSuperQuorumFraction,
            GovernorTimelockControl
        )
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    // ----- Timelock: coda, esecuzione, cancellazione -----

    /// @notice Indica se la proposta necessita di essere messa in coda (timelock)
    /// @dev Ritorna true perché usiamo GovernorTimelockControl
    function proposalNeedsQueuing(
        uint256 proposalId
    ) public view override(Governor, GovernorTimelockControl) returns (bool) {
        return super.proposalNeedsQueuing(proposalId);
    }

    /// @notice Mette in coda le operazioni della proposta nel TimelockController
    /// @dev Viene chiamata internamente da queue()
    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return
            super._queueOperations(
                proposalId,
                targets,
                values,
                calldatas,
                descriptionHash
            );
    }

    /// @notice Esegue le operazioni della proposta tramite il TimelockController
    /// @dev Viene chiamata internamente da execute()
    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(
            proposalId,
            targets,
            values,
            calldatas,
            descriptionHash
        );
    }

    /// @notice Cancella una proposta (e rimuove l'operazione dal timelock se in coda)
    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    /// @notice Indirizzo che esegue le azioni (il TimelockController)
    /// @dev Le azioni NON vengono eseguite dal Governor ma dal Timelock
    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }

    // ----- Aggiornamento quorum (QuorumFraction ↔ SuperQuorumFraction) -----

    /// @notice Aggiorna il numeratore del quorum
    /// @dev Assicura che il quorum resti sempre ≤ superquorum
    function _updateQuorumNumerator(
        uint256 newQuorumNumerator
    )
        internal
        override(GovernorVotesQuorumFraction, GovernorVotesSuperQuorumFraction)
    {
        super._updateQuorumNumerator(newQuorumNumerator);
    }
}

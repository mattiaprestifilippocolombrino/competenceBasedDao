// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ============================================================================
//  Treasury.sol — Il tesoro della DAO
// ============================================================================
//
//  COSA FA QUESTO CONTRATTO:
//  -------------------------
//  Conserva i fondi (ETH) della DAO e permette di investirli in startup
//  SOLO se l'operazione è stata approvata dalla governance e passa
//  attraverso il TimelockController.
//
//  REGOLA FONDAMENTALE:
//  --------------------
//  Il Treasury NON è controllabile dal deployer né da nessun altro account.
//  L'UNICO indirizzo che può chiamare `invest()` è il TimelockController.
//  Questo garantisce che nessun singolo individuo possa spostare i fondi
//  senza il consenso della comunità (voto + timelock).
//
//  FLUSSO:
//  -------
//  1. I membri depositano ETH chiamando deposit() o inviando ETH direttamente
//  2. Un membro propone un investimento nel Governor
//  3. La comunità vota
//  4. Se approvata, la proposta viene messa in coda nel Timelock
//  5. Dopo il delay, il Timelock chiama Treasury.invest() → ETH va alla startup
// ============================================================================

/// @title Treasury
/// @notice Contratto che custodisce i fondi della DAO e gestisce gli investimenti
contract Treasury {
    // ── Variabili di stato ──

    /// @notice Indirizzo del TimelockController — l'UNICO che può ordinare investimenti
    address public timelock;

    /// @notice Storico di tutti gli investimenti effettuati
    /// @dev Mapping: indirizzo startup → totale ETH investiti
    mapping(address => uint256) public investedIn;

    // ── Eventi ──

    /// @notice Emesso quando qualcuno deposita ETH nel Treasury
    /// @param depositor Chi ha depositato
    /// @param amount    Importo in wei
    event Deposited(address indexed depositor, uint256 amount);

    /// @notice Emesso quando il Treasury investe in una startup
    /// @param startup Indirizzo della startup che riceve i fondi
    /// @param amount  Importo in wei
    event Invested(address indexed startup, uint256 amount);

    // ── Errori custom (più economici dei require con stringa) ──

    /// @notice Errore: solo il Timelock può chiamare questa funzione
    error OnlyTimelock();

    /// @notice Errore: fondi insufficienti nel Treasury
    error InsufficientBalance();

    /// @notice Errore: il trasferimento ETH alla startup è fallito
    error TransferFailed();

    /// @notice Errore: l'indirizzo fornito è zero (non valido)
    error ZeroAddress();

    // ── Modifier ──

    /// @notice Protegge le funzioni critiche: solo il Timelock può chiamarle
    /// @dev Questo è il meccanismo di sicurezza centrale del Treasury
    modifier onlyTimelock() {
        if (msg.sender != timelock) revert OnlyTimelock();
        _;
    }

    // ── Constructor ──

    /// @notice Inizializza il Treasury con l'indirizzo del TimelockController
    /// @param _timelock Indirizzo del TimelockController che controllerà il Treasury
    constructor(address _timelock) {
        if (_timelock == address(0)) revert ZeroAddress();
        timelock = _timelock;
    }

    // ── Funzioni pubbliche ──

    /// @notice Deposita ETH nel Treasury
    /// @dev Chiunque può depositare — i fondi restano nel contratto
    function deposit() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Permette al contratto di ricevere ETH direttamente (senza calldata)
    /// @dev Equivalente a deposit() ma per trasferimenti "puri" di ETH
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Investe ETH in una startup — SOLO il Timelock può chiamare
    /// @param _startup Indirizzo della startup destinataria
    /// @param _amount  Importo in wei da investire
    /// @dev Questa funzione viene chiamata dal Timelock dopo che una proposta
    ///      di investimento è stata approvata e il delay è trascorso
    function invest(address _startup, uint256 _amount) external onlyTimelock {
        // Controlli di sicurezza
        if (_startup == address(0)) revert ZeroAddress();
        if (address(this).balance < _amount) revert InsufficientBalance();

        // Registra l'investimento nello storico
        investedIn[_startup] += _amount;

        // Trasferisci ETH alla startup
        (bool success, ) = _startup.call{value: _amount}("");
        if (!success) revert TransferFailed();

        emit Invested(_startup, _amount);
    }

    /// @notice Restituisce il saldo ETH attuale del Treasury
    /// @return Saldo in wei
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}

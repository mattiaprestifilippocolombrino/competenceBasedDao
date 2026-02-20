// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ============================================================================
//  StartupRegistry.sol — Registro delle startup approvate
// ============================================================================
//
//  COSA FA QUESTO CONTRATTO:
//  -------------------------
//  Mantiene un registro di startup/progetti verso cui la DAO può investire.
//  Invece di proporre investimenti verso indirizzi "random", la DAO può
//  verificare che la startup sia registrata e attiva.
//
//  PERCHÉ SERVE:
//  -------------
//  In una DAO reale, non si investe verso un indirizzo qualsiasi.
//  Il registro serve per:
//  - dare un'identità leggibile alle startup (nome, descrizione)
//  - controllare che la startup sia ancora attiva
//  - rendere le proposte di investimento più trasparenti
//
//  NOTA DIDATTICA:
//  ---------------
//  Questo contratto NON è necessario per il funzionamento del Governor,
//  ma rende il progetto più realistico e completo. In una versione
//  avanzata, la registrazione potrebbe essere fatta tramite governance
//  anziché dal deployer.
// ============================================================================

/// @title StartupRegistry
/// @notice Registro on-chain delle startup in cui la DAO può investire
contract StartupRegistry {
    // ── Struttura dati per una startup ──

    /// @notice Dati di una startup registrata
    struct Startup {
        string name; // Nome della startup (es. "GreenTech AI")
        address wallet; // Indirizzo wallet che riceverà gli investimenti
        string description; // Breve descrizione del progetto
        bool active; // true = la startup può ricevere investimenti
    }

    // ── Variabili di stato ──

    /// @notice Chi ha deployato il contratto (può registrare startup)
    address public owner;

    /// @notice Contatore delle startup registrate (usato come ID)
    uint256 public startupCount;

    /// @notice Mapping ID → dati della startup
    mapping(uint256 => Startup) public startups;

    // ── Eventi ──

    /// @notice Emesso quando una nuova startup viene registrata
    event StartupRegistered(uint256 indexed id, string name, address wallet);

    /// @notice Emesso quando una startup viene disattivata
    event StartupDeactivated(uint256 indexed id);

    // ── Errori ──

    /// @notice Solo il proprietario può eseguire questa azione
    error OnlyOwner();

    /// @notice L'ID della startup non esiste
    error StartupNotFound();

    /// @notice L'indirizzo fornito è zero
    error ZeroAddress();

    // ── Modifier ──

    /// @notice Permette l'accesso solo al proprietario
    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ── Constructor ──

    /// @notice Imposta il deployer come proprietario del registro
    constructor() {
        owner = msg.sender;
    }

    // ── Funzioni pubbliche ──

    /// @notice Registra una nuova startup nel registro
    /// @param _name        Nome della startup
    /// @param _wallet      Indirizzo wallet della startup
    /// @param _description Breve descrizione del progetto
    /// @return id           ID assegnato alla startup
    function registerStartup(
        string calldata _name,
        address _wallet,
        string calldata _description
    ) external onlyOwner returns (uint256 id) {
        if (_wallet == address(0)) revert ZeroAddress();

        // L'ID è semplicemente il contatore corrente (parte da 0)
        id = startupCount;
        startups[id] = Startup({
            name: _name,
            wallet: _wallet,
            description: _description,
            active: true
        });

        // Incrementa il contatore per la prossima startup
        startupCount++;

        emit StartupRegistered(id, _name, _wallet);
    }

    /// @notice Disattiva una startup (non potrà più ricevere investimenti)
    /// @param _id ID della startup da disattivare
    function deactivateStartup(uint256 _id) external onlyOwner {
        if (_id >= startupCount) revert StartupNotFound();
        startups[_id].active = false;

        emit StartupDeactivated(_id);
    }

    /// @notice Restituisce i dati completi di una startup
    /// @param _id ID della startup
    /// @return name        Nome
    /// @return wallet      Indirizzo wallet
    /// @return description Descrizione
    /// @return active      Stato attivo/disattivo
    function getStartup(
        uint256 _id
    )
        external
        view
        returns (
            string memory name,
            address wallet,
            string memory description,
            bool active
        )
    {
        if (_id >= startupCount) revert StartupNotFound();
        Startup storage s = startups[_id];
        return (s.name, s.wallet, s.description, s.active);
    }

    /// @notice Verifica se una startup è attiva
    /// @param _id ID della startup
    /// @return true se la startup è attiva
    function isActive(uint256 _id) external view returns (bool) {
        if (_id >= startupCount) revert StartupNotFound();
        return startups[_id].active;
    }
}

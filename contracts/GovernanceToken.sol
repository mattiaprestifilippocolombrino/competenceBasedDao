// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ============================================================================
//  GovernanceToken.sol — Token di governance per la Competence DAO
// ============================================================================
//
//  COME FUNZIONA:
//  ──────────────
//  1. Chiunque può unirsi alla DAO chiamando joinDAO() e inviando ETH.
//     Riceve token in proporzione: 1 ETH = 1.000 COMP (massimo 100 ETH).
//     Diventa automaticamente Student (coefficiente = 1).
//     Gli ETH vengono automaticamente trasferiti al Treasury della DAO.
//
//  2. I membri possono acquistare token aggiuntivi chiamando mintTokens().
//     I token mintati tengono conto del grado di competenza:
//     TokenMintati = ETH × 1.000 × CoefficienteCompetenza
//     Es: un PhD che invia 1 ETH riceve 1.000 × 4 = 4.000 COMP.
//
//  3. Per aumentare il proprio peso di voto, un membro può richiedere un
//     UPGRADE DI COMPETENZA tramite proposta di governance. I membri votano
//     e, se approvata, il Timelock chiama upgradeCompetence().
//
//  FORMULA TOKEN:
//  ──────────────
//  TokenTotali = TokenBase × CoefficienteCompetenza
//
//  | Grado           | Coefficiente | Es. con 10 ETH depositati  |
//  |─────────────────|──────────────|────────────────────────────|
//  | Student          | 1           | 10.000 COMP                |
//  | Bachelor Degree  | 2           | 20.000 COMP                |
//  | Master Degree    | 3           | 30.000 COMP                |
//  | PhD              | 4           | 40.000 COMP                |
//  | Professor        | 5           | 50.000 COMP                |
//
//  EREDITARIETÀ:
//  - ERC20:       funzionalità base del token (transfer, balanceOf, ecc.)
//  - ERC20Permit: approvazioni off-chain con firma gasless
//  - ERC20Votes:  checkpoint storici e potere di voto delegabile
// ============================================================================

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/utils/Nonces.sol";

/// @title GovernanceToken
/// @notice Token ERC20 con membership aperta e upgrade di competenza via governance
contract GovernanceToken is ERC20, ERC20Permit, ERC20Votes {
    // ======================================================================
    //  Enum — Gradi di competenza (ordinati dal più basso al più alto)
    // ======================================================================

    /// @notice I gradi di competenza. Student è il default per chi entra nella DAO.
    /// @dev L'ordine è crescente: Student(0) → Professor(4).
    ///      Il coefficiente è sempre (uint(grade) + 1), ma lo memorizziamo
    ///      nel mapping competenceScore per chiarezza e flessibilità futura.
    enum CompetenceGrade {
        Student, // Coefficiente 1 — grado di partenza
        BachelorDegree, // Coefficiente 2
        MasterDegree, // Coefficiente 3
        PhD, // Coefficiente 4
        Professor // Coefficiente 5
    }

    // ======================================================================
    //  Costanti
    // ======================================================================

    /// @notice Tasso di conversione: 1 ETH = 1.000 token (con 18 decimali)
    /// @dev msg.value (in wei) × TOKENS_PER_ETH → token amount
    ///      Es: 1 ETH = 1e18 wei × 1000 = 1e21 = 1.000 COMP (con 18 decimali)
    uint256 public constant TOKENS_PER_ETH = 1000;

    /// @notice Deposito massimo per membro: 100 ETH
    uint256 public constant MAX_DEPOSIT = 100 ether;

    // ======================================================================
    //  Variabili di stato
    // ======================================================================

    /// @notice Indirizzo del TimelockController — autorizza gli upgrade di competenza
    address public timelock;

    /// @notice Indirizzo del Treasury — riceve gli ETH dai joinDAO()
    address public treasury;

    /// @notice Indirizzo del deployer — può chiamare setTreasury() una sola volta
    address public immutable deployer;

    /// @notice Coefficiente associato a ogni grado di competenza
    mapping(CompetenceGrade => uint256) public competenceScore;

    /// @notice Token base di ogni membro (quanti token ha ricevuto all'ingresso, PRIMA del moltiplicatore)
    /// @dev Serve per calcolare i token aggiuntivi durante un upgrade:
    ///      tokenAggiuntivi = baseTokens × (nuovoScore - vecchioScore)
    mapping(address => uint256) public baseTokens;

    /// @notice Grado di competenza di ogni membro
    mapping(address => CompetenceGrade) public memberGrade;

    /// @notice Flag: l'indirizzo è un membro registrato della DAO?
    mapping(address => bool) public isMember;

    /// @notice Stringa con la prova di competenza (es. "PhD in AI, Politecnico di Milano, 2024")
    mapping(address => string) public competenceProof;

    // ======================================================================
    //  Eventi
    // ======================================================================

    /// @notice Emesso quando un nuovo membro entra nella DAO
    event MemberJoined(
        address indexed member,
        uint256 ethDeposited,
        uint256 tokensReceived
    );

    /// @notice Emesso quando un membro minta token aggiuntivi
    event TokensMinted(
        address indexed member,
        uint256 ethDeposited,
        uint256 tokensMinted,
        uint256 competenceScore
    );

    /// @notice Emesso quando un membro viene promosso a un grado superiore
    event CompetenceUpgraded(
        address indexed member,
        CompetenceGrade newGrade,
        uint256 additionalTokens,
        string proof
    );

    // ======================================================================
    //  Errori custom
    // ======================================================================

    error OnlyTimelock(); // Solo il Timelock può chiamare questa funzione
    error OnlyDeployer(); // Solo il deployer può chiamare questa funzione
    error AlreadyMember(); // L'indirizzo è già un membro della DAO
    error NotMember(); // L'indirizzo non è un membro della DAO
    error ZeroDeposit(); // Devi inviare almeno un po' di ETH
    error ExceedsMaxDeposit(); // Superato il deposito massimo di 100 ETH
    error CannotDowngrade(); // Non puoi scendere di grado
    error ZeroAddress(); // Indirizzo non valido
    error TreasuryNotSet(); // Il Treasury non è stato ancora impostato
    error TreasuryAlreadySet(); // Il Treasury è già stato impostato
    error TreasuryTransferFailed(); // Trasferimento ETH al Treasury fallito

    // ======================================================================
    //  Modifier
    // ======================================================================

    /// @notice Solo il TimelockController può chiamare questa funzione
    modifier onlyTimelock() {
        if (msg.sender != timelock) revert OnlyTimelock();
        _;
    }

    /// @notice Solo il deployer può chiamare questa funzione
    modifier onlyDeployer() {
        if (msg.sender != deployer) revert OnlyDeployer();
        _;
    }

    // ======================================================================
    //  Constructor
    // ======================================================================

    /// @notice Crea il token e imposta la tabella dei coefficienti di competenza
    /// @param _timelock Indirizzo del TimelockController
    constructor(
        address _timelock
    ) ERC20("CompetenceDAO Token", "COMP") ERC20Permit("CompetenceDAO Token") {
        if (_timelock == address(0)) revert ZeroAddress();
        timelock = _timelock;
        deployer = msg.sender;

        // ── Tabella coefficienti ──
        competenceScore[CompetenceGrade.Student] = 1;
        competenceScore[CompetenceGrade.BachelorDegree] = 2;
        competenceScore[CompetenceGrade.MasterDegree] = 3;
        competenceScore[CompetenceGrade.PhD] = 4;
        competenceScore[CompetenceGrade.Professor] = 5;
    }

    // ======================================================================
    //  Funzione di setup — Impostazione Treasury (one-shot)
    // ======================================================================

    /// @notice Imposta l'indirizzo del Treasury. Può essere chiamata una sola volta dal deployer.
    /// @param _treasury Indirizzo del contratto Treasury
    /// @dev Necessaria perché il Treasury viene deployato dopo il GovernanceToken.
    ///      Una volta impostato, non può essere modificato (pattern one-shot).
    function setTreasury(address _treasury) external onlyDeployer {
        if (treasury != address(0)) revert TreasuryAlreadySet();
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
    }

    // ======================================================================
    //  Funzione pubblica — Ingresso nella DAO
    // ======================================================================

    /// @notice Entra nella DAO inviando ETH. Ricevi COMP in proporzione (1 ETH = 1.000 COMP).
    /// @dev Chiunque può chiamare questa funzione. Il membro parte come Student (coefficiente 1).
    ///      Il deposito massimo è 100 ETH (= 100.000 COMP base).
    ///      Gli ETH vengono automaticamente trasferiti al Treasury della DAO.
    function joinDAO() external payable {
        if (treasury == address(0)) revert TreasuryNotSet();
        if (isMember[msg.sender]) revert AlreadyMember();
        if (msg.value == 0) revert ZeroDeposit();
        if (msg.value > MAX_DEPOSIT) revert ExceedsMaxDeposit();

        // 1 ETH (1e18 wei) × 1000 = 1.000 token (1e21 con 18 decimali)
        uint256 tokenAmount = msg.value * TOKENS_PER_ETH;

        // Registra il membro come Student
        isMember[msg.sender] = true;
        memberGrade[msg.sender] = CompetenceGrade.Student;
        baseTokens[msg.sender] = tokenAmount;

        _mint(msg.sender, tokenAmount);

        // Trasferisci gli ETH al Treasury
        (bool success, ) = treasury.call{value: msg.value}("");
        if (!success) revert TreasuryTransferFailed();

        emit MemberJoined(msg.sender, msg.value, tokenAmount);
    }

    // ======================================================================
    //  Funzione pubblica — Mint aggiuntivo di token
    // ======================================================================

    /// @notice Minta token aggiuntivi inviando ETH. I token tengono conto del grado di competenza.
    /// @dev Solo i membri possono chiamare questa funzione.
    ///      Formula: tokenMintati = ETH × 1.000 × coefficienteCompetenza
    ///      I baseTokens vengono aggiornati per i futuri calcoli di upgrade.
    ///      Gli ETH vengono trasferiti al Treasury.
    ///
    ///      ESEMPIO: Un PhD (coeff 4) invia 2 ETH:
    ///      - Nuovi baseTokens: 2.000
    ///      - Token mintati:    2.000 × 4 = 8.000 COMP
    function mintTokens() external payable {
        if (!isMember[msg.sender]) revert NotMember();
        if (msg.value == 0) revert ZeroDeposit();
        if (treasury == address(0)) revert TreasuryNotSet();

        // Calcola i token base aggiuntivi (senza moltiplicatore)
        uint256 newBaseTokens = msg.value * TOKENS_PER_ETH;

        // Applica il moltiplicatore di competenza
        uint256 score = competenceScore[memberGrade[msg.sender]];
        uint256 tokensToMint = newBaseTokens * score;

        // Aggiorna i token base (per futuri upgrade)
        baseTokens[msg.sender] += newBaseTokens;

        _mint(msg.sender, tokensToMint);

        // Trasferisci gli ETH al Treasury
        (bool success, ) = treasury.call{value: msg.value}("");
        if (!success) revert TreasuryTransferFailed();

        emit TokensMinted(msg.sender, msg.value, tokensToMint, score);
    }

    // ======================================================================
    //  Funzione governance — Upgrade di competenza
    // ======================================================================

    /// @notice Promuove un membro a un grado superiore, mintando token aggiuntivi.
    /// @param _member   Indirizzo del membro da promuovere
    /// @param _newGrade Nuovo grado di competenza (deve essere superiore al corrente)
    /// @param _proof    Stringa con la prova di competenza
    /// @dev SOLO il Timelock può chiamare questa funzione (dopo approvazione governance).
    ///
    ///      FORMULA:
    ///      tokenAggiuntivi = baseTokens × (nuovoCoeff - vecchioCoeff)
    ///
    ///      ESEMPIO: Un membro con 10.000 COMP base (Student, coeff 1) viene promosso
    ///               a PhD (coeff 4). Token aggiuntivi = 10.000 × (4 - 1) = 30.000.
    ///               Totale: 10.000 + 30.000 = 40.000 COMP.
    function upgradeCompetence(
        address _member,
        CompetenceGrade _newGrade,
        string calldata _proof
    ) external onlyTimelock {
        if (!isMember[_member]) revert NotMember();

        uint256 newScore = competenceScore[_newGrade];
        uint256 oldScore = competenceScore[memberGrade[_member]];
        if (newScore <= oldScore) revert CannotDowngrade();

        // Calcola i token aggiuntivi: base × (nuovoScore - vecchioScore)
        uint256 additionalTokens = baseTokens[_member] * (newScore - oldScore);

        // Aggiorna il grado e la prova di competenza
        memberGrade[_member] = _newGrade;
        competenceProof[_member] = _proof;

        // Minta i token aggiuntivi
        _mint(_member, additionalTokens);
        emit CompetenceUpgraded(_member, _newGrade, additionalTokens, _proof);
    }

    // ======================================================================
    //  Funzioni di lettura
    // ======================================================================

    /// @notice Restituisce il grado di competenza di un membro
    function getMemberGrade(
        address _member
    ) external view returns (CompetenceGrade) {
        return memberGrade[_member];
    }

    // ======================================================================
    //  Override richiesti per risolvere conflitti di ereditarietà
    // ======================================================================

    /// @dev Aggiorna i checkpoint di voto dopo ogni trasferimento di token
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        super._update(from, to, amount);
    }

    /// @dev Risolve il conflitto di nonces tra ERC20Permit e Nonces
    function nonces(
        address owner
    ) public view virtual override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}

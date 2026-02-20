// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ============================================================================
//  MockStartup.sol — Startup fittizia per test e demo
// ============================================================================
//
//  COSA FA QUESTO CONTRATTO:
//  -------------------------
//  Simula una startup che riceve investimenti dalla DAO.
//  In un caso reale, la startup sarebbe un wallet esterno (EOA) o un
//  contratto vero. Qui usiamo un contratto "mock" (fittizio) per poter:
//
//  - Verificare nei TEST che i fondi siano arrivati
//  - Registrare automaticamente ogni investimento ricevuto
//  - Avere una demo pulita e dimostrabile
//
//  NOTA DIDATTICA:
//  ---------------
//  "Mock" = oggetto finto usato nei test per simulare un componente reale.
//  In un contesto di produzione, questo contratto non servirebbe.
// ============================================================================

/// @title MockStartup
/// @notice Contratto fittizio che simula una startup ricevente investimenti
contract MockStartup {
    // ── Variabili di stato ──

    /// @notice Totale ETH ricevuti da questo contratto
    uint256 public totalReceived;

    /// @notice Numero di investimenti ricevuti
    uint256 public investmentCount;

    // ── Eventi ──

    /// @notice Emesso ogni volta che il contratto riceve ETH
    /// @param from   Chi ha inviato i fondi (tipicamente il Treasury via Timelock)
    /// @param amount Importo in wei
    event FundsReceived(address indexed from, uint256 amount);

    // ── Funzione receive ──

    /// @notice Permette al contratto di ricevere ETH e registra l'investimento
    /// @dev Viene chiamata automaticamente quando qualcuno invia ETH al contratto
    receive() external payable {
        // Aggiorna il contatore e il totale
        totalReceived += msg.value;
        investmentCount++;

        emit FundsReceived(msg.sender, msg.value);
    }

    /// @notice Restituisce il saldo ETH attuale del contratto
    /// @return Saldo in wei
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}

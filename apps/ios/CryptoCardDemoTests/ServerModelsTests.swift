import XCTest
@testable import CryptoCardDemo

final class ServerModelsTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: Data(json.utf8))
    }

    func testTopUpWireFormatDecodesWithExactIntegerStrings() throws {
        let json = """
        {"top_up":{"id":"6f1c0f54-8a71-4f3b-9d4e-2b1a6a0c9d11","status":"confirming","failure_reason":null,"card_id":"6f1c0f54-8a71-4f3b-9d4e-2b1a6a0c9d12",
        "chain_id":84532,"network_name":"Base Sepolia","asset":"USDC","asset_name":"USDC (Base Sepolia test token)",
        "token_address":"0x036CbD53842c5426634e7929541eC2318f3dCF7e","token_decimals":6,
        "sender_address":"0x1111111111111111111111111111111111111111","recipient_address":"0x2222222222222222222222222222222222222222",
        "amount_cents":"2550","token_units":"25500000","card_amount_cents":"2550","minimum_card_amount_cents":"2550","service_fee_cents":"0",
        "network_fee_note":"Paid in test ETH.","simulated":false,"transaction_hash":"0xabababababababababababababababababababababababababababababababab",
        "confirmations":2,"required_confirmations":5,"created_at":"2026-10-09T12:00:00.000Z","quote_expires_at":"2026-10-09T12:10:00.000Z",
        "submit_deadline":"2026-10-09T13:10:00.000Z","updated_at":"2026-10-09T12:01:00.000Z","credited_at":null,
        "explorer_url":"https://sepolia.basescan.org/tx/0xab"}}
        """
        let topUp = try decode(TopUpEnvelope.self, json).topUp
        XCTAssertEqual(topUp.status, .confirming)
        XCTAssertTrue(topUp.status.isActive)
        XCTAssertFalse(topUp.status.isFinal)
        XCTAssertEqual(topUp.tokenUnits, "25500000")
        XCTAssertEqual(topUp.requiredConfirmations, 5)
        XCTAssertNotNil(topUp.quoteExpiry)
        XCTAssertNil(topUp.failureText)
        let accepted = try decode(WalletTransactionRequest.self, #"{"chain_id":84532,"from":"0x1","to":"0x2","value":"0x0","data":"0xa9059cbb"}"#)
        XCTAssertEqual(accepted.chainId, 84532)
    }

    func testTokenAmountsFormatWithoutFloatingPoint() {
        let digits = { (value: String) in value.filter(\.isNumber) }
        XCTAssertEqual(digits(TokenAmount.formatted("25500000", decimals: 6)), "2550")
        XCTAssertEqual(digits(TokenAmount.formatted("1", decimals: 6)), "000")
        XCTAssertEqual(digits(TokenAmount.formatted("123456789012345678901234567890", decimals: 6)), "12345678901234567890123456")
        XCTAssertEqual(digits(TokenAmount.formatted("1000000000000000", decimals: 18, maxFraction: 5)), "000100")
        XCTAssertEqual(TokenAmount.formatted("-5", decimals: 6), "—")
        XCTAssertEqual(TokenAmount.formatted("1.5", decimals: 6), "—")
    }

    func testCredentialsAndHistoryStatesAreDistinct() throws {
        let details = TestCredentials(pan: "9999123456781234", expiryMonth: 3, expiryYear: 2029, cvv: "123", expiresAt: "2026-10-09T12:01:00.000Z")
        XCTAssertEqual(details.groupedNumber, "9999 1234 5678 1234")
        XCTAssertEqual(details.expiry, "03/29")
        XCTAssertTrue(details.isDemonstration)
        let issued = try decode(TestCredentials.self, #"{"pan":"4004123456780646","expiry_month":5,"expiry_year":2028,"cvv":"321","expires_at":"2026-10-09T12:01:00.000Z","demonstration":false}"#)
        XCTAssertFalse(issued.isDemonstration)
        let items = try decode(HistoryResponse.self, """
        {"items":[{"id":"a","kind":"authorization","status":"held","current_status":"completed","amount_cents":"2500","currency":"USD","title":"Store · Pending",
        "occurred_at":"2026-10-09T12:00:00.000Z","parent_id":null,"merchant":"Store","network":null,"transaction_hash":null,"demonstration":true},
        {"id":"b","kind":"authorization","status":"held","current_status":"held","amount_cents":"700","currency":"USD","title":"Coffee · Pending",
        "occurred_at":"2026-10-09T12:00:00.000Z","parent_id":null,"merchant":"Coffee","network":null,"transaction_hash":null,"demonstration":true},
        {"id":"c","kind":"refund","status":"credited","current_status":"credited","amount_cents":"100","currency":"USD","title":"Store · Refund",
        "occurred_at":"2026-10-09T12:00:00.000Z","parent_id":"a","merchant":"Store","network":null,"transaction_hash":null,"demonstration":true}],"next_cursor":null}
        """).items
        XCTAssertFalse(items[0].isOpenHold)
        XCTAssertEqual(items[0].statusLabel, String(localized: "Completed"))
        XCTAssertTrue(items[1].isOpenHold)
        XCTAssertTrue(items[1].signedAmount.hasPrefix("−"))
        XCTAssertTrue(items[2].signedAmount.hasPrefix("+"))
        XCTAssertEqual(items[2].parentId, "a")
    }
}

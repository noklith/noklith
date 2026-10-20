import XCTest
@testable import CryptoCardDemo

@MainActor final class TopUpFlowTests: XCTestCase {
    private struct FakeAuthenticator: DeviceAuthenticating {
        let succeeds: Bool
        func authenticate(reason: String) async throws {
            if !succeeds { throw DeviceAuthenticationError.cancelled }
        }
    }

    func testCancelledDeviceAuthenticationNeverStartsTheTopUp() async throws {
        let store = AppStore(options: LaunchOptions(arguments: []))
        let model = TopUpFlowModel(authenticator: FakeAuthenticator(succeeds: false))
        let terms = try XCTUnwrap(Fixtures.topUp(status: "quoted"))
        model.stage = .terms(terms)
        await model.confirm(store, wallet: nil)
        // Nothing was accepted and the wallet was never asked: the user stays on the same terms.
        XCTAssertEqual(model.stage, .terms(terms))
        XCTAssertFalse(model.walletWasOpened)
        XCTAssertEqual(model.errorMessage,
                       String(localized: "Refill not started. Confirm with Face ID, Touch ID or your device passcode to continue."))
    }

    func testAuthenticationAloneDoesNotSkipTheSignedInWalletRequirement() async throws {
        let store = AppStore(options: LaunchOptions(arguments: []))
        let model = TopUpFlowModel(authenticator: FakeAuthenticator(succeeds: true))
        let terms = try XCTUnwrap(Fixtures.topUp(status: "quoted"))
        model.stage = .terms(terms)
        await model.confirm(store, wallet: nil)
        XCTAssertEqual(model.stage, .terms(terms))
        XCTAssertFalse(model.walletWasOpened)
        XCTAssertEqual(model.errorMessage, WalletTransactionError.wrongAccount.localizedDescription)
    }

    func testAutomaticPauseIsAUserReversibleStateAndAppearsInHistoryWithoutAnAmount() throws {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let card = try decoder.decode(CardResponse.self, from: Data(#"{"card":{"id":"c","status":"frozen_by_risk_rule","currency":"USD","last_four":"1234","available_cents":"100","held_cents":"0","issuer_mode":"demo"}}"#.utf8)).card
        XCTAssertEqual(card?.status, .frozenByRiskRule)
        XCTAssertTrue(card?.status.isUserReversibleFreeze ?? false)
        XCTAssertFalse(CardStatus.blockedByRisk.isUserReversibleFreeze)
        let item = try decoder.decode(Activity.self, from: Data(#"{"id":"e","kind":"card_status","status":"paused","current_status":"paused","amount_cents":"0","currency":"USD","title":"Card paused: several maximum top-ups in a short time","occurred_at":"2026-10-09T12:00:00.000Z","parent_id":null,"merchant":null,"network":null,"transaction_hash":null,"demonstration":true}"#.utf8))
        XCTAssertEqual(item.signedAmount, "")
        XCTAssertEqual(item.statusLabel, String(localized: "Purchases paused"))
        XCTAssertEqual(item.badge.symbol, "exclamationmark.shield.fill")
    }
}

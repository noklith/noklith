import XCTest
@testable import CryptoCardDemo

final class MoneyTests: XCTestCase {
    func testExactCentsAndBoundaries() {
        let locale = Locale(identifier: "en_US")
        XCTAssertEqual(Money.cents(from: "499.99", locale: locale), 49_999)
        XCTAssertEqual(Money.cents(from: "500", locale: locale), 50_000)
        XCTAssertEqual(Money.cents(from: "500.01", locale: locale), 50_001)
        XCTAssertEqual(Money.cents(from: "0.01", locale: locale), 1)
        for value in ["0", "-1", "0.001", "1e2", "NaN", "1,000", "9223372036854775808", "1.2.3"] {
            XCTAssertNil(Money.cents(from: value, locale: locale), value)
        }
        XCTAssertEqual(Money.cents(from: "25,50", locale: Locale(identifier: "de_DE")), 2_550)
    }

    func testContractDecoding() throws {
        let data = Data(#"{"card":{"id":"c1","status":"frozen_by_user","currency":"USD","last_four":"0428","available_cents":"49999","held_cents":"1","issuer_mode":"demo"}}"#.utf8)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let result = try decoder.decode(CardResponse.self, from: data)
        XCTAssertEqual(result.card?.status, .frozenByUser)
        XCTAssertEqual(result.card?.availableCents, "49999")
    }

    @MainActor
    func testPreviewCreditIsExactAndAppliedOnlyOnce() {
        let store = AppStore(options: LaunchOptions(arguments: ["app", "--fixture", "--screen", "card"]))
        XCTAssertTrue(store.applyPreviewTopUp(cents: 49_999, id: "preview-test"))
        XCTAssertEqual(store.card?.availableCents, "74849")
        XCTAssertFalse(store.applyPreviewTopUp(cents: 49_999, id: "preview-test"))
        XCTAssertFalse(store.applyPreviewTopUp(cents: 50_001, id: "too-much"))
        XCTAssertFalse(store.applyPreviewTopUp(cents: 0, id: "zero"))
        XCTAssertEqual(store.activities.filter { $0.id == "preview-test" }.count, 1)
    }

    @MainActor
    func testRiskBlockedFixtureCannotCreditOrUnfreeze() async {
        let store = AppStore(options: LaunchOptions(arguments: ["app", "--fixture", "--screen", "card", "--scenario", "risk"]))
        XCTAssertFalse(store.applyPreviewTopUp(cents: 100, id: "risk"))
        await store.toggleFreeze()
        XCTAssertEqual(store.card?.status, .blockedByRisk)
    }
}

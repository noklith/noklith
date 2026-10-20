import XCTest

final class SmokeTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    private func launch(screen: String, scenario: String = "standard") -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--fixture", "--screen", screen, "--scenario", scenario,
                               "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        // A decorative safe-area banner is not a readiness signal. Wait for the
        // requested screen and its actual content/actions in the accessibility tree.
        XCTAssertTrue(app.descendants(matching: .any)["screen-\(screen)"].firstMatch.waitForExistence(timeout: 10), app.debugDescription)
        switch screen {
        case "welcome": XCTAssertTrue(app.buttons["button-enter-fixture"].waitForExistence(timeout: 5), app.debugDescription)
        case "card": XCTAssertTrue(app.buttons["button-topup"].waitForExistence(timeout: 5), app.debugDescription)
        case "topup": XCTAssertTrue(app.textFields["amount-input"].waitForExistence(timeout: 5), app.debugDescription)
        default: break // History/settings readiness is represented by their List/Form screen root.
        }
        return app
    }

    @MainActor
    func testEveryFixtureScreenLaunches() {
        for screen in ["welcome", "card", "topup", "history", "settings", "wallet"] {
            let app = launch(screen: screen)
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = "fixture-\(screen)"
            attachment.lifetime = .keepAlways
            add(attachment)
            app.terminate()
        }
    }

    @MainActor
    func testWalletFlowIsUnavailableWithoutConfigurationAndCanReturnToCard() {
        let app = launch(screen: "welcome")
        app.buttons["button-open-wallet"].tap()
        XCTAssertTrue(app.staticTexts["wallet-unavailable"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["button-connect-wallet"].exists)
        XCTAssertFalse(app.buttons["button-sign-wallet-message"].exists)
        app.buttons["button-wallet-preview"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["screen-card"].firstMatch.waitForExistence(timeout: 5))
    }

    @MainActor
    func testWelcomeEntersFixtureAndOpensTopUp() {
        let app = launch(screen: "welcome")
        app.buttons["button-enter-fixture"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["screen-card"].firstMatch.waitForExistence(timeout: 5))
        app.buttons["button-topup"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["screen-topup"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["amount-input"].exists)
        XCTAssertTrue(app.buttons["button-preview"].exists)
    }

    @MainActor
    func testUserCanFreezeAndUnfreezeFixtureCard() {
        let app = launch(screen: "card")
        app.buttons["button-freeze"].tap()
        XCTAssertTrue(app.buttons["button-unfreeze"].waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["button-unfreeze"].tap()
        XCTAssertTrue(app.buttons["button-freeze"].waitForExistence(timeout: 5), app.debugDescription)
    }

    @MainActor
    func testCardCanBeTurnedWithoutBlockingActionsOrScrolling() {
        let app = launch(screen: "card")
        let card = app.descendants(matching: .any)["card-face"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 5))
        card.swipeLeft()
        card.swipeRight()
        // Vertical drags still scroll the screen; actions remain reachable after the card settles.
        app.swipeUp()
        app.swipeDown()
        XCTAssertTrue(app.buttons["button-topup"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["button-freeze"].isHittable)
    }

    /// Xcode's built-in audit. Strict checks fail the test: missing elements or descriptions, small hit
    /// regions, wrong traits. Contrast, Dynamic Type and clipping are reported (log lines "AUDIT-REPORT")
    /// for review: on iOS 26 they also fire for content intentionally faded under the floating tab bar and
    /// for system Form styles.
    @MainActor
    func testAccessibilityAuditOnMainScreens() throws {
        let strict: XCUIAccessibilityAuditType = [.elementDetection, .hitRegion, .sufficientElementDescription, .trait]
        let reported: XCUIAccessibilityAuditType = [.contrast, .dynamicType, .textClipped]
        var failures: [String] = []
        for (screen, scenario) in [("welcome", "standard"), ("card", "standard"), ("card", "paused"), ("history", "standard"),
                                   ("settings", "standard"), ("topup", "standard"), ("topup-status", "confirming")] {
            let app = launch(screen: screen, scenario: scenario)
            let describe = { (issue: XCUIAccessibilityAuditIssue) in
                "\(screen)/\(scenario): \(issue.compactDescription) | \(issue.element?.label ?? "-") | \(issue.element?.frame ?? .zero)"
            }
            try app.performAccessibilityAudit(for: strict) { issue in
                // Text recognised inside a decorative image (the petroglyph icons) has no element to fix;
                // it is reported for review, not failed. Every issue tied to an element still fails.
                if issue.auditType == .elementDetection && issue.element == nil { print("AUDIT-REPORT \(describe(issue))") }
                else { failures.append(describe(issue)) }
                return true
            }
            try app.performAccessibilityAudit(for: reported) { issue in print("AUDIT-REPORT \(describe(issue))"); return true }
            app.terminate()
        }
        for failure in failures { print("AUDIT-FAIL \(failure)") }
        XCTAssertTrue(failures.isEmpty, failures.joined(separator: "; "))
    }

    @MainActor
    func testRequiredStatesAreExplained() {
        XCTAssertTrue(launch(screen: "card", scenario: "zero").staticTexts["zero-balance-hint"].waitForExistence(timeout: 5))
        XCTAssertTrue(launch(screen: "card", scenario: "paused").descendants(matching: .any)["rule-pause-notice"].firstMatch.waitForExistence(timeout: 5))
        let expired = launch(screen: "welcome", scenario: "expired")
        XCTAssertTrue(expired.descendants(matching: .any)["welcome-error"].firstMatch.waitForExistence(timeout: 5))
        for scenario in ["wrong_network", "rejected"] {
            XCTAssertTrue(launch(screen: "topup-status", scenario: scenario).descendants(matching: .any)["topup-error"].firstMatch.waitForExistence(timeout: 5))
        }
    }

    @MainActor
    func testRiskBlockCannotBeRemovedByUser() {
        let app = launch(screen: "card", scenario: "risk")
        let unfreeze = app.buttons["button-unfreeze"]
        XCTAssertFalse(unfreeze.exists && unfreeze.isEnabled)
        let topup = app.buttons["button-topup"]
        XCTAssertTrue(topup.exists)
        XCTAssertFalse(topup.isEnabled)
    }

    @MainActor
    func testTopUpStatusesShowHonestStateAndNeverOfferResendAfterSubmission() {
        for state in ["submitted", "confirming", "funding_pending", "credited", "failed", "expired"] {
            let app = launch(screen: "topup-status", scenario: state)
            XCTAssertTrue(app.descendants(matching: .any)["topup-status-\(state)"].firstMatch.waitForExistence(timeout: 5), app.debugDescription)
            XCTAssertFalse(app.buttons["button-confirm-wallet"].exists)
            XCTAssertFalse(app.buttons["button-retry-wallet"].exists)
            // The refresh action sits below the details; a lazy list only creates it once scrolled into view.
            let refresh = app.buttons["button-refresh-topup"]
            if !refresh.exists { app.swipeUp() }
            XCTAssertEqual(refresh.exists, ["submitted", "confirming", "funding_pending"].contains(state), "\(state): \(app.debugDescription)")
            app.terminate()
        }
    }

    @MainActor
    func testEmptyOfflineAndLongFixturesLaunch() {
        for (screen, scenario) in [("history", "empty"), ("card", "offline"),
                                    ("card", "frozen"), ("history", "long")] {
            let app = launch(screen: screen, scenario: scenario)
            app.terminate()
        }
    }
}

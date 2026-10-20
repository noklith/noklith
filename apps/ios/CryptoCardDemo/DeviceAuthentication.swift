import Foundation
import LocalAuthentication

enum DeviceAuthenticationError: LocalizedError, Equatable {
    case unavailable, cancelled, failed

    var errorDescription: String? {
        switch self {
        case .unavailable: String(localized: "Device authentication is unavailable. Set a device passcode to continue.")
        case .cancelled: String(localized: "Authentication was cancelled.")
        case .failed: String(localized: "Authentication was not completed.")
        }
    }
}

/// Face ID / Touch ID with the device passcode as the defined fallback.
@MainActor protocol DeviceAuthenticating {
    func authenticate(reason: String) async throws
}

@MainActor struct DeviceAuthenticator: DeviceAuthenticating {
    func authenticate(reason: String) async throws {
        let context = LAContext()
        var availability: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &availability) else {
            throw DeviceAuthenticationError.unavailable
        }
        do {
            guard try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) else {
                throw DeviceAuthenticationError.failed
            }
        } catch let error as LAError where [.userCancel, .appCancel, .systemCancel].contains(error.code) {
            throw DeviceAuthenticationError.cancelled
        } catch let error as DeviceAuthenticationError {
            throw error
        } catch {
            throw DeviceAuthenticationError.failed
        }
    }
}

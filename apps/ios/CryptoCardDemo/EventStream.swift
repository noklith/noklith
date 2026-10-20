import Foundation
import Observation

/// WebSocket change signals from /v1/events/stream. A signal only means "fetch /v1/events?after=";
/// REST stays the source of truth. While disconnected, the caller falls back to periodic polling.
@MainActor @Observable final class EventStream {
    private(set) var isConnected = false
    @ObservationIgnored private var loop: Task<Void, Never>?
    @ObservationIgnored private var socket: URLSessionWebSocketTask?
    @ObservationIgnored private let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        return URLSession(configuration: configuration)
    }()

    /// Connects and keeps reconnecting with exponential backoff (1 s … 60 s, with jitter) until stopped.
    func start(request: URLRequest, onChange: @escaping @MainActor () async -> Void) {
        stop()
        loop = Task { [weak self] in
            var attempt = 0
            while !Task.isCancelled {
                guard let self else { return }
                let task = session.webSocketTask(with: request)
                task.maximumMessageSize = 4096
                socket = task
                task.resume()
                do {
                    while !Task.isCancelled {
                        let message = try await task.receive()
                        guard case .string(let text) = message, text.utf8.count <= 1024 else { continue }
                        if text.contains("\"ready\"") {
                            isConnected = true
                            attempt = 0
                        }
                        // Both "ready" (catch up after a gap) and "changed" lead to a REST fetch.
                        await onChange()
                    }
                } catch {
                    isConnected = false
                    task.cancel(with: .goingAway, reason: nil)
                    if task.closeCode.rawValue == 4401 { return } // Session ended: polling will surface the expiry.
                }
                attempt += 1
                let delay = min(60, pow(2, Double(min(attempt, 6)))) * Double.random(in: 0.8...1.2)
                do { try await Task.sleep(for: .seconds(delay)) } catch { break }
            }
        }
    }

    /// Called when the app leaves the foreground or the session ends.
    func stop() {
        loop?.cancel()
        loop = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        isConnected = false
    }
}

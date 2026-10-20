import Foundation
import WalletConnectNetworking

struct ReownWebSocketFactory: WebSocketFactory {
    let origin: String

    func create(with url: URL) -> WebSocketConnecting {
        ReownWebSocket(url: url, origin: origin)
    }
}

/// URLSession transport for the pinned Reown WebSocketConnecting protocol.
/// Reown owns reconnect policy; each connection here owns one task and session.
final class ReownWebSocket: WebSocketConnecting {
    private enum TransportError: LocalizedError {
        case invalidRequest, connectionLost, messageRejected

        var errorDescription: String? {
            switch self {
            case .invalidRequest: "The wallet relay request is invalid."
            case .connectionLost: "The wallet relay connection ended. Try connecting again."
            case .messageRejected: "The wallet relay sent an unsupported message."
            }
        }
    }

    private static let maximumMessageBytes = 1_048_576
    private let queue = DispatchQueue(label: "com.example.CryptoCardDemo.wallet-socket")
    private let queueKey = DispatchSpecificKey<Bool>()
    private let origin: String
    private var storedRequest: URLRequest
    private var connected = false
    private var connectCallback: (() -> Void)?
    private var disconnectCallback: ((Error?) -> Void)?
    private var textCallback: ((String) -> Void)?
    private var task: URLSessionWebSocketTask?
    private var session: URLSession?
    private var pendingWrites: [UUID: () -> Void] = [:]

    init(url: URL, origin: String) {
        self.origin = origin
        storedRequest = URLRequest(url: url)
        queue.setSpecific(key: queueKey, value: true)
    }

    deinit {
        task?.cancel(with: .goingAway, reason: nil)
        session?.invalidateAndCancel()
    }

    var isConnected: Bool { synchronized { connected } }

    var request: URLRequest {
        get { synchronized { storedRequest } }
        set { synchronized { storedRequest = newValue } }
    }

    var onConnect: (() -> Void)? {
        get { synchronized { connectCallback } }
        set { synchronized { connectCallback = newValue } }
    }

    var onDisconnect: ((Error?) -> Void)? {
        get { synchronized { disconnectCallback } }
        set { synchronized { disconnectCallback = newValue } }
    }

    var onText: ((String) -> Void)? {
        get { synchronized { textCallback } }
        set { synchronized { textCallback = newValue } }
    }

    func connect() {
        queue.async { [weak self] in
            guard let self, task == nil else { return }
            guard let url = storedRequest.url,
                  let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
                  parts.scheme == "wss", parts.host?.isEmpty == false,
                  parts.user == nil, parts.password == nil, parts.fragment == nil,
                  let originParts = URLComponents(string: origin),
                  originParts.scheme == "https", originParts.host?.isEmpty == false,
                  originParts.user == nil, originParts.password == nil,
                  originParts.query == nil, originParts.fragment == nil,
                  originParts.path.isEmpty else {
                disconnectCallback?(TransportError.invalidRequest)
                return
            }

            var handshake = storedRequest
            handshake.setValue(origin, forHTTPHeaderField: "Origin")
            handshake.httpShouldHandleCookies = false
            handshake.cachePolicy = .reloadIgnoringLocalCacheData
            handshake.timeoutInterval = 20
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpCookieStorage = nil
            configuration.httpShouldSetCookies = false
            configuration.urlCache = nil
            configuration.timeoutIntervalForRequest = 20
            let delegate = ReownWebSocketDelegate(owner: self)
            let newSession = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
            let newTask = newSession.webSocketTask(with: handshake)
            newTask.maximumMessageSize = Self.maximumMessageBytes
            session = newSession
            task = newTask
            newTask.resume()
        }
    }

    func disconnect() {
        queue.async { [weak self] in
            guard let self, let task else { return }
            finish(task, error: nil)
        }
    }

    func write(string: String, completion: (() -> Void)?) {
        queue.async { [weak self] in
            guard let self else { completion?(); return }
            guard connected, let task else { completion?(); return }
            guard string.utf8.count <= Self.maximumMessageBytes, pendingWrites.count < 64 else {
                finish(task, error: TransportError.messageRejected)
                completion?()
                return
            }
            let writeID = UUID()
            pendingWrites[writeID] = completion ?? {}
            task.send(.string(string)) { [weak self, weak task] error in
                guard let self, let task else { return }
                queue.async { [weak self] in
                    guard let self, self.task === task else { return }
                    let callback = pendingWrites.removeValue(forKey: writeID)
                    if error != nil {
                        finish(task, error: TransportError.connectionLost)
                    }
                    // This protocol has no write-error argument. A failed send is
                    // reported through onDisconnect; completion releases the caller.
                    callback?()
                }
            }
        }
    }

    fileprivate func opened(_ task: URLSessionWebSocketTask) {
        queue.async { [weak self] in
            guard let self, self.task === task, !connected else { return }
            connected = true
            connectCallback?()
            receive(task)
        }
    }

    fileprivate func closed(_ task: URLSessionTask, normally: Bool) {
        queue.async { [weak self] in
            guard let self, let active = self.task, active === task else { return }
            finish(active, error: normally ? nil : TransportError.connectionLost)
        }
    }

    private func receive(_ task: URLSessionWebSocketTask) {
        guard self.task === task, connected else { return }
        task.receive { [weak self, weak task] result in
            guard let self, let task else { return }
            queue.async { [weak self] in
                guard let self, self.task === task, connected else { return }
                switch result {
                case .success(.string(let text)):
                    guard text.utf8.count <= Self.maximumMessageBytes else {
                        finish(task, error: TransportError.messageRejected)
                        return
                    }
                    textCallback?(text)
                    receive(task)
                case .success:
                    finish(task, error: TransportError.messageRejected)
                case .failure:
                    finish(task, error: TransportError.connectionLost)
                }
            }
        }
    }

    private func finish(_ task: URLSessionWebSocketTask, error: Error?) {
        guard self.task === task else { return }
        self.task = nil
        connected = false
        let oldSession = session
        session = nil
        let callbacks = Array(pendingWrites.values)
        pendingWrites.removeAll()
        task.cancel(with: .goingAway, reason: nil)
        oldSession?.invalidateAndCancel()
        disconnectCallback?(error)
        for callback in callbacks { callback() }
    }

    private func synchronized<T>(_ operation: () -> T) -> T {
        if DispatchQueue.getSpecific(key: queueKey) == true { return operation() }
        return queue.sync(execute: operation)
    }
}

/// A separate delegate breaks URLSession's strong delegate ownership cycle.
private final class ReownWebSocketDelegate: NSObject, URLSessionWebSocketDelegate {
    private weak var owner: ReownWebSocket?

    init(owner: ReownWebSocket) { self.owner = owner }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didOpenWithProtocol protocol: String?) {
        owner?.opened(webSocketTask)
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        owner?.closed(webSocketTask, normally: closeCode == .normalClosure)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        owner?.closed(task, normally: error == nil)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        // Relay bearer credentials must never follow an HTTP redirect.
        completionHandler(nil)
    }
}

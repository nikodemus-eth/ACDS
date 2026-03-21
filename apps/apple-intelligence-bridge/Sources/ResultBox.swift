import Foundation

/// Thread-safe box for passing results between async Task and synchronous caller.
/// Used by all subsystem wrappers to bridge async Apple framework APIs to sync NIO handlers.
final class ResultBox<T: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var _value: T

    init(_ value: T) { _value = value }

    var value: T {
        get { lock.lock(); defer { lock.unlock() }; return _value }
        set { lock.lock(); defer { lock.unlock() }; _value = newValue }
    }
}

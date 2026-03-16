import Foundation

/// GET /health — Returns bridge health status.
enum HealthEndpoint {
    static func handle() -> (NIOHTTP1.HTTPResponseStatus, Data) {
        let response: [String: Any] = [
            "status": "healthy",
            "platform": "macOS",
            "version": "1.0.0",
            "timestamp": ISO8601DateFormatter().string(from: Date()),
        ]
        let data = try! JSONSerialization.data(withJSONObject: response)
        return (.ok, data)
    }
}

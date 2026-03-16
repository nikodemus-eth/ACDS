import Foundation
import Logging

let logger = Logger(label: "com.acds.apple-intelligence-bridge")

@main
struct BridgeMain {
    static func main() async throws {
        logger.info("Starting Apple Intelligence Bridge on localhost:11435")
        let server = BridgeServer(host: "127.0.0.1", port: 11435)
        try await server.start()
    }
}

import AppKit
import Foundation
import Logging

/// ImagePlaygroundService — A foreground macOS app that provides ImageCreator access.
/// Runs as a headless NSApplication (no dock icon, no windows) with an embedded HTTP server
/// on 127.0.0.1:11436 for image generation requests from the Apple Intelligence bridge.

let logger = Logger(label: "com.acds.image-playground-service")

// Start the HTTP server on a background thread before entering the run loop
DispatchQueue.global(qos: .userInitiated).async {
    let server = ImagePlaygroundServer(host: "127.0.0.1", port: 11436)
    do {
        try server.startSync()
    } catch {
        logger.error("Failed to start server: \(error)")
        exit(1)
    }
}

// Set up as a headless agent app (no dock icon, no menu bar)
let app = NSApplication.shared
app.setActivationPolicy(.accessory) // .accessory = no dock icon
logger.info("ImagePlaygroundService starting as foreground agent on 127.0.0.1:11436")
app.run() // Enters the NSApplication run loop — required for ImageCreator

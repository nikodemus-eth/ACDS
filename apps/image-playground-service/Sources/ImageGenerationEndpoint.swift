import Foundation
import NIOHTTP1
import ImagePlayground
import AppKit

/// POST /generate — Generates an image using Apple's ImageCreator API.
/// Requires foreground NSApplication context (which this service provides).
enum ImageGenerationEndpoint {
    enum GenerationError: Error, LocalizedError {
        case failed(String)
        var errorDescription: String? {
            switch self { case .failed(let msg): return msg }
        }
    }
    struct Request: Codable {
        let prompt: String
        let style: String?
    }

    struct Response: Codable {
        let content: String  // base64 PNG data URI
        let width: Int
        let height: Int
        let style: String
        let durationMs: Int
    }

    static func handle(body: Data?) -> (NIOHTTP1.HTTPResponseStatus, Data) {
        guard let body = body else {
            return (.badRequest, #"{"error":"Request body is required"}"#.data(using: .utf8)!)
        }

        guard let request = try? JSONDecoder().decode(Request.self, from: body) else {
            return (.badRequest, #"{"error":"Invalid request format. Expected: {\"prompt\": \"...\", \"style\": \"animation|illustration|sketch\"}"}"#.data(using: .utf8)!)
        }

        let start = Date()
        let result = generate(prompt: request.prompt, style: request.style)
        let durationMs = Int(Date().timeIntervalSince(start) * 1000)

        switch result {
        case .success(let img):
            let response = Response(
                content: img.dataUri,
                width: img.width,
                height: img.height,
                style: img.style,
                durationMs: durationMs
            )
            let data = try! JSONEncoder().encode(response)
            return (.ok, data)

        case .failure(let error):
            let errorJson = #"{"error":"\#(error)"}"#.data(using: .utf8)!
            return (.internalServerError, errorJson)
        }
    }

    struct GeneratedImage: Sendable {
        let dataUri: String
        let width: Int
        let height: Int
        let style: String
    }

    private static func generate(prompt: String, style: String?) -> Result<GeneratedImage, GenerationError> {
        guard #available(macOS 15.4, *) else {
            return .failure(.failed("ImageCreator requires macOS 15.4+"))
        }

        let semaphore = DispatchSemaphore(value: 0)

        final class Box: @unchecked Sendable {
            private let lock = NSLock()
            private var _value: Result<GeneratedImage, GenerationError>
            init(_ value: Result<GeneratedImage, GenerationError>) { _value = value }
            var value: Result<GeneratedImage, GenerationError> {
                get { lock.lock(); defer { lock.unlock() }; return _value }
                set { lock.lock(); defer { lock.unlock() }; _value = newValue }
            }
        }

        let box = Box(.failure(.failed("Timeout — image generation took too long")))
        let capturedPrompt = prompt
        let capturedStyle = style

        Task { @Sendable in
            do {
                let creator = try await ImageCreator()
                let availableStyles = creator.availableStyles

                let imageStyle: ImagePlaygroundStyle
                if let requested = capturedStyle,
                   let matched = availableStyles.first(where: { $0.id == requested }) {
                    imageStyle = matched
                } else {
                    imageStyle = availableStyles.first(where: { $0.id == "animation" })
                        ?? availableStyles.first
                        ?? .animation
                }

                for try await image in creator.images(
                    for: [.text(capturedPrompt)],
                    style: imageStyle,
                    limit: 1
                ) {
                    let cgImage = image.cgImage
                    let bitmapRep = NSBitmapImageRep(cgImage: cgImage)
                    guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
                        box.value = .failure(.failed("Failed to encode generated image as PNG"))
                        break
                    }

                    let base64 = pngData.base64EncodedString()
                    let dataUri = "data:image/png;base64,\(base64)"
                    box.value = .success(GeneratedImage(
                        dataUri: dataUri,
                        width: cgImage.width,
                        height: cgImage.height,
                        style: imageStyle.id
                    ))
                    break
                }
            } catch {
                box.value = .failure(.failed("\(error)"))
            }
            semaphore.signal()
        }

        _ = semaphore.wait(timeout: .now() + 180)
        return box.value
    }
}

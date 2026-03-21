import Foundation
import CoreGraphics
import AppKit

/// Wraps Apple's ImagePlayground framework for image generation.
/// Uses the real ImageCreator API when available (requires foreground app context).
/// Falls back to CoreGraphics placeholder when running as a background daemon.
/// Methods: image_creator.generate
enum ImageCreatorWrapper {
    struct Output: Sendable {
        let content: String
        let durationMs: Int
    }

    enum BridgeError: Error, LocalizedError, Sendable {
        case generationFailed(String)

        var errorDescription: String? {
            switch self {
            case .generationFailed(let reason):
                return "Image generation failed: \(reason)"
            }
        }
    }

    static func execute(prompt: String, style: String?) -> Result<Output, BridgeError> {
        // Try real ImageCreator first
        let realResult = generateWithImageCreator(prompt: prompt, style: style)

        switch realResult {
        case .success:
            return realResult
        case .failure:
            // Fall back to placeholder only when ImageCreator can't run (background context)
            return generatePlaceholder(prompt: prompt)
        }
    }

    /// Proxy image generation to the ImagePlaygroundService foreground app on port 11436.
    private static func generateWithImageCreator(prompt: String, style: String?) -> Result<Output, BridgeError> {
        let serviceUrl = "http://127.0.0.1:11436/generate"

        // Build request body
        var body: [String: Any] = ["prompt": prompt]
        if let s = style { body["style"] = s }

        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else {
            return .failure(.generationFailed("Could not serialize request"))
        }

        var request = URLRequest(url: URL(string: serviceUrl)!)
        request.httpMethod = "POST"
        request.httpBody = jsonData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 180 // Image generation can be slow

        let semaphore = DispatchSemaphore(value: 0)
        let box = ResultBox<Result<Output, BridgeError>>(.failure(.generationFailed("Timeout")))

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                box.value = .failure(.generationFailed("ImagePlaygroundService unreachable: \(error.localizedDescription)"))
                semaphore.signal()
                return
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                box.value = .failure(.generationFailed("Invalid response from ImagePlaygroundService"))
                semaphore.signal()
                return
            }

            guard let data = data else {
                box.value = .failure(.generationFailed("Empty response from ImagePlaygroundService"))
                semaphore.signal()
                return
            }

            if httpResponse.statusCode == 200 {
                // Parse the response to get the data URI
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let content = json["content"] as? String {
                    let durationMs = json["durationMs"] as? Int ?? 0
                    box.value = .success(Output(content: content, durationMs: durationMs))
                } else {
                    box.value = .failure(.generationFailed("Could not parse ImagePlaygroundService response"))
                }
            } else {
                let errorMsg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
                    ?? "HTTP \(httpResponse.statusCode)"
                box.value = .failure(.generationFailed(errorMsg))
            }
            semaphore.signal()
        }
        task.resume()

        _ = semaphore.wait(timeout: .now() + 180)
        return box.value
    }

    /// Fallback: generate a styled placeholder image with the prompt text overlaid
    private static func generatePlaceholder(prompt: String) -> Result<Output, BridgeError> {
        let width = 512
        let height = 512
        let colorSpace = CGColorSpaceCreateDeviceRGB()

        guard let ctx = CGContext(
            data: nil, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            return .failure(.generationFailed("Could not create graphics context"))
        }

        // Deterministic gradient from prompt hash
        let hash = abs(prompt.hashValue)
        let hue1 = CGFloat(hash % 360) / 360.0
        let hue2 = CGFloat((hash / 360) % 360) / 360.0

        let color1 = NSColor(hue: hue1, saturation: 0.6, brightness: 0.9, alpha: 1.0).cgColor
        let color2 = NSColor(hue: hue2, saturation: 0.5, brightness: 0.7, alpha: 1.0).cgColor

        let gradient = CGGradient(
            colorsSpace: colorSpace,
            colors: [color1, color2] as CFArray,
            locations: [0.0, 1.0]
        )!
        ctx.drawLinearGradient(gradient,
            start: CGPoint(x: 0, y: 0),
            end: CGPoint(x: CGFloat(width), y: CGFloat(height)),
            options: [])

        // Dark overlay for text readability
        ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 0.4))
        let padding: CGFloat = 40
        ctx.fill(CGRect(x: padding, y: CGFloat(height)/2 - 80, width: CGFloat(width) - padding*2, height: 160))

        // Draw prompt text
        let displayText = prompt.count > 80 ? String(prompt.prefix(77)) + "..." : prompt
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 18, weight: .medium),
            .foregroundColor: NSColor.white,
        ]
        let attrString = NSAttributedString(string: displayText, attributes: attrs)
        let line = CTLineCreateWithAttributedString(attrString)
        let textBounds = CTLineGetBoundsWithOptions(line, [])
        ctx.textPosition = CGPoint(x: (CGFloat(width) - textBounds.width) / 2, y: CGFloat(height)/2 - textBounds.height/2)
        CTLineDraw(line, ctx)

        // Label at bottom
        let labelAttrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 12, weight: .light),
            .foregroundColor: NSColor(white: 1.0, alpha: 0.6),
        ]
        let labelString = NSAttributedString(string: "Placeholder — ImagePlayground requires foreground app context", attributes: labelAttrs)
        let labelLine = CTLineCreateWithAttributedString(labelString)
        let labelBounds = CTLineGetBoundsWithOptions(labelLine, [])
        ctx.textPosition = CGPoint(x: (CGFloat(width) - labelBounds.width) / 2, y: 20)
        CTLineDraw(labelLine, ctx)

        guard let cgImage = ctx.makeImage() else {
            return .failure(.generationFailed("Could not create image from context"))
        }

        let bitmapRep = NSBitmapImageRep(cgImage: cgImage)
        guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
            return .failure(.generationFailed("Could not encode PNG"))
        }

        let base64 = pngData.base64EncodedString()
        let dataUri = "data:image/png;base64,\(base64)"
        return .success(Output(content: dataUri, durationMs: 0))
    }
}

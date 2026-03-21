import Foundation
import CoreGraphics
import CoreImage

/// Wraps image generation capability.
/// Since ImagePlayground is not a public API yet, uses Foundation Models to generate
/// a detailed description and CoreGraphics to create a styled placeholder image.
/// Methods: image_creator.generate
enum ImageCreatorWrapper {
    struct Output: Sendable {
        let content: String
        let durationMs: Int
    }

    enum BridgeError: Error, LocalizedError, Sendable {
        case unsupportedPlatform
        case generationFailed(String)

        var errorDescription: String? {
            switch self {
            case .unsupportedPlatform:
                return "Image generation requires macOS 15+"
            case .generationFailed(let reason):
                return "Image generation failed: \(reason)"
            }
        }
    }

    static func execute(prompt: String, style: String?) -> Result<Output, BridgeError> {
        // Step 1: Use Foundation Models to expand the prompt into a rich description
        let systemPrompt = """
        You are an art director. Given an image prompt, write a brief 2-sentence visual description of the scene. \
        Focus on composition, colors, lighting, and mood. Be vivid and specific.
        """

        let fmResult = FoundationModelsWrapper.execute(
            prompt: prompt,
            model: "apple-fm-on-device",
            systemPrompt: systemPrompt,
            maxTokens: 200,
            temperature: 0.8
        )

        // Use FM description for future enhancement; currently using prompt text for placeholder
        _ = fmResult // Acknowledge the result (used for potential future image description enrichment)

        // Step 2: Generate a placeholder image with CoreGraphics
        let width = 512
        let height = 512
        let colorSpace = CGColorSpaceCreateDeviceRGB()

        guard let ctx = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            return .failure(.generationFailed("Could not create graphics context"))
        }

        // Generate deterministic gradient colors from the prompt hash
        let hash = abs(prompt.hashValue)
        let hue1 = CGFloat(hash % 360) / 360.0
        let hue2 = CGFloat((hash / 360) % 360) / 360.0

        let color1 = NSColor(hue: hue1, saturation: 0.6, brightness: 0.9, alpha: 1.0).cgColor
        let color2 = NSColor(hue: hue2, saturation: 0.5, brightness: 0.7, alpha: 1.0).cgColor

        // Draw gradient background
        let gradient = CGGradient(
            colorsSpace: colorSpace,
            colors: [color1, color2] as CFArray,
            locations: [0.0, 1.0]
        )!
        ctx.drawLinearGradient(
            gradient,
            start: CGPoint(x: 0, y: 0),
            end: CGPoint(x: CGFloat(width), y: CGFloat(height)),
            options: []
        )

        // Draw a centered dark overlay for text readability
        ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 0.4))
        let padding: CGFloat = 40
        ctx.fill(CGRect(
            x: padding, y: CGFloat(height) / 2 - 80,
            width: CGFloat(width) - padding * 2, height: 160
        ))

        // Draw prompt text (CoreGraphics text drawing)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 18, weight: .medium),
            .foregroundColor: NSColor.white,
        ]
        let displayText = prompt.count > 80 ? String(prompt.prefix(77)) + "..." : prompt
        let attrString = NSAttributedString(string: displayText, attributes: attrs)
        let line = CTLineCreateWithAttributedString(attrString)
        let textBounds = CTLineGetBoundsWithOptions(line, [])
        let textX = (CGFloat(width) - textBounds.width) / 2
        let textY = CGFloat(height) / 2 - textBounds.height / 2

        ctx.textPosition = CGPoint(x: textX, y: textY)
        CTLineDraw(line, ctx)

        // Draw "AI Generated Placeholder" label at bottom
        let labelAttrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 12, weight: .light),
            .foregroundColor: NSColor(white: 1.0, alpha: 0.6),
        ]
        let labelString = NSAttributedString(string: "AI Generated Placeholder — ImagePlayground API pending", attributes: labelAttrs)
        let labelLine = CTLineCreateWithAttributedString(labelString)
        let labelBounds = CTLineGetBoundsWithOptions(labelLine, [])
        ctx.textPosition = CGPoint(x: (CGFloat(width) - labelBounds.width) / 2, y: 20)
        CTLineDraw(labelLine, ctx)

        // Convert to PNG data
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

import AppKit // Needed for NSColor, NSFont, NSBitmapImageRep

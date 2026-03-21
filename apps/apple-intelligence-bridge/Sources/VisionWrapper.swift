import Foundation
import Vision
import CoreImage

/// Wraps Apple's Vision framework for OCR and image analysis.
/// Methods: vision.ocr, vision.document_extract
enum VisionWrapper {
    struct Output: Sendable {
        let content: String
        let durationMs: Int
    }

    enum BridgeError: Error, LocalizedError, Sendable {
        case unsupportedPlatform
        case invalidImage(String)
        case recognitionFailed(String)

        var errorDescription: String? {
            switch self {
            case .unsupportedPlatform:
                return "Vision framework requires macOS 13+"
            case .invalidImage(let reason):
                return "Invalid image data: \(reason)"
            case .recognitionFailed(let reason):
                return "Vision recognition failed: \(reason)"
            }
        }
    }

    static func execute(method: String, imageData: String) -> Result<Output, BridgeError> {
        let operation = method.split(separator: ".").last.map(String.init) ?? "ocr"

        // Decode base64 image data (strip data URI prefix if present)
        let base64String: String
        if imageData.hasPrefix("data:") {
            // data:image/png;base64,xxxx
            if let commaIndex = imageData.firstIndex(of: ",") {
                base64String = String(imageData[imageData.index(after: commaIndex)...])
            } else {
                return .failure(.invalidImage("Invalid data URI format"))
            }
        } else {
            base64String = imageData
        }

        guard let data = Data(base64Encoded: base64String) else {
            return .failure(.invalidImage("Could not decode base64 data"))
        }

        guard let ciImage = CIImage(data: data) else {
            return .failure(.invalidImage("Could not create image from data"))
        }

        let cgImage: CGImage
        let context = CIContext()
        guard let rendered = context.createCGImage(ciImage, from: ciImage.extent) else {
            return .failure(.invalidImage("Could not render CGImage"))
        }
        cgImage = rendered

        switch operation {
        case "ocr":
            return performOCR(image: cgImage)
        case "document_extract":
            return performDocumentExtract(image: cgImage)
        default:
            return performOCR(image: cgImage)
        }
    }

    private static func performOCR(image: CGImage) -> Result<Output, BridgeError> {
        let semaphore = DispatchSemaphore(value: 0)
        var recognizedTexts: [(String, Float, CGRect)] = []
        var recognitionError: Error?

        let request = VNRecognizeTextRequest { request, error in
            if let error = error {
                recognitionError = error
            } else if let results = request.results as? [VNRecognizedTextObservation] {
                for observation in results {
                    if let topCandidate = observation.topCandidates(1).first {
                        recognizedTexts.append((
                            topCandidate.string,
                            topCandidate.confidence,
                            observation.boundingBox
                        ))
                    }
                }
            }
            semaphore.signal()
        }

        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true

        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return .failure(.recognitionFailed(error.localizedDescription))
        }

        semaphore.wait()

        if let error = recognitionError {
            return .failure(.recognitionFailed(error.localizedDescription))
        }

        let fullText = recognizedTexts.map { $0.0 }.joined(separator: "\n")
        let avgConfidence = recognizedTexts.isEmpty ? 0.0 : Double(recognizedTexts.reduce(0.0) { $0 + $1.1 }) / Double(recognizedTexts.count)

        let regions = recognizedTexts.map { text, confidence, box in
            """
            {"text":"\(text.replacingOccurrences(of: "\"", with: "\\\""))","confidence":\(String(format: "%.3f", confidence)),"boundingBox":{"x":\(String(format: "%.3f", box.origin.x)),"y":\(String(format: "%.3f", box.origin.y)),"width":\(String(format: "%.3f", box.width)),"height":\(String(format: "%.3f", box.height))}}
            """
        }

        let json = """
        {"extractedText":"\(fullText.replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: "\\n"))","confidence":\(String(format: "%.3f", avgConfidence)),"regionCount":\(recognizedTexts.count),"regions":[\(regions.joined(separator: ","))]}
        """

        return .success(Output(content: json, durationMs: 0))
    }

    private static func performDocumentExtract(image: CGImage) -> Result<Output, BridgeError> {
        // Document extraction uses OCR with additional structure
        let ocrResult = performOCR(image: image)
        switch ocrResult {
        case .success(let output):
            // Wrap OCR result as a single-page document
            let json = """
            {"pages":[{"pageNumber":1,"content":\(output.content)}]}
            """
            return .success(Output(content: json, durationMs: output.durationMs))
        case .failure(let error):
            return .failure(error)
        }
    }
}

import Foundation
import SoundAnalysis
import AVFoundation

/// Wraps Apple's SoundAnalysis framework for audio classification.
/// Methods: sound.classify
enum SoundWrapper {
    struct Output: Sendable {
        let content: String
        let durationMs: Int
    }

    enum BridgeError: Error, LocalizedError, Sendable {
        case unsupportedPlatform
        case invalidAudio(String)
        case analysisFailed(String)

        var errorDescription: String? {
            switch self {
            case .unsupportedPlatform:
                return "SoundAnalysis framework requires macOS 10.15+"
            case .invalidAudio(let reason):
                return "Invalid audio data: \(reason)"
            case .analysisFailed(let reason):
                return "Sound analysis failed: \(reason)"
            }
        }
    }

    static func execute(audioData: String) -> Result<Output, BridgeError> {
        // Decode base64 audio data
        let base64String: String
        if audioData.hasPrefix("data:") {
            if let commaIndex = audioData.firstIndex(of: ",") {
                base64String = String(audioData[audioData.index(after: commaIndex)...])
            } else {
                return .failure(.invalidAudio("Invalid data URI format"))
            }
        } else {
            base64String = audioData
        }

        guard let data = Data(base64Encoded: base64String) else {
            return .failure(.invalidAudio("Could not decode base64 audio data"))
        }

        // Write to temp file
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("sound_\(UUID().uuidString).wav")
        defer { try? FileManager.default.removeItem(at: tempURL) }

        do {
            try data.write(to: tempURL)
        } catch {
            return .failure(.invalidAudio("Could not write temp audio file: \(error.localizedDescription)"))
        }

        return classifySound(url: tempURL)
    }

    private static func classifySound(url: URL) -> Result<Output, BridgeError> {
        do {
            let audioFile = try AVAudioFile(forReading: url)
            let analyzer = try SNAudioFileAnalyzer(url: url)

            let request = try SNClassifySoundRequest(classifierIdentifier: .version1)

            let semaphore = DispatchSemaphore(value: 0)
            let observer = SoundObserver { semaphore.signal() }

            try analyzer.add(request, withObserver: observer)
            analyzer.analyze()

            let timeout = DispatchTime.now() + .seconds(30)
            let waitResult = semaphore.wait(timeout: timeout)

            if waitResult == .timedOut {
                return .failure(.analysisFailed("Sound analysis timed out"))
            }

            let events = observer.results.map { result in
                let topClassifications = result.classifications.prefix(5).map { classification in
                    """
                    {"label":"\(classification.identifier)","confidence":\(String(format: "%.3f", classification.confidence))}
                    """
                }
                return """
                {"timeRange":{"start":\(String(format: "%.2f", result.timeRange.start.seconds)),"duration":\(String(format: "%.2f", result.timeRange.duration.seconds))},"classifications":[\(topClassifications.joined(separator: ","))]}
                """
            }

            let durationMs = Int(Double(audioFile.length) / audioFile.fileFormat.sampleRate * 1000)

            let json = """
            {"events":[\(events.joined(separator: ","))],"durationMs":\(durationMs),"eventCount":\(observer.results.count)}
            """

            return .success(Output(content: json, durationMs: durationMs))
        } catch {
            return .failure(.analysisFailed(error.localizedDescription))
        }
    }
}

/// Observer that collects sound classification results.
private final class SoundObserver: NSObject, SNResultsObserving, @unchecked Sendable {
    private let lock = NSLock()
    private var _results: [SNClassificationResult] = []
    private let onComplete: () -> Void

    init(onComplete: @escaping () -> Void) {
        self.onComplete = onComplete
    }

    var results: [SNClassificationResult] {
        lock.lock()
        defer { lock.unlock() }
        return _results
    }

    func request(_ request: SNRequest, didProduce result: SNResult) {
        if let classificationResult = result as? SNClassificationResult {
            lock.lock()
            _results.append(classificationResult)
            lock.unlock()
        }
    }

    func request(_ request: SNRequest, didFailWithError error: Error) {
        onComplete()
    }

    func requestDidComplete(_ request: SNRequest) {
        onComplete()
    }
}

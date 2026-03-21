import Foundation
import Speech
import AVFoundation

/// Wraps Apple's Speech framework for audio transcription.
/// Methods: speech.transcribe_file, speech.transcribe_longform, speech.transcribe_live, speech.dictation_fallback
enum SpeechWrapper {
    struct Output: Sendable {
        let content: String
        let durationMs: Int
    }

    enum BridgeError: Error, LocalizedError, Sendable {
        case unsupportedPlatform
        case authorizationDenied
        case invalidAudio(String)
        case transcriptionFailed(String)

        var errorDescription: String? {
            switch self {
            case .unsupportedPlatform:
                return "Speech framework requires macOS 10.15+"
            case .authorizationDenied:
                return "Speech recognition authorization denied — grant permission in System Settings > Privacy > Speech Recognition"
            case .invalidAudio(let reason):
                return "Invalid audio data: \(reason)"
            case .transcriptionFailed(let reason):
                return "Transcription failed: \(reason)"
            }
        }
    }

    static func execute(method: String, audioData: String, language: String?) -> Result<Output, BridgeError> {
        let operation = method.split(separator: ".").last.map(String.init) ?? "transcribe_file"

        // For live and dictation_fallback, we can't stream audio over HTTP.
        // Use Foundation Models to describe what the user would say.
        if operation == "transcribe_live" || operation == "dictation_fallback" {
            return simulateWithFoundationModels(text: audioData, operation: operation)
        }

        // For file-based transcription, decode the base64 audio
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
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("speech_\(UUID().uuidString).wav")
        defer { try? FileManager.default.removeItem(at: tempURL) }

        do {
            try data.write(to: tempURL)
        } catch {
            return .failure(.invalidAudio("Could not write temp audio file: \(error.localizedDescription)"))
        }

        return transcribeFile(url: tempURL, language: language)
    }

    private static func transcribeFile(url: URL, language: String?) -> Result<Output, BridgeError> {
        let locale = Locale(identifier: language ?? "en-US")
        guard let recognizer = SFSpeechRecognizer(locale: locale) else {
            return .failure(.transcriptionFailed("Could not create recognizer for locale: \(locale.identifier)"))
        }

        guard recognizer.isAvailable else {
            return .failure(.transcriptionFailed("Speech recognizer is not available on this device"))
        }

        let semaphore = DispatchSemaphore(value: 0)
        var transcriptResult: Result<Output, BridgeError> = .failure(.transcriptionFailed("Timeout"))

        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = false

        recognizer.recognitionTask(with: request) { result, error in
            if let error = error {
                transcriptResult = .failure(.transcriptionFailed(error.localizedDescription))
                semaphore.signal()
                return
            }

            guard let result = result, result.isFinal else { return }

            let transcript = result.bestTranscription
            let segments = transcript.segments.map { seg in
                """
                {"text":"\(seg.substring.replacingOccurrences(of: "\"", with: "\\\""))","timestamp":\(String(format: "%.2f", seg.timestamp)),"duration":\(String(format: "%.2f", seg.duration)),"confidence":\(String(format: "%.3f", seg.confidence))}
                """
            }

            let avgConfidence = transcript.segments.isEmpty ? 0.0 :
                Double(transcript.segments.reduce(0.0) { $0 + $1.confidence }) / Double(transcript.segments.count)

            let json = """
            {"transcript":"\(transcript.formattedString.replacingOccurrences(of: "\"", with: "\\\""))","segments":[\(segments.joined(separator: ","))],"language":"\(locale.identifier)","confidence":\(String(format: "%.3f", avgConfidence))}
            """

            transcriptResult = .success(Output(content: json, durationMs: 0))
            semaphore.signal()
        }

        let timeout = DispatchTime.now() + .seconds(60)
        let waitResult = semaphore.wait(timeout: timeout)

        if waitResult == .timedOut {
            return .failure(.transcriptionFailed("Transcription timed out after 60 seconds"))
        }

        return transcriptResult
    }

    /// For live/dictation methods: use Foundation Models to generate a mock transcription response
    private static func simulateWithFoundationModels(text: String, operation: String) -> Result<Output, BridgeError> {
        let systemPrompt = "You are a speech transcription system. The user will describe audio content. Return a plausible transcription of what was said. Be concise and natural."
        let fmResult = FoundationModelsWrapper.execute(
            prompt: text,
            model: "apple-fm-on-device",
            systemPrompt: systemPrompt,
            maxTokens: nil,
            temperature: nil
        )

        switch fmResult {
        case .success(let output):
            let json = """
            {"transcript":"\(output.text.replacingOccurrences(of: "\"", with: "\\\""))","segments":[],"language":"en-US","confidence":0.85,"note":"Simulated via Foundation Models (\(operation) requires live audio stream)"}
            """
            return .success(Output(content: json, durationMs: 0))
        case .failure(let error):
            return .failure(.transcriptionFailed("Foundation Models fallback failed: \(error.localizedDescription)"))
        }
    }
}

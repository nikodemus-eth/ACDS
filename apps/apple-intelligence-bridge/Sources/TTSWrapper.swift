import Foundation
import AVFoundation

/// Wraps AVSpeechSynthesizer for text-to-speech capabilities.
/// Methods: tts.speak, tts.render_audio
enum TTSWrapper {
    struct Output: Sendable {
        let content: String
        let durationMs: Int
    }

    enum BridgeError: Error, LocalizedError, Sendable {
        case unsupportedPlatform
        case synthesisError(String)

        var errorDescription: String? {
            switch self {
            case .unsupportedPlatform:
                return "AVSpeechSynthesizer requires macOS 10.15+"
            case .synthesisError(let reason):
                return "TTS synthesis failed: \(reason)"
            }
        }
    }

    /// Execute a TTS operation.
    /// - method: "speak" returns status JSON, "render_audio" returns base64 audio data URI
    static func execute(
        method: String,
        text: String,
        voice: String?,
        rate: Double?
    ) -> Result<Output, BridgeError> {
        let operation = method.split(separator: ".").last.map(String.init) ?? "speak"

        let synthesizer = AVSpeechSynthesizer()
        let utterance = AVSpeechUtterance(string: text)

        if let voiceId = voice, let selectedVoice = AVSpeechSynthesisVoice(identifier: voiceId) {
            utterance.voice = selectedVoice
        } else {
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        }

        if let r = rate {
            utterance.rate = Float(max(0.0, min(1.0, r)))
        }

        if operation == "render_audio" {
            return renderAudio(synthesizer: synthesizer, utterance: utterance, text: text)
        } else {
            return speak(synthesizer: synthesizer, utterance: utterance, text: text)
        }
    }

    private static func speak(synthesizer: AVSpeechSynthesizer, utterance: AVSpeechUtterance, text: String) -> Result<Output, BridgeError> {
        let semaphore = DispatchSemaphore(value: 0)
        let delegate = TTSDelegate { semaphore.signal() }

        synthesizer.delegate = delegate
        synthesizer.speak(utterance)

        let timeout = DispatchTime.now() + .seconds(30)
        let result = semaphore.wait(timeout: timeout)

        if result == .timedOut {
            synthesizer.stopSpeaking(at: .immediate)
            return .failure(.synthesisError("Speech synthesis timed out"))
        }

        let estimatedDuration = Int(Double(text.count) / 15.0 * 1000) // ~15 chars/sec estimate
        let json = """
        {"status":"completed","text":"\(text.prefix(100).replacingOccurrences(of: "\"", with: "\\\""))","durationMs":\(estimatedDuration)}
        """
        return .success(Output(content: json, durationMs: estimatedDuration))
    }

    private static func renderAudio(synthesizer: AVSpeechSynthesizer, utterance: AVSpeechUtterance, text: String) -> Result<Output, BridgeError> {
        let semaphore = DispatchSemaphore(value: 0)
        var audioBuffers: [AVAudioBuffer] = []
        var outputFormat: AVAudioFormat?

        synthesizer.write(utterance) { buffer in
            if let pcmBuffer = buffer as? AVAudioPCMBuffer, pcmBuffer.frameLength > 0 {
                audioBuffers.append(pcmBuffer)
                outputFormat = pcmBuffer.format
            } else {
                // Empty buffer signals completion
                semaphore.signal()
            }
        }

        let timeout = DispatchTime.now() + .seconds(30)
        let result = semaphore.wait(timeout: timeout)

        if result == .timedOut {
            return .failure(.synthesisError("Audio rendering timed out"))
        }

        guard !audioBuffers.isEmpty, let format = outputFormat else {
            return .failure(.synthesisError("No audio data produced"))
        }

        // Combine PCM buffers into WAV data
        let totalFrames = audioBuffers.reduce(0) { $0 + Int(($1 as! AVAudioPCMBuffer).frameLength) }
        guard let combinedBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(totalFrames)) else {
            return .failure(.synthesisError("Failed to create combined buffer"))
        }

        var offset: AVAudioFrameCount = 0
        for buf in audioBuffers {
            let pcm = buf as! AVAudioPCMBuffer
            let frames = pcm.frameLength
            if let src = pcm.floatChannelData, let dst = combinedBuffer.floatChannelData {
                for ch in 0..<Int(format.channelCount) {
                    dst[ch].advanced(by: Int(offset)).update(from: src[ch], count: Int(frames))
                }
            }
            offset += frames
        }
        combinedBuffer.frameLength = AVAudioFrameCount(totalFrames)

        // Write to WAV file in temp dir
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("tts_\(UUID().uuidString).wav")
        defer { try? FileManager.default.removeItem(at: tempURL) }

        do {
            let audioFile = try AVAudioFile(forWriting: tempURL, settings: format.settings)
            try audioFile.write(from: combinedBuffer)
        } catch {
            return .failure(.synthesisError("Failed to write WAV: \(error.localizedDescription)"))
        }

        // Read WAV and encode as base64 data URI
        guard let wavData = try? Data(contentsOf: tempURL) else {
            return .failure(.synthesisError("Failed to read WAV file"))
        }

        let base64 = wavData.base64EncodedString()
        let dataUri = "data:audio/wav;base64,\(base64)"
        let durationMs = Int(Double(totalFrames) / format.sampleRate * 1000)

        return .success(Output(content: dataUri, durationMs: durationMs))
    }
}

/// Delegate to detect when speech finishes.
private final class TTSDelegate: NSObject, AVSpeechSynthesizerDelegate, @unchecked Sendable {
    private let onFinish: () -> Void

    init(onFinish: @escaping () -> Void) {
        self.onFinish = onFinish
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        onFinish()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        onFinish()
    }
}

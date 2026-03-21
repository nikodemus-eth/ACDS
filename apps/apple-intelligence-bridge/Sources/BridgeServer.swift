import Foundation
import NIOCore
import NIOPosix
import NIOHTTP1
import Logging

/// Lightweight HTTP server that bridges ACDS dispatch requests to Apple's Foundation Models framework.
/// Binds exclusively to loopback (127.0.0.1) — never exposed to the network.
final class BridgeServer: Sendable {
    private let host: String
    private let port: Int
    private let logger = Logger(label: "com.acds.bridge-server")

    init(host: String = "127.0.0.1", port: Int = 11435) {
        self.host = host
        self.port = port
    }

    func start() async throws {
        let group = MultiThreadedEventLoopGroup(numberOfThreads: System.coreCount)

        let bootstrap = ServerBootstrap(group: group)
            .serverChannelOption(.backlog, value: 256)
            .childChannelInitializer { channel in
                channel.pipeline.configureHTTPServerPipeline().flatMap {
                    channel.pipeline.addHandler(BridgeHTTPHandler())
                }
            }
            .childChannelOption(.maxMessagesPerRead, value: 1)

        let channel = try await bootstrap.bind(host: host, port: port).get()
        logger.info("Bridge listening on \(host):\(port)")
        try await channel.closeFuture.get()
        try await group.shutdownGracefully()
    }
}

/// HTTP request handler that routes to endpoint handlers.
final class BridgeHTTPHandler: ChannelInboundHandler, @unchecked Sendable {
    typealias InboundIn = HTTPServerRequestPart
    typealias OutboundOut = HTTPServerResponsePart

    private var requestHead: HTTPRequestHead?
    private var bodyBuffer: ByteBuffer?

    func channelRead(context: ChannelHandlerContext, data: NIOAny) {
        let part = unwrapInboundIn(data)

        switch part {
        case .head(let head):
            requestHead = head
            bodyBuffer = context.channel.allocator.buffer(capacity: 0)
        case .body(var body):
            bodyBuffer?.writeBuffer(&body)
        case .end:
            guard let head = requestHead else { return }
            let body = bodyBuffer
            handleRequest(context: context, head: head, body: body)
            requestHead = nil
            bodyBuffer = nil
        }
    }

    private func handleRequest(context: ChannelHandlerContext, head: HTTPRequestHead, body: ByteBuffer?) {
        // Handle CORS preflight
        if head.method == .OPTIONS {
            var headers = HTTPHeaders()
            headers.add(name: "Access-Control-Allow-Origin", value: "*")
            headers.add(name: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS")
            headers.add(name: "Access-Control-Allow-Headers", value: "Content-Type")
            headers.add(name: "Content-Length", value: "0")
            let responseHead = HTTPResponseHead(version: head.version, status: .noContent, headers: headers)
            context.write(wrapOutboundOut(.head(responseHead)), promise: nil)
            context.writeAndFlush(wrapOutboundOut(.end(nil)), promise: nil)
            return
        }

        let (status, responseBody): (HTTPResponseStatus, Data)

        switch (head.method, head.uri) {
        case (.GET, "/health"):
            (status, responseBody) = HealthEndpoint.handle()
        case (.GET, "/capabilities"):
            (status, responseBody) = CapabilitiesEndpoint.handle()
        case (.POST, "/execute"):
            let bodyData: Data? = body.flatMap { buf -> Data? in
                var mutable = buf
                return mutable.readBytes(length: mutable.readableBytes).map { Data($0) }
            }
            (status, responseBody) = ExecuteEndpoint.handle(body: bodyData)
        case (.GET, "/translation/languages"):
            (status, responseBody) = TranslationLanguagesEndpoint.handle()
        default:
            status = .notFound
            responseBody = #"{"error":"Not Found"}"#.data(using: .utf8)!
        }

        var headers = HTTPHeaders()
        headers.add(name: "Content-Type", value: "application/json")
        headers.add(name: "Content-Length", value: "\(responseBody.count)")
        headers.add(name: "Access-Control-Allow-Origin", value: "*")

        let responseHead = HTTPResponseHead(version: head.version, status: status, headers: headers)
        context.write(wrapOutboundOut(.head(responseHead)), promise: nil)

        var buffer = context.channel.allocator.buffer(capacity: responseBody.count)
        buffer.writeBytes(responseBody)
        context.write(wrapOutboundOut(.body(.byteBuffer(buffer))), promise: nil)
        context.writeAndFlush(wrapOutboundOut(.end(nil)), promise: nil)
    }
}

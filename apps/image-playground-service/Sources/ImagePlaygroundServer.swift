import Foundation
import NIOCore
import NIOPosix
import NIOHTTP1
import Logging

/// Lightweight HTTP server for image generation requests.
final class ImagePlaygroundServer: Sendable {
    private let host: String
    private let port: Int
    private let logger = Logger(label: "com.acds.image-playground-server")

    init(host: String = "127.0.0.1", port: Int = 11436) {
        self.host = host
        self.port = port
    }

    func startSync() throws {
        let group = MultiThreadedEventLoopGroup(numberOfThreads: 2)

        let bootstrap = ServerBootstrap(group: group)
            .serverChannelOption(.backlog, value: 64)
            .childChannelInitializer { channel in
                channel.pipeline.configureHTTPServerPipeline().flatMap {
                    channel.pipeline.addHandler(ImagePlaygroundHTTPHandler())
                }
            }
            .childChannelOption(.maxMessagesPerRead, value: 1)

        let channel = try bootstrap.bind(host: host, port: port).wait()
        logger.info("ImagePlaygroundService listening on \(host):\(port)")
        try channel.closeFuture.wait()
        try group.syncShutdownGracefully()
    }
}

/// HTTP handler that routes to image generation.
final class ImagePlaygroundHTTPHandler: ChannelInboundHandler, @unchecked Sendable {
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
            let json = #"{"status":"healthy","service":"image-playground","version":"1.0.0"}"#
            (status, responseBody) = (.ok, json.data(using: .utf8)!)

        case (.POST, "/generate"):
            let bodyData: Data? = body.flatMap { buf -> Data? in
                var mutable = buf
                return mutable.readBytes(length: mutable.readableBytes).map { Data($0) }
            }
            (status, responseBody) = ImageGenerationEndpoint.handle(body: bodyData)

        default:
            (status, responseBody) = (.notFound, #"{"error":"Not Found"}"#.data(using: .utf8)!)
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

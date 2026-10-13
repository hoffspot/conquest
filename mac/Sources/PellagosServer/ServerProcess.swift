// The server, run by the app: the bundle's own Node (Contents/Helpers/node) running
// Contents/Resources/app/server/world.js --app, its data where the server keeps it when run from
// Terminal. It says how it stands on lines of its own ("@pellagos " then JSON: server/world.js);
// everything it says goes to its log. Stopped with SIGTERM, it saves every world and leaves; and
// it's given a pipe, so that it stops too if the app's gone.

import AppKit
import Foundation

/// How the server says it stands (server/world.js --app).
struct Standing: Decodable, Equatable {
    var state: String
    var players: Int
    var worlds: Int
    var awake: Bool
    var page: String
    var play: String
    var version: String
}

/// The server's process, and how it stands. Changed on the main thread alone.
final class ServerProcess: ObservableObject {
    static let shared = ServerProcess()

    /// What its lines for the app begin with.
    static let saying = "@pellagos "

    /// How long it's given to save every world and leave, once asked, before it's ended.
    static let patience: TimeInterval = 60

    @Published private(set) var standing: Standing?
    @Published private(set) var running = false
    @Published private(set) var stopping = false
    @Published private(set) var problem: String?

    private var process: Process?
    private var input: Pipe?
    private var heardSoFar = Data()
    private var log: FileHandle?
    private var asked = false
    private var whenStopped: [() -> Void] = []

    private var contents: URL { Bundle.main.bundleURL.appendingPathComponent("Contents") }

    /// Where its log goes: the server's own logs folder (server/platform/darwin.js).
    var logURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs")
            .appendingPathComponent(Bundle.main.bundleIdentifier ?? "io.github.hoffspot.pellagos-server")
            .appendingPathComponent("server.log")
    }

    var version: String {
        standing?.version ?? (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")
    }

    /// The menu bar's dot (an SF Symbol's name).
    var symbol: String {
        guard running, let standing else {
            return running ? "ellipsis.circle" : "circle"
        }

        if standing.state != "running" {
            return "ellipsis.circle"
        }

        return standing.players > 0 ? "circle.fill" : "moon.circle"
    }

    /// How it stands, in words.
    var summary: String {
        guard running else {
            return "Stopped"
        }

        guard let standing else {
            return "Starting…"
        }

        if standing.state != "running" {
            return "Saving every world and stopping…"
        }

        if standing.players == 0 {
            return "Running, nobody in: the Mac may sleep"
        }

        let players = standing.players == 1 ? "1 player" : "\(standing.players) players"
        let worlds = standing.worlds == 1 ? "1 world" : "\(standing.worlds) worlds"

        return "\(players) in \(worlds)" + (standing.awake ? ", the Mac kept awake" : "")
    }

    func start() {
        guard process == nil else {
            return
        }

        let app = contents.appendingPathComponent("Resources/app")
        let process = Process()
        let input = Pipe()
        let output = Pipe()

        process.executableURL = contents.appendingPathComponent("Helpers/node")
        process.arguments = [app.appendingPathComponent("server/world.js").path, "--app"]
        process.currentDirectoryURL = app
        process.standardInput = input
        process.standardOutput = output
        process.standardError = output

        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData

            if data.isEmpty {
                handle.readabilityHandler = nil
            }

            DispatchQueue.main.async {
                self?.heard(data)
            }
        }

        process.terminationHandler = { [weak self] ended in
            let code = ended.terminationStatus

            DispatchQueue.main.async {
                self?.ended(code)
            }
        }

        openLog()

        do {
            try process.run()
        } catch {
            problem = "The server couldn't start: \(error.localizedDescription)"
            return
        }

        self.process = process
        self.input = input
        heardSoFar = Data()
        standing = nil
        running = true
        stopping = false
        asked = false
        problem = nil
    }

    /// Asks it to save every world and stop (SIGTERM); `then` once it has.
    func stop(then: (() -> Void)? = nil) {
        if let then {
            whenStopped.append(then)
        }

        guard let process else {
            finished()
            return
        }

        guard !stopping else {
            return
        }

        stopping = true
        asked = true
        process.terminate()

        // (Still there long after: ended, so that quitting can't hang)
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.patience) { [weak self] in
            if let still = self?.process, still === process {
                kill(process.processIdentifier, SIGKILL)
            }
        }
    }

    func openPage() {
        if let page = standing?.page, let url = URL(string: page) {
            NSWorkspace.shared.open(url)
        }
    }

    // (What it said: kept in the log, and its lines for the app read)
    private func heard(_ data: Data) {
        try? log?.write(contentsOf: data)
        heardSoFar.append(data)

        while let end = heardSoFar.firstIndex(of: 0x0A) {
            let line = String(decoding: heardSoFar[heardSoFar.startIndex..<end], as: UTF8.self)

            heardSoFar.removeSubrange(heardSoFar.startIndex...end)

            if line.hasPrefix(Self.saying) {
                let json = Data(String(line.dropFirst(Self.saying.count)).utf8)

                if let told = try? JSONDecoder().decode(Standing.self, from: json) {
                    standing = told
                }
            }
        }
    }

    private func ended(_ code: Int32) {
        // (Stopped on the management page leaves 0 too: only a stop no one asked for is a problem)
        if !asked && code != 0 {
            problem = "The server stopped (exit code \(code)): its log is \(logURL.path)"
        }

        process = nil
        input = nil
        standing = nil
        running = false
        stopping = false
        finished()
    }

    private func finished() {
        try? log?.close()
        log = nil

        let waiting = whenStopped

        whenStopped = []
        waiting.forEach { $0() }
    }

    private func openLog() {
        let manager = FileManager.default

        try? manager.createDirectory(at: logURL.deletingLastPathComponent(), withIntermediateDirectories: true)

        if !manager.fileExists(atPath: logURL.path) {
            manager.createFile(atPath: logURL.path, contents: nil)
        }

        log = try? FileHandle(forWritingTo: logURL)
        _ = try? log?.seekToEnd()
        try? log?.write(contentsOf: Data("\n--- Started by the app, \(Date())\n".utf8))
    }
}

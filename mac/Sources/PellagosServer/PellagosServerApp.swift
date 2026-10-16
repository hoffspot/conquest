// The menu-bar app (generated/world_server_plan.md §11, Phase 2): a dot in the menu bar saying how
// the server stands (stopped, running with nobody in so the Mac may sleep, or players in), and its
// menu: open the management page, start or stop, run at login, uninstall (Uninstall.swift), and
// quit (every world saved first).
// The server itself is the one run from Terminal, run by this app (ServerProcess.swift).

import AppKit
import SwiftUI

@main
struct PellagosServerApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @ObservedObject private var server = ServerProcess.shared
    @ObservedObject private var login = LoginItem.shared

    var body: some Scene {
        MenuBarExtra {
            ServerMenu(server: server, login: login)
        } label: {
            Image(systemName: server.symbol)
                .accessibilityLabel(server.summary)
        }
    }
}

/// The menu: how it stands, then what can be done.
struct ServerMenu: View {
    @ObservedObject var server: ServerProcess
    @ObservedObject var login: LoginItem

    var body: some View {
        Text(server.summary)

        if let problem = server.problem {
            Text(problem)
        }

        Divider()

        Button("Open the management page") {
            server.openPage()
        }
        .disabled(server.standing == nil)

        Button(server.running ? "Stop" : "Start") {
            if server.running {
                server.stop()
            } else {
                server.start()
            }
        }
        .disabled(server.stopping)

        Toggle("Run at login", isOn: Binding(get: { login.on }, set: { login.set($0) }))

        if let problem = login.problem {
            Text(problem)
        }

        Divider()

        Text("Pellagos Server \(server.version)")

        Button("Uninstall…") {
            Uninstall.ask()
        }

        Button("Quit (every world saved first)") {
            NSApp.terminate(nil)
        }
        .keyboardShortcut("q")
    }
}

/// Starts the server when the app starts (unless the app's running already), and saves every world before quitting.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        let me = ProcessInfo.processInfo.processIdentifier
        let others = NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "")
            .filter { $0.processIdentifier != me }

        // (Already running, opened again or started at login: the menu bar has the one there is)
        if !others.isEmpty {
            exit(0)
        }

        LoginItem.shared.refresh()
        ServerProcess.shared.start()
    }

    // (Quit, logging out and shutting down alike: the server saves every world and stops, then the app goes)
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        let server = ServerProcess.shared

        guard server.running else {
            return .terminateNow
        }

        server.stop {
            sender.reply(toApplicationShouldTerminate: true)
        }

        return .terminateLater
    }
}

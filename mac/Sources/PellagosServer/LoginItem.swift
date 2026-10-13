// Run at login (generated/world_server_plan.md §11): the app registered as a launch agent from
// inside its own bundle with SMAppService, never a plist written from a download (launchd no longer
// loads one carrying the quarantine attribute). The agent's plist is the bundle's
// Contents/Library/LaunchAgents/<id>.plist (scripts/build-mac-app.js writes it): ProcessType
// Interactive, so launchd doesn't throttle it, and KeepAlive, so that it's started again if it
// fails, but not after Quit.

import Foundation
import ServiceManagement

/// Whether the app runs at login. Changed on the main thread alone.
final class LoginItem: ObservableObject {
    static let shared = LoginItem()

    /// The agent's plist in the bundle (scripts/build-mac-app.js: AGENT_PLIST).
    static let plist = "io.github.hoffspot.pellagos-server.plist"

    @Published private(set) var on = false
    @Published private(set) var problem: String?

    private let service = SMAppService.agent(plistName: LoginItem.plist)

    func refresh() {
        switch service.status {
        case .enabled:
            on = true
        case .requiresApproval:
            on = true
            problem = "Allow it in System Settings › General › Login Items"
        default:
            on = false
        }
    }

    func set(_ wanted: Bool) {
        problem = nil

        do {
            if wanted {
                try service.register()
            } else {
                try service.unregister()
            }
        } catch {
            problem = "Run at login: \(error.localizedDescription)"
        }

        if service.status == .requiresApproval {
            SMAppService.openSystemSettingsLoginItems()
        }

        refresh()
    }
}

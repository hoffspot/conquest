// Uninstall… (docs/MAC_APP.md, "Taking it off"): asks whether every world's to be saved to an
// archive first (in the Documents folder: any Pellagos server restores it, Settings › Archive),
// then runs the installer the bundle carries (Contents/Resources/install-mac.sh --uninstall,
// scripts/build-mac-app.js puts it there) on its own: it stops the server (every world saved),
// makes the archive, and takes everything the app keeps off this Mac, the app itself last. The
// installer says how it went in a dialog of its own, once the app's gone.

import AppKit
import Foundation

/// Asked from the menu, on the main thread, as AppKit's alerts are.
@MainActor
enum Uninstall {
    /// The question asked, and the installer run as it's answered.
    static func ask() {
        let alert = NSAlert()

        alert.messageText = "Uninstall Pellagos Server?"
        alert.informativeText = "This takes everything it keeps off this Mac: the app, its login item, its worlds and settings, its logs and its Keychain entries.\n\nSave every world to an archive in your Documents folder first, and any Pellagos server can restore them (Settings › Archive): its players come straight back in."
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Save Worlds and Uninstall")
        alert.addButton(withTitle: "Uninstall Without Saving")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)

        switch alert.runModal() {
        case .alertFirstButtonReturn:
            run(archive: true)
        case .alertSecondButtonReturn:
            let sure = NSAlert()

            sure.messageText = "Uninstall without saving?"
            sure.informativeText = "Every world on this server will be gone for good."
            sure.alertStyle = .critical
            sure.addButton(withTitle: "Uninstall Without Saving")
            sure.addButton(withTitle: "Cancel")

            if sure.runModal() == .alertFirstButtonReturn {
                run(archive: false)
            }
        default:
            return
        }
    }

    /// The bundle's installer run with --uninstall, on its own: it outlives the app, which it stops.
    static func run(archive: Bool) {
        let bundle = Bundle.main.bundleURL
        let process = Process()

        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [
            bundle.appendingPathComponent("Contents/Resources/install-mac.sh").path,
            "--uninstall",
            "--to", bundle.deletingLastPathComponent().path,
            "--from-app",
            archive ? "--archive" : "--no-archive",
        ]
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
        } catch {
            let failed = NSAlert()

            failed.messageText = "Pellagos Server couldn't be uninstalled"
            failed.informativeText = error.localizedDescription
            _ = failed.runModal()
        }
    }
}

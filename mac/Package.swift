// swift-tools-version:5.9
// The menu-bar app, "Pellagos Server" (generated/world_server_plan.md §11, Phase 2; docs/MAC_APP.md).
// Built on a Mac by the macOS workflow (.github/workflows/mac.yml), and put in its bundle with Node
// and the server by scripts/build-mac-app.js:
//
//     swift build -c release --arch arm64 --package-path mac
//
// macOS 13 or later (MenuBarExtra, SMAppService); arm64 alone, as macOS 27 runs nothing else.

import PackageDescription

let package = Package(
    name: "PellagosServer",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "PellagosServer", path: "Sources/PellagosServer"),
    ]
)

// The app's item in the menu bar, for the macOS workflow (.github/workflows/mac.yml): finds the
// window at the status bar's level that the process given (its pid) owns, says where it is, and
// fails if there's none. Where windows are needs no permission, as a screenshot of them does.
// With "click", it then clicks the item, so that a screenshot can show its menu (a best effort:
// posting a click needs the Accessibility permission).
//
//     swiftc -O mac/ci/status-item.swift -o status-item && ./status-item <pid> [click]

import CoreGraphics
import Foundation

let arguments = CommandLine.arguments

guard arguments.count >= 2, let pid = Int32(arguments[1]) else {
    print("usage: status-item <pid> [click]")
    exit(2)
}

let windows = (CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]]) ?? []
let level = Int(CGWindowLevelForKey(.statusWindow))
let mine = windows.filter { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid }

for window in mine {
    print("A window of \(pid): layer \(window[kCGWindowLayer as String] ?? "?"), bounds \(window[kCGWindowBounds as String] ?? "?")")
}

guard let item = mine.first(where: { ($0[kCGWindowLayer as String] as? NSNumber)?.intValue == level }),
      let bounds = item[kCGWindowBounds as String] as? NSDictionary,
      let rect = CGRect(dictionaryRepresentation: bounds) else {
    print("No item in the menu bar for \(pid)")
    exit(1)
}

print("Its item in the menu bar: \(rect)")

if arguments.count > 2, arguments[2] == "click" {
    let point = CGPoint(x: rect.midX, y: rect.midY)

    for type in [CGEventType.leftMouseDown, .leftMouseUp] {
        CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
        usleep(100_000)
    }
}

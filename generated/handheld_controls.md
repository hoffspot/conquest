# Handheld gaming PCs: built-in controls as a web page sees them

Research notes for giving a browser-based Three.js/WebGL game (Chrome, Edge or Firefox, or an installed PWA) convenience control presets for each handheld. Compiled 4 November 2026.

**How to read the confidence labels**

- **Confirmed**: a primary source states it (spec sheet, vendor manual, kernel/Chromium/Firefox/SDL source, a bug report showing the actual string).
- **Inferred**: follows directly from browser or driver source code, but no source shows the exact string or behaviour on that device.
- **Unconfirmed**: no adequate source was found; test on hardware before relying on it.

Sources are numbered `[S#]` and listed with URLs at the end. The Verge, Ars Technica, IGN and Digital Foundry could not be fetched by the research tools, so reviews from Tom's Hardware, Notebookcheck, PC Gamer, Windows Central and others were used instead.

---

## 1. Summary for a game developer

1. **Every device's built-in pad arrives as an Xbox-style pad.** In normal use (Windows in gamepad mode, or SteamOS with Steam Input), Chrome and Edge report `mapping: "standard"`, 17 buttons (0–16) and 4 axes. The face buttons are labelled A/B/X/Y in Xbox positions. Each one, with its standard index, is: A=0, B=1, X=2, Y=3. [S1][S3][S5][S27][S51][S38][S61]
2. **Back buttons, trackpads and gyro do not reach the page** as gamepad inputs on any device in normal use. Steam Deck L4/R4/L5/R5, Legion Y1–Y3/M1–M3, Ally M1/M2 and Claw M1/M2 are invisible unless the vendor software remaps them onto a standard button or onto a keyboard key or mouse button. **The practical preset strategy:** publish keyboard bindings for "back-button actions" and tell players to point their back buttons at those keys in Steam Input, Armoury Crate SE, Legion Space or MSI Center M. [S3][S5][S14][S53][S73][S66]
3. There is one exception. On SteamOS/Linux, when the Steam client is **not running**, Chrome has a dedicated Steam Deck mapping that adds Quick Access (17), the trackpad clicks (18, 19) and L4, R4, L5, R5 (20–23). This is rare in practice, because Steam is always running in Game Mode. [S5][S14]
4. **You can't reliably tell which handheld it is from `Gamepad.id` on Windows.** Current Chrome/Edge uses Windows.Gaming.Input. It reports `"Xbox 360 Controller (XInput STANDARD GAMEPAD)"` for XInput devices it knows. It reports `"<display name> (STANDARD GAMEPAD)"` with **no vendor/product ID** for ones it doesn't, and that includes the Legion, Claw and Ally X built-in pads. Firefox on Windows reports every XInput pad as `"xinput"`. On Linux, ids carry the VID:PID: Chrome as `"<name> (STANDARD GAMEPAD Vendor: vvvv Product: pppp)"`, Firefox as `"vvvv-pppp-<name>"`. [S3][S2][S9][S10]
5. **Under Steam Input, every device looks the same**: Valve's virtual pad, 28de:11ff, named `"Microsoft X-Box 360 pad N"` on Linux. Firefox on a Steam Deck shows `"28de-11ff-Microsoft X-Box 360 pad 0"`. [S23][S33]
6. **Detect a handheld from a combination of signals:** VID:PID in the id where present, the physical screen resolution (1280×800, 1920×1080, 1920×1200, 2560×1600), touch support and a connected gamepad. The User-Agent string carries no device model on desktop. Let the player confirm or override the detected preset. [S13]

---

## 2. General facts that apply to every preset

### 2.1 The Standard Gamepad layout (W3C), with handheld labels

| Index | W3C location [S1] | Label on these handhelds |
|---|---|---|
| buttons[0] | Right cluster, bottom | A |
| buttons[1] | Right cluster, right | B |
| buttons[2] | Right cluster, left | X |
| buttons[3] | Right cluster, top | Y |
| buttons[4] / [5] | Top left / top right front | LB / RB (bumpers) |
| buttons[6] / [7] | Bottom left / bottom right front | LT / RT (analog triggers; `value` 0–1) |
| buttons[8] / [9] | Centre cluster left / right | View / Menu |
| buttons[10] / [11] | Left / right stick pressed | L3 / R3 |
| buttons[12]–[15] | Left cluster up / down / left / right | D-pad |
| buttons[16] | Centre button | Guide: Steam, Xbox or Legion L. **Usually swallowed by the OS or vendor software; don't bind it** |
| axes[0] / [1] | Left stick X / Y | Left stick (Y is negative when pushed up) |
| axes[2] / [3] | Right stick X / Y | Right stick |

- The spec leaves extra inputs beyond the standard set "exposed in their raw form" at the next free indices. Chrome uses indices ≥17 only for a few known devices: Steam Deck raw, Xbox Elite paddles via WGI, Switch Joy-Con SL/SR. [S1][S3][S5]
- `navigator.getGamepads()` returns nothing until a **gamepad user gesture**: a button press or a stick moved past a threshold while the page has focus. Prompt "press any button". [S1]
- `Gamepad.id` has no specified format. The spec recommends vendor/product identification, but there's no `vendorId` field. [S1][S11]
- The `"gamepad"` Permissions-Policy feature defaults to `*`. It matters only if the game runs in a cross-origin iframe. [S1]
- **Haptics:** Chrome exposes `"dual-rumble"` for XInput/WGI pads. `"trigger-rumble"` is enabled only for Xbox One-family IDs in Chromium's list, and no handheld's built-in pad is on it. So a page probably can't drive the ROG Xbox Ally X / X20 "impulse triggers" (Inferred). [S3][S6][S55]
- **Gyro:** the W3C Gamepad API has no motion data. None of these IMUs reach a page through `getGamepads()`. On some Windows devices the IMU is a Windows system sensor; SDL finds the ROG Ally's as "Sensor BMI320 Gyr". Whether Chrome's Generic Sensor `Gyroscope` API can read it is Unconfirmed. [S1][S24]
- **Trackpads/touchpads** reach the page as an ordinary mouse pointer, when the vendor or Steam maps them that way, not as gamepad data. A trackpad-driven camera therefore needs mouse-delta input, via the Pointer Lock API, alongside the right stick. Valve's Deck recommendations ask games to accept mouse-style and joystick camera input together. [S32][S45]

### 2.2 `Gamepad.id` and `mapping` by browser and platform

| Browser / platform | How the id is built | `mapping` | Sources |
|---|---|---|---|
| Chrome/Edge, Windows (current: Windows.Gaming.Input fetcher; the GameInput fetcher is behind a default-off flag) | VID:PID **in Chromium's list and XInput-type** (e.g. 045e:028e, 28de:11ff): `Xbox 360 Controller (XInput STANDARD GAMEPAD)`. **In the list but not XInput:** `<name> (STANDARD GAMEPAD Vendor: vvvv Product: pppp)`. **Not in the list** (all Legion Go, Go S, Go 2, Claw and Ally X-family pads): `<WGI DisplayName> (STANDARD GAMEPAD)`, **with no VID/PID**. The DisplayName text for each handheld is **Unconfirmed**. | Always `"standard"` for WGI pads | [S3][S4][S6][S8] |
| Chrome/Edge, Windows, DirectInput-mode pads (Legion "D-input", Claw "DInput") | RawInput fetcher: `<product> (Vendor: vvvv Product: pppp)`, without "STANDARD GAMEPAD" because Chromium has no Windows mapping for these IDs (Inferred) | `""` (raw button order) | [S2][S11] |
| Chrome, Linux / SteamOS | `<name> (STANDARD GAMEPAD Vendor: vvvv Product: pppp)` when a mapper applies. Mappers apply to IDs in Chromium's table, known XInput IDs, **and any pad driven by the kernel `xpad` driver**. `<name>` is "USB manufacturer + product" when the evdev VID:PID match the USB parent, otherwise the evdev name. | `"standard"` if a mapper applies, else `""` | [S2][S5][S7] |
| Firefox, Linux | `vvvv-pppp-<evdev name>`. Any evdev pad with `BTN_GAMEPAD` is treated as standard; extra keys are appended from index 17 in key-code order. | `"standard"` | [S9][S12] |
| Firefox, Windows | XInput pads: the literal `xinput`. HID pads: `vvvv-pppp-<name>`. | `"standard"` for XInput | [S10][S11] |
| Flatpak browsers on SteamOS | Need read access to `/run/udev`, or no pad appears. Edge: Microsoft's guide adds `flatpak --user override --filesystem=/run/udev:ro com.microsoft.Edge`. Chrome: the same override for `com.google.Chrome`; the Flathub manifest grants `--device=all` but not `/run/udev`. Firefox Flatpak: fixed in Firefox 158. | n/a | [S33][S34][S35][S36] |

An installed **PWA** runs on the same engine as its browser, so it sees exactly the same gamepads. On SteamOS, the PWA's launcher must itself be added to Steam as a non-Steam game to get Steam Input (Inferred).

### 2.3 Vendor keyboard/mouse emulation (how a back button can send a key the game already handles)

| Software (device) | Can map extra buttons to | Notes | Sources |
|---|---|---|---|
| **Steam Input** (Steam Deck; SteamOS editions of Legion Go S and Legion Go 2; any handheld with the browser launched through Steam) | Gamepad buttons, keyboard keys, mouse buttons and movement, per button, for grips, trackpads, gyro and sticks | Applies per Steam shortcut. Desktop Mode uses the "Desktop Configuration" (keyboard/mouse) unless the app is launched with a gamepad layout. "Gyro To Mouse" is available. | [S31][S32][S33][S34] |
| **Armoury Crate SE** (ROG Ally, Ally X, Xbox Ally, Xbox Ally X) | Gamepad, Action (Windows actions), Keyboard, Numpad, Mouse | M1/M2 default to **secondary-function modifiers**: untick "Set as Secondary Function" to use them alone. Control mode starts on **Auto, which switches by app**. Desktop mode: right stick = cursor, RB = left click, RT = right click, A = Enter, B = Esc. The Command Center and Armoury Crate buttons can't be remapped. Per-game profiles are supported. | [S53] |
| **Legion Space** (Legion Go, Go S, Go 2 on Windows) | Controller buttons, mouse buttons, keyboard keys, key combinations (Controller → Button Mapping → Edit), for gamepad and FPS layouts | Feature announced by Lenovo in April 2024. Mappings are stored in controller firmware and persist across operating systems. M1 can't be remapped by the Linux tool that uses the same firmware interface. | [S49][S48] |
| **MSI Center M** (Claw) | Gamepad, Keyboard (up to 5 keys), Number keys, Mouse, Windows hotkeys, Macro (record up to 32 keys) for M1/M2 | Firmware modes: XInput, DInput, Desktop. **The original Claw firmware couldn't remap M1/M2**, so update it. The key list includes letters, Shift, Space, Tab and F1–F12 (F13–F22 aren't listed). | [S66][S19] |
| **GPD WinControls** (GPD Win 4 / Win Mini) | Each back button L4/R4 takes up to 4 keycodes (keys or mouse buttons) | Linux equivalent: pyWinControls | [S68] |
| **AYASpace** (AYANEO) | LC/RC, rear buttons, Home and Menu mapped to controller, keyboard or mouse functions | Software quality criticised in reviews | [S69][S70] |

**Recommendation:** pick ordinary keys the game already binds (letters, Shift, Space, Tab, F1–F12). Vendor UIs don't reliably offer F13–F24 (Inferred from MSI's firmware key list [S19]).

### 2.4 How a page can tell it's on a handheld

| Signal | What it gives | Limits | Sources |
|---|---|---|---|
| `Gamepad.id` VID:PID (Linux) | 28de:1205 = Deck (raw). 28de:11ff = Steam Input virtual pad (any controller under Steam). 17ef:6182/6184/6185 = Legion Go. 17ef:61eb–61ee = Legion Go 2. 1a86:e310/e311 = Legion Go S. 0db0:1901–1903 = MSI Claw. 0b05:1b4c = Ally X / Xbox Ally family. 045e:028e = original ROG Ally or GPD, but also any real Xbox 360 pad. | Windows ids often carry no VID/PID (section 2.2) | [S15][S16][S21][S59] |
| Physical resolution = `screen.width × devicePixelRatio` | 1280×800: Steam Deck. 1920×1080: Ally family, Claw A1M/7 AI+, Zotac Zone. 1920×1200: Legion Go S/Go 2, Claw 8 AI+/A8/8 EX. 2560×1600: Legion Go (2023). | Laptops and tablets share these sizes. CSS pixels depend on OS scaling. | Specs in section 3 |
| Touch: `navigator.maxTouchPoints > 0`, `matchMedia('(any-pointer: coarse)')` | Every device listed has a 10-point touchscreen (Steam Deck: touch, point count not stated) | Also true on 2-in-1 laptops | [S27][S38][S51][S61] |
| User-Agent / UA-CH | Only `Windows NT 10.0; Win64; x64` or `X11; Linux x86_64` | **No device model on desktop**. SteamOS isn't identifiable from Chrome's UA. | [S13] |

**Suggested logic:** gamepad VID:PID match → choose that preset. Otherwise, a touchscreen plus a gamepad plus a resolution in the list → offer a "Handheld (Xbox layout)" preset and let the player pick the exact device.

---

## 3. Devices

### 3.1 Valve Steam Deck (LCD 2022, OLED 2023)

Status: the LCD was discontinued in December 2025 and sold out by February 2026, so Valve now sells the OLED only. OLED prices rose to $789 (512 GB) and $949 (1 TB) on 27 May 2026. [S37][S29]

| Item | Detail | Confidence / source |
|---|---|---|
| Screen | **LCD**: 7" IPS, 1280×800, 60 Hz, touch. **OLED**: 7.4" HDR OLED, 1280×800, up to 90 Hz, touch. Under Steam, "by default the touchscreen treats touch events as a mouse click at that position", so a page may get mouse events rather than multi-touch. Touch pass-through is a per-configuration Steam Input option. | Confirmed [S28][S27][S29][S30] |
| Sticks / D-pad / face | 2 full-size sticks with capacitive touch (clickable). D-pad. A B X Y in Xbox positions. | Confirmed [S27] |
| Bumpers / triggers | L & R bumpers. L & R **analog** triggers. | Confirmed [S27] |
| Menu / View | View and Menu buttons | Confirmed [S27] |
| Extra | **4 assignable grip buttons (L4, R4 upper; L5, R5 lower)**. **Steam** button. **Quick Access (…)** button. 2 × 32.5 mm square **trackpads**, haptic and pressure-sensitive click. 6-axis IMU (gyro). | Confirmed [S27][S29][S14] |
| USB ID, raw controller | 28de:1205. Current kernel `hid-steam` evdev name "Steam Deck". USB product "Steam Deck Controller" (LCD) or "Steam Controller" (OLED, per SDL test data, "possibly pre-production"). | Confirmed [S15][S14][S23] |
| Steam Input virtual pad | Linux: 28de:11ff, evdev name `Microsoft X-Box 360 pad 0` (the number increments). Windows: Steam uses a VID:PID other than Microsoft's 045e:028e (SDL commit). Steamworks defines 28DE/11FF for the virtual DirectInput pad, and SDL's DB has Windows rows for 28de:11ff and 28de:11fc. | Confirmed [S22][S23][S25][S31][S26] |
| **Gamepad.id, Game Mode (Steam Input)** | Firefox: `28de-11ff-Microsoft X-Box 360 pad 0`. Chrome: `Microsoft X-Box 360 pad 0 (STANDARD GAMEPAD Vendor: 28de Product: 11ff)`. | Firefox Confirmed [S33]. Chrome Inferred [S2][S6][S7] |
| Gamepad.id, Steam not running | Chrome: likely `Valve Software Steam Deck Controller (STANDARD GAMEPAD Vendor: 28de Product: 1205)` on the LCD, or `Valve Software Steam Controller (...)` on the OLED. Firefox: `28de-1205-Steam Deck` on current kernels; SDL's older OLED capture shows the evdev name "Valve Software Steam Controller". | Inferred [S5][S7][S9][S14][S23] |
| Gamepad.id, Windows on a Deck with Steam Input | `Xbox 360 Controller (XInput STANDARD GAMEPAD)` (28de:11ff is listed as an XInput Xbox 360 type) | Inferred [S3][S6] |

**What a browser sees**

| Situation | Gamepad visible? | Extras visible? | Sources |
|---|---|---|---|
| **Game Mode, browser added as a non-Steam game, gamepad template** (Microsoft and GamingOnLinux use "Gamepad with Mouse Trackpad") | Yes: Steam Virtual Gamepad, standard mapping, buttons 0–16 | **No.** Grips, trackpads and gyro exist only inside Steam Input. Bind them to keys, mouse or gamepad buttons there. In this template the right trackpad is a mouse. Steam and … are taken by SteamOS for its menus (Inferred; the Legion Go S SteamOS guide documents the same keys [S42]). GamingOnLinux reports that other Steam Input modes left Chrome without a pad. | [S34][S35][S31] |
| **Desktop Mode, Steam running (default)** | Not by default. Steam applies its Desktop Configuration (keyboard/mouse). **Long-press the Menu button to switch to gamepad mode**, or launch the browser from Steam with a gamepad layout. | No | [S33] |
| **Steam fully exited (SteamOS or other Linux)** | Yes: the raw `hid-steam` device (28de:1205) | **Chrome Linux:** standard 0–16 plus **17 = Quick Access, 18 = left trackpad click, 19 = right trackpad click, 20 = L4, 21 = R4, 22 = L5, 23 = R5**. No trackpad position or gyro. **Firefox Linux:** standard plus extras appended at 17+ in key-code order, which gives the same order (Inferred). The controller's built-in "lizard mode" (mouse/keyboard) stays on until Menu is held. | Inferred from source [S5][S9][S14][S17] |
| Flatpak browser without `/run/udev` | No pad at all | — | [S33][S34][S35] |
| Back grips' default binding in Valve's gamepad templates | **Unconfirmed** (no Valve document found). Community reports suggest most games leave them unbound. | — | — |

**ARPG conventions and preset notes**

- Use the standard Xbox-style preset (section 4).
- Tell players to bind grips to the game's keyboard keys in Steam Input. Common uses: L4 dodge, R4 jump/interact, L5 quick item/heal, R5 lock-on or ability. The thumb-saving advice is from community guides; no Valve source was found.
- Accept mouse-delta camera input, via the trackpad or Gyro To Mouse, at the same time as the right stick. [S32]
- 1280×800 is 16:10; check the HUD and font sizes at that size.

### 3.2 Lenovo Legion Go (8APU1, 2023)

| Item | Detail | Confidence / source |
|---|---|---|
| Screen | 8.8" IPS, 2560×1600 (16:10), 144 Hz, 10-point touch | Confirmed [S38] |
| Sticks / D-pad / face | Left and right joysticks. D-pad. A B X Y (Xbox layout). | Confirmed [S38][S39] |
| Bumpers / triggers | LB, RB (RB is called **M1** in FPS mode), LT, RT | Confirmed [S38][S39] |
| Menu / View | Menu, View, plus **Legion L** (opens Legion Space; reserved) and **Legion R** (Quick Settings sidebar; reserved), for 4 function buttons | Confirmed [S38][S39] |
| Extra | **Y1, Y2** (back of the left controller). **Y3, M3** (back of the right controller). **M2** (right controller). **Mouse wheel** (back of the right controller). **Touchpad**: buttonless, 28.5 mm, on the right controller, acts as a desktop cursor. **FPS mode switch** and an optical **mouse sensor** on the right controller's base. Left and right **release buttons**. Accelerometer and 6-axis gyro. | Confirmed [S38][S39][S45] |
| Detachable | Controllers detach and connect wirelessly. **FPS mode: the right controller becomes a wireless mouse, the left becomes a keyboard replacement** (up to 11 keys, 4 preset profiles in Legion Space). | Confirmed [S38][S45] |
| USB IDs | XInput: 17ef:6182 "Lenovo Legion Controller for Windows" (`xpad`; by default the pad "is presented as an Xbox controller"). Dual D-input: 17ef:6184. FPS mode on: 17ef:6185 ("Lenovo Legion-Controller 1-9E", from a community log). | 6182, 6184 Confirmed [S16][S15][S46]. 6185 Unconfirmed [S47] |
| Gamepad.id, Windows (XInput) | `<WGI DisplayName> (STANDARD GAMEPAD)`, no VID/PID, because 17ef:6182 isn't in Chromium's list. Firefox: `xinput`. | Inferred [S3][S6][S10] |
| Gamepad.id, Linux | Chrome: `... (STANDARD GAMEPAD Vendor: 17ef Product: 6182)` (standard via the `xpad` driver). Firefox: `17ef-6182-<name>`. | Inferred [S5][S9][S16] |
| What the page sees | XInput mode: standard 0–16. **Y1–Y3 and M1–M3 are invisible** unless mapped in Legion Space to controller buttons, keys, mouse buttons or combinations. The touchpad gives pointer events and the wheel gives `wheel` events. **FPS mode: mouse plus keyboard, no gamepad** (Inferred). D-input modes: non-standard raw layout (Inferred). | [S49][S45][S2] |

**Preset notes**

- Offer an "FPS mode" preset that uses keyboard and mouse.
- Detached multiplayer may expose the two halves as separate non-standard pads. The exact layout is **Unconfirmed**, so add a "press each button" calibration.
- Don't bind Legion L or Legion R.

### 3.3 Lenovo Legion Go S (8APU1 / 8ARP1, 2025; Windows 11 or SteamOS)

| Item | Detail | Confidence / source |
|---|---|---|
| Screen | 8" IPS, 1920×1200, 48–120 Hz VRR, 10-point touch | Confirmed [S40] |
| Sticks / D-pad / face | Left and right joysticks. D-pad. A B X Y. | Confirmed [S40] |
| Bumpers / triggers | LB, RB, LT, RT, plus **LT/RT range switches** (trigger-stop toggles on the back) | Confirmed [S40] |
| Menu / View | 4 function buttons. Windows: Legion L, Legion R, View, Menu. **SteamOS edition: Steam key, Quick Access key, View, Menu.** | Confirmed [S40][S41][S42] |
| Extra | **Y1, Y2** back buttons. **Touchpad**: buttonless, 10×10 mm, under the right stick. 6-axis gyro. No detachable controllers, no FPS mode. | Confirmed [S40][S41] |
| USB IDs | XInput 1a86:e310 ("Legion Go S" in `xpad`; the vendor ID belongs to the WCH chip maker). DInput 1a86:e311. | Confirmed [S15][S16] |
| Gamepad.id | Windows: `<WGI DisplayName> (STANDARD GAMEPAD)`. Linux without Steam: `... (STANDARD GAMEPAD Vendor: 1a86 Product: e310)`. SteamOS Game Mode: the Steam virtual pad 28de:11ff. | Inferred [S3][S5][S23] |
| What the page sees | Standard 0–16. Y1/Y2 and touchpad only via Legion Space (Windows) or Steam Input (SteamOS). Valve certified the Go S for SteamOS. | [S49][S42][S73] |

### 3.4 Lenovo Legion Go 2 (8AHP2, October 2025; SteamOS edition 2026)

| Item | Detail | Confidence / source |
|---|---|---|
| Screen | 8.8" **OLED**, 1920×1200, up to 144 Hz, 10-point touch | Confirmed [S43] |
| Sticks / D-pad / face | Joysticks (Hall effect per reviews). D-pad. A B X Y. | Confirmed [S43] (Hall effect per reviews [S72]) |
| Bumpers / triggers | LB, LT, RB, RT | Confirmed [S43] |
| Menu / View | **6 function buttons**: Legion L, Legion R, View, Menu, **Desktop** (show desktop) and **Page** (Task View) | Confirmed [S43][S44] |
| Extra | **Y1, Y2, Y3, M1, M2, M3**. **Mouse wheel** on the right controller. **Touchpad**: 24×24 mm, right controller. FPS mode switch and mouse sensor. Release buttons. 6-axis gyro. | Confirmed [S43][S44] |
| Detachable | Both attached: X-input. **One detached: "Dual D-input" mode.** Both detached: back to X-input. **Legion L + RB held >1 s toggles X-input and D-input.** | Confirmed [S44] |
| USB IDs | XInput 17ef:61eb. DInput 17ef:61ec. Dual DInput 17ef:61ed. FPS 17ef:61ee. Linux has a dedicated `hid-lenovo-go` driver (2026, co-authored by Valve). | Confirmed [S15][S20] |
| Gamepad.id | Windows XInput: `<WGI DisplayName> (STANDARD GAMEPAD)`. DInput: `<name> (Vendor: 17ef Product: 61ec)` with mapping `""`. Linux: depends on the driver path; the `hid-lenovo-go` evdev mapping is **Unconfirmed**. | Inferred [S3][S2]. Linux Unconfirmed |
| SteamOS edition | Announced at CES 2026 for June 2026, from $1,199. Whether it shipped on time, and Steam Input's default layout for it, are **Unconfirmed**. | [S50] |

Preset notes are as for the Legion Go (3.2). Add: the Desktop and Page buttons are system shortcuts, so don't rely on them.

### 3.5 ASUS ROG Ally (RC71L, 2023)

| Item | Detail | Confidence / source |
|---|---|---|
| Screen | 7" 1920×1080 (16:9), 120 Hz, 10-point touch | Confirmed [S51] |
| Sticks / D-pad / face | 2 full-size analog sticks. D-pad. A B X Y. | Confirmed [S51] |
| Bumpers / triggers | L & R bumpers. L & R **Hall-effect analog** triggers. | Confirmed [S51] |
| Menu / View | View, Menu, **Command Center** button, **Armoury Crate** button (neither can be remapped) | Confirmed [S51][S53] |
| Extra | **2 assignable grip (back) buttons, M1/M2.** 6-axis IMU. No trackpad. | Confirmed [S51][S53] |
| USB IDs | Gamepad: **045e:028e**. The Ally's pad presents itself as a wired Xbox 360 controller (SDL: "spoofs an Xbox 360 controller"). Extra buttons come through ASUS's N-KEY HID device, 0b05:1abe. On Linux, `hid-asus` maps the N-KEY codes to keys: left back = F15, Command Center (QAM) = F16, ROG key = PROG1. | Confirmed [S24][S59][S15][S18] |
| Gamepad.id | Windows Chrome/Edge: `Xbox 360 Controller (XInput STANDARD GAMEPAD)` (045e:028e is a known XInput ID). Firefox: `xinput`. Linux Chrome: `... (STANDARD GAMEPAD Vendor: 045e Product: 028e)`. | Inferred [S3][S6][S24] |
| What the page sees | Standard 0–16. M1/M2 not visible unless mapped. **By default M1/M2 are modifiers for secondary functions** (e.g. M1/M2 + D-pad Up opens the on-screen keyboard). **Armoury Crate starts in Auto mode, which switches by app, so a browser may be put in Desktop (mouse/keyboard) mode**: set Gamepad mode or a per-app profile. | [S53] |

### 3.6 ASUS ROG Ally X (RC72LA, 2024)

| Item | Detail | Confidence / source |
|---|---|---|
| Screen | 7" 1920×1080, 120 Hz, 10-point touch | Confirmed [S52] |
| Controls | Same as the Ally: ABXY, D-pad, 2 sticks, Hall-effect triggers, bumpers, View, Menu, Command Center, Armoury Crate, **2 grip buttons**, 6-axis IMU | Confirmed [S52] |
| USB ID / protocol | **0b05:1b4c**. A HID (DirectInput-style) gamepad rather than the XInput protocol. Without a driver, Linux sees "a HID Gamepad with a wrong mapping". ASUS software or drivers make it XInput on Windows. SDL lists 0b05:1b4c as Xbox 360-type. | Confirmed [S15][S21][S58][S59] |
| Gamepad.id | Windows Chrome/Edge: `<WGI DisplayName> (STANDARD GAMEPAD)` (Inferred). How the pad presents to Windows (VID:PID and name) is **Unconfirmed**. Linux without a handheld daemon: possibly non-standard (Unconfirmed). | [S3][S58] |
| Notes | Armoury Crate SE behaviour as for the Ally (3.5). There is still only **one pair** of back buttons. | [S53] |

### 3.7 ASUS ROG Xbox Ally, ROG Xbox Ally X (RC73YA / RC73XA, October 2025) and ROG Xbox Ally X20 (RC74XA, October 2026)

| Item | Detail | Confidence / source |
|---|---|---|
| Screen | Xbox Ally / Ally X: 7" IPS 1920×1080, 120 Hz, VRR, touch. **X20: 7.4" OLED 1920×1080, 120 Hz, HDR, VRR.** | Confirmed [S54][S55] |
| Sticks / D-pad / face | 2 full-size sticks (X20: TMR sticks). D-pad (X20: "transforming" 4-to-8-way D-pad). ABXY. | Confirmed [S54][S55] |
| Bumpers / triggers | Xbox Ally: Hall-effect analog triggers. **Ally X and X20: impulse triggers** (independent trigger rumble). | Confirmed [S54][S55][S56] |
| Menu / View | **Xbox button** (opens Game Bar), View, Menu, **Library** button, **Command Center** button | Confirmed [S54][S56] |
| Extra | **2 assignable back buttons** (Xbox Ally / Ally X). X20 back buttons: **Unconfirmed** (not in the spec lines found). 6-axis IMU. No trackpad. | [S54][S55] |
| USB ID | The Linux handheld daemon drives all three Xbox models through the Ally X code path (0b05:1b4c HID pad; DMI "ROG Xbox Ally RC73YA", "ROG Xbox Ally X RC73XA", "ROG XBOX Ally X RC74XA"). So **0b05:1b4c is likely** (Inferred). | [S59] |
| Gamepad.id | As for the Ally X (3.6): Windows `<WGI DisplayName> (STANDARD GAMEPAD)` (Inferred), with details **Unconfirmed** | [S3] |
| What the page sees | Standard 0–16 in gamepad mode. Back buttons via Armoury Crate SE key mapping. The Xbox, Library and Command Center buttons are system buttons. **Impulse triggers probably aren't reachable** (no `trigger-rumble` for this ID). | [S53][S54][S3] |
| Release facts | Xbox Ally / Ally X launched 16 October 2025. The X20 launched 15 October 2026 at $1,299.99. | [S56][S57] |

### 3.8 MSI Claw family

| Model | Screen | Confidence / source |
|---|---|---|
| Claw A1M (2024, Intel Meteor Lake) | 7" 1920×1080, 120 Hz, touch. Hall-effect sticks and triggers. | Confirmed [S63] |
| Claw 7 AI+ A2VM (2025) | 7" 1920×1080, 120 Hz, touch | Confirmed [S64] |
| Claw 8 AI+ A2VM (2025) | 8" 1920×1200, 48–120 Hz VRR, touch | Confirmed [S62] |
| Claw A8 BZ2EM (2025, AMD Z2 Extreme) | 8" 1920×1200, 48–120 Hz VRR, touch | Confirmed [S61] |
| Claw 8 EX AI+ (June 2026, Intel Arc G3 Extreme) | 8" 1920×1200, 120 Hz VRR, touch | Confirmed [S65][S74] |

| Item | Detail | Confidence / source |
|---|---|---|
| Controls (8 AI+, A8) | 6-axis IMU, D-pad, HD haptics, L & R **Hall-effect analog triggers**, L & R bumpers, **MSI Center M button**, **Macro buttons (M1/M2)**, Menu, **Quick Settings** button, RGB ABXY, RGB Hall-effect sticks, View | Confirmed [S61][S62] |
| Back buttons | M1 (right) and M2 (left) rear paddles | Confirmed [S19] |
| Claw A1M / 7 AI+ controls | Same layout reported (M1/M2, MSI Center M and Quick Settings buttons), but only partly shown in the sources found | A1M partly Confirmed [S63][S67]; 7 AI+ layout Unconfirmed |
| Claw 8 EX AI+ back buttons | **Unconfirmed** | [S65] |
| USB IDs | XInput 0db0:1901 ("Micro Star International Xbox360 Controller for Windows", `xpad`). DInput 0db0:1902. Desktop 0db0:1903. Linux has a dedicated `hid-msi` configuration driver (2026). | Confirmed [S15][S16][S19] |
| Gamepad.id | Windows: `<WGI DisplayName> (STANDARD GAMEPAD)` (Inferred). Linux: `... (STANDARD GAMEPAD Vendor: 0db0 Product: 1901)` (Inferred). | [S3][S5] |
| What the page sees | XInput: standard 0–16. M1/M2 only via MSI Center M Key Mapping (gamepad button, keyboard, mouse or macro). Desktop mode sends mouse and keyboard. MSI Center M and Quick Settings buttons are system buttons. | [S66][S19] |

### 3.9 Other current handhelds (brief)

| Family | Controls of note | IDs | Mapping software | Sources |
|---|---|---|---|---|
| **GPD** (Win 4, Win Mini, Win Max 2; older Win 2) | Xbox-layout pad. **L4/R4 back buttons** that firmware maps to keyboard keys or mouse (up to 4 keycodes each). | Win 2: 0079:18d4. Win Max 2: 045e:028e (SDL DB). Others **Unconfirmed**. | GPD WinControls / pyWinControls | [S16][S26][S68] |
| **AYANEO** (e.g. AYANEO 3, 2025) | Xbox-layout pad. **LC/RC** custom buttons. Rear buttons (AYANEO 3: one pair). The manual says LC opens the on-screen keyboard and RC sends Esc by default. | **Unconfirmed** | AYASpace (controller, keyboard or mouse mapping) | [S69][S70] |
| **OneXPlayer** | Xbox-layout pad | 2563:058d "OneXPlayer Gamepad" (`xpad`) | Vendor app | [S16] |
| **ZOTAC Zone** | 7" 1080p 120 Hz AMOLED. **Dual trackpads**. Back buttons not verified. | 1ee9:1590 "ZOTAC Gaming Zone" (`xpad`) | Vendor app | [S16][S71] |

All of these use the `xpad` driver or an Xbox 360 spoof, so a browser sees a standard Xbox-style pad. Any extra buttons reach the page only through the vendor's key mapping. The Linux Handheld Daemon (HHD) supports most of these devices and can emulate controllers with back buttons and gyro, but browsers still only see standard buttons. [S60]

---

## 4. Suggested presets (third-person action RPG)

### 4.1 Conventions found

| Input | "Souls-like" convention (Elden Ring, Xbox defaults) [S75] | "Face-button attack" convention (The Witcher 3, Xbox defaults) [S76] |
|---|---|---|
| Left stick | Move | Move |
| Right stick / R3 | Camera / lock-on, reset camera | Camera |
| RB / RT | Attack / strong attack | Not verified |
| LB / LT | Guard / skill | Not verified |
| A | Jump | Sprint |
| B | Backstep / dodge roll / dash | Dodge (hold to roll) |
| X | Use item | Fast attack |
| Y | Event action (interact) | Strong attack |
| D-pad | Switch left/right armament, spell, item | Not verified |
| View / Menu | Map / main menu | Not verified |

### 4.2 Base handheld preset (works on every device, standard mapping)

| Standard index | Action |
|---|---|
| axes 0/1 | Move. Click L3 (10) to toggle sprint or walk. |
| axes 2/3 | Camera. Click R3 (11) to lock on. |
| 5 RB / 7 RT | Light attack / heavy attack (RT `value` can charge) |
| 4 LB / 6 LT | Block or parry / skill or aim |
| 0 A | Interact / confirm |
| 1 B | Dodge (hold to sprint) / back |
| 2 X | Use quick item (heal) |
| 3 Y | Jump, or switch weapon |
| 12–15 D-pad | Cycle quick slots / spells |
| 8 View / 9 Menu | Map or inventory / pause |
| 16 Guide | **Leave unbound.** Reserved by Steam, Xbox Game Bar and Legion L. |

### 4.3 Per-device additions

| Device | Add to the preset |
|---|---|
| Steam Deck (Game Mode) | Published keyboard keys for "back-button actions" to bind on L4/R4/L5/R5 in Steam Input (e.g. L4 → dodge key, R4 → jump key, L5 → heal key, R5 → lock-on key). Mouse-delta camera via Pointer Lock for the right trackpad or Gyro To Mouse. Layout at 1280×800. If the id shows 28de:1205 (Steam not running, Chrome on Linux), read buttons 20–23 directly. |
| Legion Go / Go 2 | The same keyboard keys for Y1–Y3 and M1–M3 via Legion Space. An **FPS-mode preset** (mouse plus keyboard; the right controller is the mouse). Wheel → cycle items. Detached-halves mode needs a calibration flow. |
| Legion Go S | Keyboard keys for Y1/Y2. On SteamOS, as the Steam Deck. |
| ROG Ally / Ally X / Xbox Ally family | Two back buttons → keyboard keys via Armoury Crate SE, **after unticking "secondary function"**. Tell players to set **Gamepad** mode (Auto may pick Desktop mode for a browser). |
| MSI Claw | M1/M2 → keyboard keys via MSI Center M (update firmware on early units). |
| GPD / AYANEO / others | Back buttons → keyboard keys via the vendor tool |

---

## 5. Open questions (unconfirmed; test on hardware)

1. The WGI `DisplayName` part of the Chrome/Edge `Gamepad.id` on Windows for the Legion Go (all models), Claw, Ally X and Xbox Ally built-in pads.
2. Whether Microsoft Edge enables a different Chromium gamepad backend from Chrome (e.g. the GameInput fetcher) on Windows 11.
3. The default bindings of Valve's "Gamepad with Mouse Trackpad" template for L4/R4/L5/R5.
4. Legion Go 17ef:6183 / 6185 mode meanings, and how detached halves map in Chrome.
5. Whether the ROG Xbox Ally X20 has back buttons. Whether the Claw 8 EX AI+ keeps M1/M2.
6. Whether Chrome's Generic Sensor `Gyroscope` API reads the ROG Ally's Windows-exposed IMU.
7. Which Chrome release first shipped the Linux Steam Deck mapping (buttons 17–23); it is present in Chromium main as of November 2026.

---

## 6. Sources

- [S1] W3C Gamepad specification (standard mapping, user gesture, `id`, haptics, permissions policy): https://w3c.github.io/gamepad/
- [S2] Chromium `gamepad_data_fetcher.cc` (id format `"%s (%sVendor: %04x Product: %04x)"`): https://github.com/chromium/chromium/blob/main/device/gamepad/gamepad_data_fetcher.cc
- [S3] Chromium `wgi_data_fetcher_win.cc` (Windows ids, paddles, trigger-rumble, standard mapping): https://github.com/chromium/chromium/blob/main/device/gamepad/wgi_data_fetcher_win.cc
- [S4] Chromium `gamepad_platform_data_fetcher.h` (which Windows fetchers are used): https://github.com/chromium/chromium/blob/main/device/gamepad/gamepad_platform_data_fetcher.h
- [S5] Chromium `gamepad_standard_mappings_linux.cc` (MapperValve2 for 28de:1205, XInput/`xpad` fallback): https://github.com/chromium/chromium/blob/main/device/gamepad/gamepad_standard_mappings_linux.cc
- [S6] Chromium `gamepad_id_list.cc` (known IDs, XInput types, trigger-rumble list): https://github.com/chromium/chromium/blob/main/device/gamepad/gamepad_id_list.cc
- [S7] Chromium `gamepad_device_linux.cc` (name from USB manufacturer and product): https://github.com/chromium/chromium/blob/main/device/gamepad/gamepad_device_linux.cc
- [S8] Chromium `gamepad_features.cc` (GameInput fetcher and multitouch disabled by default): https://github.com/chromium/chromium/blob/main/device/gamepad/public/cpp/gamepad_features.cc
- [S9] Firefox `LinuxGamepad.cpp` (id `%04x-%04x-%s`, BTN_GAMEPAD standard, extras appended): https://github.com/mozilla-firefox/firefox/blob/main/dom/gamepad/linux/LinuxGamepad.cpp
- [S10] Firefox `WindowsGamepad.cpp` (XInput id `"xinput"`): https://github.com/mozilla-firefox/firefox/blob/main/dom/gamepad/windows/WindowsGamepad.cpp
- [S11] Matt Reynolds (Chrome), W3C public-webapps thread on Chrome/Firefox id formats, June 2020: https://lists.w3.org/Archives/Public/public-webapps-github/2020Jun/0361.html
- [S12] MDN, `Gamepad.id`: https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/id
- [S13] Chromium User-Agent reduction: https://www.chromium.org/updates/ua-reduction/
- [S14] Linux `hid-steam.c` (Deck button table, lizard mode, device removed while Steam client runs): https://github.com/torvalds/linux/blob/master/drivers/hid/hid-steam.c
- [S15] Linux `hid-ids.h` (Steam Deck, ROG Ally/Ally X, Legion Go/Go S/Go 2, MSI Claw IDs): https://github.com/torvalds/linux/blob/master/drivers/hid/hid-ids.h
- [S16] Linux `xpad.c` (Legion Go 17ef:6182, Legion Go S 1a86:e310, Claw 0db0:1901, GPD, OneXPlayer, ZOTAC): https://github.com/torvalds/linux/blob/master/drivers/input/joystick/xpad.c
- [S17] Linux `input-event-codes.h` (BTN_GRIPL/R/L2/R2 = 0x224–0x227): https://github.com/torvalds/linux/blob/master/include/uapi/linux/input-event-codes.h
- [S18] Linux `hid-asus.c` (ROG Ally key codes: left back F15, QAM F16, ROG key PROG1): https://github.com/torvalds/linux/blob/master/drivers/hid/hid-asus.c
- [S19] Linux `hid-msi.c` (Claw modes, M1/M2 remap targets, key list, original firmware limitation): https://github.com/torvalds/linux/blob/master/drivers/hid/hid-msi.c
- [S20] Linux `hid-lenovo-go.c` (Legion Go 2 XInput/DInput modes): https://github.com/torvalds/linux/blob/master/drivers/hid/hid-lenovo-go.c
- [S21] SDL `controller_list.h` (28de:1205 Steam Deck, 28de:11ff Steam Virtual Gamepad, 0b05:1b4c ROG Ally X): https://github.com/libsdl-org/SDL/blob/main/src/joystick/controller_list.h
- [S22] SDL `usb_ids.h`: https://github.com/libsdl-org/SDL/blob/main/src/joystick/usb_ids.h
- [S23] SDL `test/testevdev.c` (Steam Deck LCD/OLED USB names; Steam Input virtual controller "Microsoft X-Box 360 pad 0", 28de:11ff): https://github.com/libsdl-org/SDL/blob/main/test/testevdev.c
- [S24] SDL `SDL_joystick.c` ("The ROG Ally controller spoofs an Xbox 360 controller"; BMI320 sensors): https://github.com/libsdl-org/SDL/blob/main/src/joystick/SDL_joystick.c
- [S25] SDL commit "Steam uses a different VID/PID for the Steam Virtual Gamepad on Windows": https://discourse.libsdl.org/t/sdl-steam-uses-a-different-vid-pid-for-the-steam-virtual-gamepad-on-windows/44102
- [S26] SDL_GameControllerDB `gamecontrollerdb.txt` (Valve Steam Deck and Steam Virtual Gamepad rows; GPD rows; no Legion, Ally or Claw rows): https://github.com/mdqinc/SDL_GameControllerDB/blob/master/gamecontrollerdb.txt
- [S27] Valve, Steam Deck OLED tech specs: https://www.steamdeck.com/en/tech
- [S28] Valve, Steam Deck LCD tech specs: https://www.steamdeck.com/en/tech/deck
- [S29] Wikipedia, Steam Deck (L4/R4/L5/R5, LCD discontinuation, May 2026 prices): https://en.wikipedia.org/wiki/Steam_Deck
- [S30] Steamworks, Steam Deck FAQ (input APIs, touchscreen as mouse): https://partner.steamgames.com/doc/steamdeck/faq
- [S31] Steamworks, Steam Input gamepad emulation best practices (shows up as an Xbox controller; VID 0x28DE / PID 0x11FF): https://partner.steamgames.com/doc/features/steam_controller/steam_input_gamepad_emulation_bestpractices
- [S32] Steamworks, Steam Deck recommendations (default config must reach all functions; Gyro To Mouse; mouse and joystick camera together): https://partner.steamgames.com/doc/steamdeck/recommendations
- [S33] Mozilla Bug 1784381 (Steam Deck id `28de-11ff-Microsoft X-Box 360 pad 0`; Desktop Mode long-press Menu; Flatpak /run/udev fix in Firefox 158): https://bugzilla.mozilla.org/show_bug.cgi?id=1784381
- [S34] Microsoft Support, Xbox Cloud Gaming in Microsoft Edge with Steam Deck: https://support.microsoft.com/en-us/edge/xbox-cloud-gaming-in-microsoft-edge-with-steam-deck
- [S35] GamingOnLinux, "Chrome on Steam Deck now supports the Deck controller" (updated June 2025): https://gamingonlinux.com/2022/03/chrome-on-steam-deck-now-supports-the-deck-controller-with-geforce-now-working
- [S36] Flathub `com.google.Chrome` manifest (finish-args): https://github.com/flathub/com.google.Chrome/blob/master/com.google.Chrome.yaml
- [S37] Tom's Hardware, Valve discontinues the Steam Deck LCD: https://www.tomshardware.com/video-games/handheld-gaming/valve-discontinues-the-most-affordable-steam-deck-usd399-lcd-version-on-the-way-out-as-new-starting-point-is-usd549
- [S38] Lenovo PSREF, Legion Go 8APU1: https://psref.lenovo.com/syspool/Sys/PDF/Legion/Legion_Go_8APU1/Legion_Go_8APU1_Spec.pdf
- [S39] Lenovo, Legion Go user guide: https://download.lenovo.com/pccbbs/pubs/legion_go_8apu1/user_guide/en/index.html
- [S40] Lenovo PSREF, Legion Go S 8APU1: https://psref.lenovo.com/syspool/Sys/PDF/Legion/Legion_Go_S_8APU1/Legion_Go_S_8APU1_Spec.PDF
- [S41] Lenovo, Legion Go S user guide (Windows): https://download.lenovo.com/pccbbs/pubs/legion_go_s_8arp1/user_guide/en/go_s_win.html
- [S42] Lenovo, Legion Go S user guide (SteamOS): https://download.lenovo.com/pccbbs/pubs/legion_go_s_8arp1/user_guide/en/go_s_steam.html
- [S43] Lenovo PSREF, Legion Go 8AHP2 (Legion Go 2): https://psref.lenovo.com/syspool/Sys/PDF/Legion/Legion_Go_8AHP2/Legion_Go_8AHP2_Spec.pdf
- [S44] Lenovo, Legion Go (8.8", Gen 2) user guide: https://download.lenovo.com/pccbbs/pubs/legion_go_8/user_guide/en/index.html
- [S45] Notebookcheck, Lenovo Legion Go review (touchpad, FPS mode = mouse plus keyboard): https://www.notebookcheck.net/Lenovo-Legion-Go-gaming-handheld-review-Good-idea-not-quite-perfectly-executed.794034.0.html
- [S46] LKML, "Input: xpad - add Lenovo Legion Go controllers": https://lkml.iu.edu/hypermail/linux/kernel/2401.2/03490.html
- [S47] Arch Linux forum, Legion Go IDs with FPS mode on (17ef:6185): https://bbs.archlinux.org/viewtopic.php?id=290041
- [S48] LegionGoRemapper (uses Lenovo's firmware remapping; Y1, Y2, Y3, M2, M3; no M1): https://github.com/aarron-lee/LegionGoRemapper
- [S49] Lenovo Legion Go update notes, April 2024 (Button Mapping: controller buttons, mouse buttons, keyboard keys, combinations), via r/LegionGo: https://www.reddit.com/r/LegionGo/comments/1c09h82/legion_go_update_04092024/
- [S50] GamingOnLinux, Legion Go 2 SteamOS version due June 2026: https://www.gamingonlinux.com/2026/01/lenovo-legion-go-2-will-get-a-steamos-version-in-june/
- [S51] ASUS, ROG Ally (2023) specifications: https://rog.asus.com/gaming-handhelds/rog-ally/rog-ally-2023/spec/
- [S52] ASUS, ROG Ally X (2024) specifications: https://rog.asus.com/gaming-handhelds/rog-ally/rog-ally-x-2024/spec/
- [S53] ASUS, "How to remap buttons and create custom game profiles on the ROG Ally": https://rog.asus.com/ch-fr/articles/guides/how-to-remap-buttons-and-create-custom-game-profiles-on-the-rog-ally/
- [S54] ASUS, ROG Xbox Ally product page: https://rog.asus.com/content/rog-xbox-ally/
- [S55] Xbox.com, ROG Xbox Ally / Ally X / Ally X20: https://www.xbox.com/en-US/handhelds/rog-xbox-ally
- [S56] Wikipedia, ROG Xbox Ally (controls, launch dates): https://en.wikipedia.org/wiki/ROG_Xbox_Ally
- [S57] VideoCardz, ROG Xbox Ally X20 pre-order at $1,299: https://videocardz.com/newz/asuss-first-oled-gaming-handheld-is-now-available-for-preorder-at-1299
- [S58] LKML, "[PATCH] hid-asus-ally: Add full gamepad support" (Ally X is a HID pad, "dinput is translated to XBox controller"): https://lkml.iu.edu/hypermail/linux/kernel/2408.0/05244.html
- [S59] Handheld Daemon, ROG Ally device code (Ally pad 045e:028e plus N-KEY 0b05:1abe; Ally X and Xbox Ally models on 0b05:1b4c; DMI names): https://github.com/hhd-dev/hhd/blob/master/src/hhd/device/rog_ally/base.py and https://github.com/hhd-dev/hhd/blob/master/src/hhd/device/rog_ally/__init__.py
- [S60] Handheld Daemon README (supported devices): https://github.com/hhd-dev/hhd
- [S61] MSI, Claw A8 BZ2EM spec sheet: https://storage-asset.msi.com/specSheet/hk/hh/Claw%20A8%20BZ2EM-060RU.pdf
- [S62] MSI, Claw 8 AI+ A2VM spec sheet: https://storage-asset.msi.com/specSheet/ar/hh/Claw%208%20AI%2B%20A2VM-264AE.pdf
- [S63] MSI Claw A1M spec sheet (P.C. Richard): https://static.pcrichard.com/docs/CLAWA1051_Specifications-Sheet_01.pdf
- [S64] MSI, Claw 7 AI+ A2VM specification page: https://gr.msi.com/Handheld/Claw-7-AI-Plus-A2VMX/Specification
- [S65] Notebookcheck, MSI Claw 8 EX AI+ review: https://www.notebookcheck.net/Intel-s-Arc-G3-Extreme-changes-the-handheld-game-MSI-Claw-8-EX-AI-Review.1325574.0.html
- [S66] MSI FAQ, "[How To] Setup Macro-Keys on Claw" (Key Mapping → M1/M2; Macro up to 32 keys). This page returned 403 to direct fetches; its content was read through a search-engine summary. https://www.msi.com/faq/faq-10730
- [S67] LKML, "Input: xpad - add support for MSI Claw A1M": https://lkml.iu.edu/hypermail/linux/kernel/2410.1/05741.html
- [S68] pyWinControls (GPD Win 4 / Win Mini back buttons): https://github.com/pelrun/pyWinControls
- [S69] AYANEO, AYASpace mapping article: https://www.ayaneo.com/article/870
- [S70] AYANEO 3 manual (LC/RC defaults): https://manuals.plus/ayaneo/3-ab07-portable-gaming-computer-manual
- [S71] PC Gamer, Zotac Zone review: https://www.pcgamer.com/hardware/handheld-gaming-pcs/zotac-zone-review
- [S72] Windows Central, Legion Go 2 (SteamOS) vs Xbox Ally X (Hall-effect sticks): https://www.windowscentral.com/hardware/handheld-gaming-pc/legion-go-2-steamos-vs-xbox-ally-x
- [S73] PC Gamer, "Valve certifies the Lenovo Legion Go S for SteamOS ... 3.7.8 update": https://www.pcgamer.com/hardware/handheld-gaming-pcs/valve-certifies-the-lenovo-legion-go-s-for-steamos-improves-amd-compatibility-controller-support-and-officially-brings-80-percent-limiting-to-steamos-in-3-7-8-update
- [S74] Engadget, MSI Claw 8 EX AI+ launches 23 June 2026: https://engadget.com/2184461/msi-claw-8-ex-ai-handheld-comes-out-on-june-23
- [S75] Elden Ring controls (Fextralife wiki): https://eldenring.wiki.fextralife.com/Controls
- [S76] The Witcher 3 Xbox One controls (GosuNoob): https://gosunoob.com/?p=36297

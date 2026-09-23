// DOM helpers for the game's screens: switching layers, the message box, mission briefings,
// the in-game message panel and the loading progress indicator.
//
// All text is inserted with textContent, never innerHTML, so chat messages cannot inject markup.

const $ = (id) => document.getElementById(id);

// Profile pictures for game characters
const characters = {
    system: { name: "System Control", image: "system.png" },
    op: { name: "Operator", image: "girl1.png" },
    pilot: { name: "Pilot", image: "girl2.png" },
    driver: { name: "Driver", image: "man1.png" },
};

// How long a caller's picture stays up after their message
const CALLER_PICTURE_TIMEOUT_MS = 6000;

function hideScreens() {
    for (const screen of document.querySelectorAll(".gamelayer")) {
        screen.hidden = true;
    }
}

export function showScreen(id) {
    $(id).hidden = false;
}

export function hideScreen(id) {
    $(id).hidden = true;
}

// Show only the given screen
export function switchToScreen(id) {
    hideScreens();
    showScreen(id);
}

// Replace an element's content with one paragraph per line of text
function setParagraphs(element, text) {
    element.replaceChildren(...text.split("\n").map((line) => {
        const paragraph = document.createElement("p");

        paragraph.textContent = line.trim();

        return paragraph;
    }));
}

export function showMissionBriefing(briefing) {
    setParagraphs($("missionbriefing"), briefing);
    showScreen("missionbriefingscreen");
}

/* Message box */

let resolveMessageBox;

/**
 * Show a modal message box.
 * @param {string} message  text to show; "\n" starts a new paragraph
 * @param {{cancel?: boolean}} [options]  show a Cancel button as well as OK
 * @returns {Promise<boolean>} true if the player clicked OK, false for Cancel
 */
export function showMessageBox(message, { cancel = false } = {}) {
    // Only one message box can be open at a time; treat a replaced box as cancelled
    resolveMessageBox?.(false);

    setParagraphs($("messageboxtext"), message);
    $("messageboxcancel").hidden = !cancel;
    showScreen("messageboxscreen");
    $("messageboxok").focus();

    return new Promise((resolve) => {
        resolveMessageBox = resolve;
    });
}

function closeMessageBox(result) {
    hideScreen("messageboxscreen");

    const resolve = resolveMessageBox;

    resolveMessageBox = undefined;
    resolve?.(result);
}

export function isMessageBoxOpen() {
    return resolveMessageBox !== undefined;
}

export function initMessageBox() {
    $("messageboxok").addEventListener("click", () => closeMessageBox(true));
    $("messageboxcancel").addEventListener("click", () => closeMessageBox(false));

    // Keyboard shortcuts: Enter for OK, Escape for Cancel (or OK when there is no Cancel button).
    // While the message box is open it swallows all key presses so they don't reach the game.
    window.addEventListener("keydown", (ev) => {
        if (!isMessageBoxOpen()) {
            return;
        }

        if (ev.key === "Enter") {
            ev.preventDefault();
            closeMessageBox(true);
        } else if (ev.key === "Escape") {
            ev.preventDefault();
            closeMessageBox($("messageboxcancel").hidden);
        } else if (ev.key === "Tab") {
            // Allow moving focus between OK and Cancel
            return;
        }

        ev.stopImmediatePropagation();
    });
}

/* In-game message panel */

let callerPictureTimeout;

export function clearGameMessages() {
    $("gamemessages").replaceChildren();
    $("callerpicture").replaceChildren();
    clearTimeout(callerPictureTimeout);
}

export function showGameMessage(from, message) {
    const callerPicture = $("callerpicture");
    const gameMessages = $("gamemessages");
    const character = characters[from];

    if (character) {
        // Use the character's defined name and show their profile picture
        from = character.name;

        const image = new Image();

        image.src = `images/characters/${character.image}`;
        image.alt = character.name;
        callerPicture.replaceChildren(image);

        // Remove the caller picture after a few seconds
        clearTimeout(callerPictureTimeout);
        callerPictureTimeout = setTimeout(() => callerPicture.replaceChildren(), CALLER_PICTURE_TIMEOUT_MS);
    }

    // Append message to messages pane and scroll to the bottom
    const line = document.createElement("div");
    const sender = document.createElement("span");

    sender.textContent = `${from}: `;
    line.append(sender, message);
    gameMessages.append(line);
    gameMessages.scrollTop = gameMessages.scrollHeight;
}

/* Loading screen */

export function showLoadingProgress(loaded, total) {
    $("loadingmessage").textContent = `Loaded ${loaded} of ${total}`;
}

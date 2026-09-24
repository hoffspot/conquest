// DOM helpers for the game's screens: switching layers, the message box, mission briefings,
// messages from the mission's characters, the in-game message panel and the loading progress
// indicator.
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
// How long messages stay on screen over the map
const MESSAGES_VISIBLE_MS = 9000;
// Never keep more than this many messages on the page
const MAXIMUM_MESSAGES = 20;

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

/* Messages from the mission's characters */

// Messages waiting to be read; the first one is on screen
const transmissions = [];
let onTransmissionsChange = () => {};

/**
 * Set up the dialog that shows messages from the mission's characters.
 * @param {{onChange: (open: boolean) => void}} options  called when the dialog opens or closes
 */
export function initTransmissions({ onChange }) {
    const text = $("transmissiontext");

    onTransmissionsChange = onChange;
    $("transmissioncontinue").addEventListener("click", () => nextTransmission());

    text.addEventListener("scroll", updateMoreToRead, { passive: true });
    new ResizeObserver(updateMoreToRead).observe(text);
}

// Fade out the bottom of a long message while there is more to read below (phones hide scroll bars)
function updateMoreToRead() {
    const text = $("transmissiontext");

    text.classList.toggle("more", text.scrollTop + text.clientHeight < text.scrollHeight - 1);
}

/** Is this a message from one of the mission's characters (not a status message from System Control)? */
export function isTransmission(from) {
    return from !== "system" && Object.hasOwn(characters, from);
}

/** Show a message from a mission character in a dialog. Messages that arrive together are shown one by one. */
export function showTransmission(from, message) {
    transmissions.push({ character: characters[from], message });

    if (transmissions.length === 1) {
        displayTransmission();
        onTransmissionsChange(true);
    }
}

function displayTransmission() {
    const { character, message } = transmissions[0];
    const picture = $("transmissionpicture");

    picture.src = `images/characters/${character.image}`;
    picture.alt = character.name;
    $("transmissionfrom").textContent = character.name;
    setParagraphs($("transmissiontext"), message);
    $("transmissiontext").scrollTop = 0;

    showScreen("transmissionscreen");
    updateMoreToRead();
    $("transmissioncontinue").focus();
}

export function isTransmissionOpen() {
    return transmissions.length > 0;
}

/** Close the current message and show the next one, if any. */
export function nextTransmission() {
    if (!isTransmissionOpen()) {
        return;
    }

    transmissions.shift();

    if (isTransmissionOpen()) {
        displayTransmission();
    } else {
        hideScreen("transmissionscreen");
        onTransmissionsChange(false);
    }
}

export function clearTransmissions() {
    transmissions.length = 0;
    hideScreen("transmissionscreen");
}

/* In-game message panel */

let callerPictureTimeout;
let messagesTimeout;

export function clearGameMessages() {
    $("gamemessages").replaceChildren();
    $("gamemessages").classList.remove("visible");
    $("callerpicture").replaceChildren();
    clearTimeout(callerPictureTimeout);
    clearTimeout(messagesTimeout);
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

    // Append the message; the panel shows the newest messages and fades out after a while
    const line = document.createElement("div");
    const sender = document.createElement("span");

    sender.textContent = `${from}: `;
    line.append(sender, message);
    gameMessages.append(line);

    // Older messages that no longer fit are removed whole, so none is ever cut off. A single
    // message too long for the panel makes it taller.
    gameMessages.style.maxHeight = "";

    while (gameMessages.childElementCount > MAXIMUM_MESSAGES
        || (gameMessages.childElementCount > 1 && gameMessages.scrollHeight > gameMessages.clientHeight)) {
        gameMessages.firstElementChild.remove();
    }

    if (gameMessages.scrollHeight > gameMessages.clientHeight) {
        gameMessages.style.maxHeight = "none";
    }

    gameMessages.classList.add("visible");
    clearTimeout(messagesTimeout);
    messagesTimeout = setTimeout(() => gameMessages.classList.remove("visible"), MESSAGES_VISIBLE_MS);
}

/* Loading screen */

export function showLoadingProgress(loaded, total) {
    $("loadingmessage").textContent = `Loaded ${loaded} of ${total}`;
}

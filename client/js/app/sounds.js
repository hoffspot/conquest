// Sound effects using the Web Audio API.
//
// The book played sounds through <audio> elements, which cannot overlap the same sound, need
// a workaround (wAudio.js) on mobile, and wait for "canplaythrough" events that some browsers
// never send. Web Audio buffers can be played any number of times at once.
//
// Browsers only let audio start after a user gesture, so the raw files are downloaded during
// the loading screen and decoded once the player first clicks, taps or presses a key.

const SOUND_FILES = {
    "bullet": ["bullet1", "bullet2"],
    "heatseeker": ["heatseeker1", "heatseeker2"],
    "fireball": ["laser1", "laser2"],
    "cannon-ball": ["cannon1", "cannon2"],
    "message-received": ["message"],
    "acknowledge-attacking": ["engaging"],
    "acknowledge-moving": ["yup", "roger1", "roger2"],
};

// Prefer Ogg Vorbis where the browser is confident it can play it, otherwise use MP3
function soundFileExtension() {
    const audio = document.createElement("audio");

    return audio.canPlayType?.("audio/ogg; codecs=\"vorbis\"") === "probably" ? ".ogg" : ".mp3";
}

export class SoundManager {
    #files = new Map(); // sound name -> array of ArrayBuffer promises
    #buffers = new Map(); // sound name -> array of decoded AudioBuffers
    #counters = new Map(); // sound name -> index of the next variation to play
    #context;
    #output;

    muted = false;

    /** Start downloading every sound file. Returns one promise per file, for progress reporting. */
    load() {
        const extension = soundFileExtension();
        const downloads = [];

        for (const [name, fileNames] of Object.entries(SOUND_FILES)) {
            // A missing sound is not fatal: log it and carry on without that sound
            const files = fileNames.map(async (fileName) => {
                const url = `audio/${fileName}${extension}`;

                try {
                    const response = await fetch(url);

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    return await response.arrayBuffer();
                } catch (error) {
                    console.warn(`Could not load sound ${url}:`, error);

                    return undefined;
                }
            });

            this.#files.set(name, files);
            downloads.push(...files);
        }

        return downloads;
    }

    /** Create the audio context and decode the sounds. Call from a user gesture event handler. */
    unlock() {
        if (this.#context) {
            if (this.#context.state === "suspended") {
                this.#context.resume();
            }

            return;
        }

        const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;

        if (!AudioContext) {
            return;
        }

        this.#context = new AudioContext();
        this.#output = this.#context.createGain();
        this.#output.connect(this.#context.destination);

        for (const [name, files] of this.#files) {
            Promise.all(files)
                .then((data) => Promise.all(data.filter(Boolean).map((file) => this.#context.decodeAudioData(file))))
                .then((buffers) => {
                    if (buffers.length > 0) {
                        this.#buffers.set(name, buffers);
                    }
                })
                .catch((error) => console.warn(`Could not decode sound "${name}":`, error));
        }
    }

    /** Play a sound, cycling through its variations. */
    play(name) {
        const buffers = this.#buffers.get(name);

        if (this.muted || !buffers || this.#context.state !== "running") {
            return;
        }

        const counter = this.#counters.get(name) ?? 0;
        const source = this.#context.createBufferSource();

        source.buffer = buffers[counter % buffers.length];
        source.connect(this.#output);
        source.start();

        this.#counters.set(name, counter + 1);
    }

    toggleMute() {
        this.muted = !this.muted;

        return this.muted;
    }
}

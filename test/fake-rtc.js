// WebRTC for the tests (generated/world_server_plan.md §9.6), in Node: connections that link
// in memory once they've traded an offer and an answer (through the real broker), their data
// channels passing what's sent; or never link (`blocked`: a network no direct link gets through),
// so a game falls back to relaying. Each gathers one ICE candidate on its own network, and one
// mapped by each STUN server it's given.

let made = 0;
const connections = new Map();

class Events {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(type, listener) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    removeEventListener(type, listener) {
        this.listeners.set(
            type,
            (this.listeners.get(type) ?? []).filter((one) => one !== listener),
        );
    }

    dispatch(type, event = {}) {
        for (const listener of this.listeners.get(type) ?? []) {
            listener(event);
        }
    }
}

const later = (then) => setTimeout(then, 1);

/** A data channel: what's sent comes out of its partner's "message", a tick later. Records `sent` (each message's length). */
export class FakeChannel extends Events {
    constructor(label) {
        super();
        this.label = label;
        this.readyState = "connecting";
        this.bufferedAmount = 0;
        this.bufferedAmountLowThreshold = 0;
        this.partner = null;
        this.sent = [];
    }

    send(data) {
        if (this.readyState !== "open") {
            throw new Error("InvalidStateError");
        }

        this.sent.push(String(data).length);

        const partner = this.partner;

        later(() => partner.readyState === "open" && partner.dispatch("message", { data }));
    }

    opened() {
        this.readyState = "open";
        this.dispatch("open");
    }

    close() {
        if (this.readyState === "closed") {
            return;
        }

        this.readyState = "closed";
        later(() => this.dispatch("close"));
        this.partner?.close();
    }
}

/** RTCPeerConnection, as far as the game uses it. `FakeRTC.blocked`: no direct link is ever made. */
export class FakeRTC extends Events {
    static blocked = false;

    constructor({ iceServers = [] } = {}) {
        super();
        this.id = ++made;
        this.iceServers = iceServers;
        this.localDescription = null;
        this.remoteDescription = null;
        this.connectionState = "new";
        this.channels = [];
        connections.set(this.id, this);
    }

    createDataChannel(label) {
        const channel = new FakeChannel(label);

        this.channels.push(channel);

        return channel;
    }

    async createOffer() {
        return { type: "offer", sdp: `fake ${this.id}` };
    }

    async createAnswer() {
        return { type: "answer", sdp: `fake ${this.id}` };
    }

    async setLocalDescription(description) {
        this.localDescription = { ...description, toJSON: () => ({ type: description.type, sdp: description.sdp }) };

        // (Its candidates gathered: one on its own network, one mapped by each STUN server)
        later(() => {
            const host = `192.168.1.${this.id % 250}`;

            this.dispatch("icecandidate", { candidate: { candidate: `candidate:1 1 udp 2122260223 ${host} ${50000 + this.id} typ host`, sdpMid: "0", type: "host", address: host, port: 50000 + this.id } });

            for (const [index] of this.iceServers.entries()) {
                this.dispatch("icecandidate", { candidate: { candidate: `candidate:2 1 udp 1686052607 203.0.113.9 ${60000 + this.id} typ srflx raddr ${host} rport ${50000 + this.id}`, sdpMid: "0", type: "srflx", address: "203.0.113.9", port: 60000 + this.id, relatedAddress: host, relatedPort: 50000 + this.id, server: index } });
            }

            this.dispatch("icecandidate", { candidate: null });
        });
    }

    async setRemoteDescription(description) {
        this.remoteDescription = description;
        this.connectionState = "connecting";

        // (The offerer told the answer: the two linked, unless nothing gets through)
        if (description.type === "answer" && !FakeRTC.blocked) {
            const other = connections.get(Number(String(description.sdp).split(" ")[1]));

            later(() => this.#link(other));
        }
    }

    #link(other) {
        if (!other || this.connectionState === "closed" || other.connectionState === "closed") {
            return;
        }

        for (const channel of this.channels) {
            const partner = new FakeChannel(channel.label);

            channel.partner = partner;
            partner.partner = channel;
            other.dispatch("datachannel", { channel: partner });
        }

        for (const connection of [this, other]) {
            connection.connectionState = "connected";
            connection.dispatch("connectionstatechange");
        }

        later(() => {
            for (const channel of this.channels) {
                channel.opened();
                channel.partner.opened();
            }
        });
    }

    async addIceCandidate() {}

    restartIce() {}

    close() {
        if (this.connectionState === "closed") {
            return;
        }

        this.connectionState = "closed";

        for (const channel of this.channels) {
            channel.close();
        }

        connections.delete(this.id);
    }
}

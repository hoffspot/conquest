// The pictures on signs, painted on a canvas as old inn signs were: a bold shape in a strong
// colour, lit from the upper left, outlined dark so it reads from across a street. Each emblem
// (core/lore/taverns.js EMBLEMS, and the trades' and the guild's) is drawn in a box two units
// across, its middle at 0, y down, by `paintEmblem(context, name, { x, y, size, colour })`; a
// sign showing several (The Three Bells) sets them out round its middle.

const TAU = Math.PI * 2;

// Light and dark of a colour, for shading
function shade(hex, amount) {
    const value = parseInt(hex.slice(1), 16);
    const channel = (shift) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * amount)));

    return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

// Fill the path drawn by `draw` in `colour`, lit from the upper left, outlined dark
function solid(context, colour, draw, { outline = 0.07, light = true } = {}) {
    context.beginPath();
    draw(context);

    if (light) {
        const gradient = context.createLinearGradient(-1, -1, 1, 1);

        gradient.addColorStop(0, shade(colour, 1.35));
        gradient.addColorStop(0.55, colour);
        gradient.addColorStop(1, shade(colour, 0.65));
        context.fillStyle = gradient;
    } else {
        context.fillStyle = colour;
    }

    context.fill();
    context.lineWidth = outline;
    context.lineJoin = "round";
    context.strokeStyle = "rgba(20, 12, 6, 0.9)";
    context.stroke();
}

const line = (context, colour, width, points) => {
    context.beginPath();
    context.moveTo(...points[0]);

    for (const point of points.slice(1)) {
        context.lineTo(...point);
    }

    context.lineWidth = width;
    context.lineCap = "round";
    context.strokeStyle = colour;
    context.stroke();
};

const PAINTERS = {
    boar(c, colour) {
        solid(c, colour, (p) => {
            p.moveTo(-0.95, 0.05);
            p.bezierCurveTo(-0.9, -0.35, -0.55, -0.45, -0.3, -0.42);
            // Bristles along the back
            for (let k = 0; k < 7; k++) {
                const x = -0.3 + k * 0.12;

                p.lineTo(x + 0.04, -0.58 + Math.abs(k - 3) * 0.035);
                p.lineTo(x + 0.1, -0.45 + Math.abs(k - 3) * 0.03);
            }

            p.bezierCurveTo(0.6, -0.4, 0.8, -0.2, 0.85, 0.05);
            p.lineTo(0.8, 0.45);
            p.lineTo(0.66, 0.45);
            p.lineTo(0.6, 0.2);
            p.lineTo(-0.3, 0.25);
            p.lineTo(-0.35, 0.45);
            p.lineTo(-0.5, 0.45);
            p.lineTo(-0.55, 0.15);
            p.bezierCurveTo(-0.75, 0.2, -0.95, 0.25, -0.95, 0.05);
            p.closePath();
        });
        // The tusk and the eye
        solid(c, "#f2ead8", (p) => {
            p.moveTo(-0.78, 0.08);
            p.quadraticCurveTo(-0.82, -0.12, -0.66, -0.2);
            p.quadraticCurveTo(-0.72, -0.05, -0.68, 0.1);
            p.closePath();
        }, { light: false, outline: 0.04 });
        solid(c, "#1a1008", (p) => p.arc(-0.6, -0.18, 0.04, 0, TAU), { light: false, outline: 0 });
    },

    stag(c, colour) {
        // The head from the front, antlers branching up
        for (const side of [-1, 1]) {
            line(c, shade(colour, 0.8), 0.1, [[side * 0.12, -0.35], [side * 0.35, -0.7], [side * 0.55, -0.95]]);
            line(c, shade(colour, 0.8), 0.08, [[side * 0.27, -0.55], [side * 0.62, -0.6]]);
            line(c, shade(colour, 0.8), 0.08, [[side * 0.4, -0.78], [side * 0.72, -0.88]]);
            line(c, shade(colour, 0.8), 0.07, [[side * 0.33, -0.66], [side * 0.3, -0.95]]);
        }

        solid(c, colour, (p) => {
            p.moveTo(0, -0.45);
            p.bezierCurveTo(0.35, -0.45, 0.35, -0.1, 0.25, 0.25);
            p.quadraticCurveTo(0.15, 0.7, 0, 0.75);
            p.quadraticCurveTo(-0.15, 0.7, -0.25, 0.25);
            p.bezierCurveTo(-0.35, -0.1, -0.35, -0.45, 0, -0.45);
        });

        for (const side of [-1, 1]) {
            solid(c, colour, (p) => {
                p.moveTo(side * 0.25, -0.3);
                p.quadraticCurveTo(side * 0.65, -0.35, side * 0.6, -0.15);
                p.quadraticCurveTo(side * 0.45, -0.1, side * 0.26, -0.15);
            });
            solid(c, "#1a1008", (p) => p.arc(side * 0.13, -0.1, 0.05, 0, TAU), { light: false, outline: 0 });
        }

        solid(c, "#2a1a10", (p) => p.ellipse(0, 0.62, 0.1, 0.07, 0, 0, TAU), { light: false, outline: 0 });
    },

    fox(c, colour) {
        solid(c, colour, (p) => {
            p.moveTo(-0.7, -0.75);
            p.lineTo(-0.35, -0.35);
            p.lineTo(0.35, -0.35);
            p.lineTo(0.7, -0.75);
            p.lineTo(0.75, -0.1);
            p.quadraticCurveTo(0.55, 0.35, 0, 0.8);
            p.quadraticCurveTo(-0.55, 0.35, -0.75, -0.1);
            p.closePath();
        });

        for (const side of [-1, 1]) {
            solid(c, "#f4ecde", (p) => {
                p.moveTo(side * 0.72, -0.05);
                p.quadraticCurveTo(side * 0.35, 0.1, side * 0.08, 0.72);
                p.quadraticCurveTo(side * 0.4, 0.35, side * 0.72, -0.05);
            }, { light: false, outline: 0.03 });
            solid(c, "#1a1008", (p) => p.ellipse(side * 0.28, -0.05, 0.07, 0.04, side * 0.4, 0, TAU), { light: false, outline: 0 });
        }

        solid(c, "#1a1008", (p) => p.arc(0, 0.72, 0.07, 0, TAU), { light: false, outline: 0 });
    },

    swan(c, colour) {
        solid(c, colour, (p) => {
            // Body and folded wing, the neck curving up in an S to the head
            p.moveTo(-0.85, 0.3);
            p.bezierCurveTo(-0.8, 0.75, 0.6, 0.75, 0.75, 0.3);
            p.bezierCurveTo(0.6, 0.15, 0.35, 0.2, 0.3, 0.25);
            p.bezierCurveTo(0.1, 0.05, 0.1, -0.35, 0.3, -0.55);
            p.bezierCurveTo(0.45, -0.75, 0.25, -0.9, 0.1, -0.75);
            p.lineTo(0.02, -0.72);
            p.bezierCurveTo(0.2, -0.7, 0.28, -0.6, 0.15, -0.45);
            p.bezierCurveTo(-0.05, -0.25, -0.05, 0.1, 0.05, 0.25);
            p.bezierCurveTo(-0.3, 0.05, -0.7, 0.0, -0.85, 0.3);
        });
        solid(c, "#d8762a", (p) => {
            p.moveTo(0.1, -0.75);
            p.lineTo(-0.12, -0.7);
            p.lineTo(0.05, -0.66);
            p.closePath();
        }, { light: false, outline: 0.03 });
        solid(c, "#1a1008", (p) => p.arc(0.2, -0.72, 0.035, 0, TAU), { light: false, outline: 0 });
    },

    cockerel(c, colour) {
        // Tail feathers in arcs, the body, the red comb and wattle
        for (let k = 0; k < 4; k++) {
            solid(c, k % 2 ? "#2f5a3a" : "#1f3a52", (p) => {
                p.moveTo(-0.3, 0.1);
                p.quadraticCurveTo(-0.9 + k * 0.08, -0.5 - k * 0.12, -0.5 + k * 0.1, -0.8 + k * 0.05);
                p.quadraticCurveTo(-0.6 + k * 0.1, -0.35, -0.15, 0.15);
            }, { outline: 0.04 });
        }

        solid(c, colour, (p) => {
            p.moveTo(-0.35, 0.1);
            p.bezierCurveTo(-0.3, 0.55, 0.45, 0.55, 0.45, 0.05);
            p.bezierCurveTo(0.55, -0.15, 0.5, -0.45, 0.35, -0.5);
            p.bezierCurveTo(0.2, -0.55, 0.15, -0.3, 0.2, -0.1);
            p.bezierCurveTo(0.05, -0.05, -0.2, -0.05, -0.35, 0.1);
        });
        solid(c, "#c0302a", (p) => {
            p.moveTo(0.22, -0.5);
            p.lineTo(0.25, -0.68);
            p.lineTo(0.32, -0.56);
            p.lineTo(0.38, -0.7);
            p.lineTo(0.42, -0.52);
            p.closePath();
            p.moveTo(0.5, -0.35);
            p.quadraticCurveTo(0.6, -0.2, 0.47, -0.2);
        }, { light: false, outline: 0.03 });
        line(c, "#d8a02a", 0.05, [[0.02, 0.45], [0.02, 0.8], [0.12, 0.85]]);
        line(c, "#d8a02a", 0.05, [[0.18, 0.45], [0.2, 0.8], [0.3, 0.85]]);
        solid(c, "#1a1008", (p) => p.arc(0.36, -0.35, 0.035, 0, TAU), { light: false, outline: 0 });
    },

    dragon(c, colour) {
        // A wyvern rampant: wings up, tail curled to an arrowhead
        solid(c, shade(colour, 0.8), (p) => {
            p.moveTo(-0.1, -0.2);
            p.lineTo(-0.75, -0.9);
            p.lineTo(-0.6, -0.5);
            p.lineTo(-0.9, -0.55);
            p.lineTo(-0.65, -0.25);
            p.lineTo(-0.85, -0.15);
            p.lineTo(-0.3, 0);
            p.closePath();
        });
        solid(c, colour, (p) => {
            p.moveTo(0.15, -0.6);
            p.bezierCurveTo(0.4, -0.75, 0.6, -0.6, 0.7, -0.5);
            p.lineTo(0.45, -0.45);
            p.bezierCurveTo(0.3, -0.35, 0.3, -0.1, 0.35, 0.1);
            p.bezierCurveTo(0.45, 0.4, 0.25, 0.6, -0.05, 0.55);
            p.bezierCurveTo(-0.45, 0.5, -0.6, 0.75, -0.35, 0.85);
            p.lineTo(-0.3, 0.72);
            p.lineTo(-0.15, 0.95);
            p.lineTo(-0.45, 0.95);
            p.bezierCurveTo(-0.8, 0.8, -0.6, 0.35, -0.2, 0.35);
            p.bezierCurveTo(-0.05, 0.3, 0.0, 0.0, -0.05, -0.2);
            p.bezierCurveTo(-0.05, -0.45, 0.0, -0.55, 0.15, -0.6);
        });
        solid(c, "#f0c040", (p) => p.arc(0.3, -0.58, 0.04, 0, TAU), { light: false, outline: 0 });
    },

    crown(c, colour) {
        solid(c, colour, (p) => {
            p.moveTo(-0.75, 0.45);
            p.lineTo(-0.8, -0.35);
            p.lineTo(-0.45, 0.0);
            p.lineTo(-0.25, -0.55);
            p.lineTo(0, -0.05);
            p.lineTo(0.25, -0.55);
            p.lineTo(0.45, 0.0);
            p.lineTo(0.8, -0.35);
            p.lineTo(0.75, 0.45);
            p.closePath();
        });

        for (const [x, y] of [[-0.8, -0.4], [-0.25, -0.6], [0.25, -0.6], [0.8, -0.4], [0, -0.1]]) {
            solid(c, colour, (p) => p.arc(x, y, 0.08, 0, TAU));
        }

        solid(c, "#b02a2a", (p) => p.rect(-0.75, 0.25, 1.5, 0.2), { outline: 0.04 });

        for (const x of [-0.45, 0, 0.45]) {
            solid(c, x ? "#2a5ab0" : "#2a9a4a", (p) => p.arc(x, 0.35, 0.06, 0, TAU), { outline: 0.03 });
        }
    },

    moon(c, colour) {
        solid(c, colour, (p) => {
            p.arc(0, 0, 0.8, Math.PI * 0.35, Math.PI * 1.65);
            p.arc(0.35, 0, 0.62, Math.PI * 1.45, Math.PI * 0.55, true);
            p.closePath();
        });
    },

    sun(c, colour) {
        solid(c, colour, (p) => {
            for (let k = 0; k < 12; k++) {
                const [a, b, t] = [((k - 0.25) / 12) * TAU, ((k + 0.25) / 12) * TAU, ((k + 0) / 12) * TAU];

                p.moveTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5);
                p.lineTo(Math.cos(t) * (k % 2 ? 0.8 : 0.95), Math.sin(t) * (k % 2 ? 0.8 : 0.95));
                p.lineTo(Math.cos(b) * 0.5, Math.sin(b) * 0.5);
            }
        });
        solid(c, colour, (p) => p.arc(0, 0, 0.52, 0, TAU));
    },

    star(c, colour) {
        solid(c, colour, (p) => {
            for (let k = 0; k < 10; k++) {
                const [r, a] = [k % 2 ? 0.38 : 0.9, (k / 10) * TAU - Math.PI / 2];

                p[k ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r);
            }

            p.closePath();
        });
    },

    keys(c, colour) {
        for (const side of [-1, 1]) {
            c.save();
            c.rotate(side * 0.7);
            solid(c, colour, (p) => {
                p.arc(0, -0.62, 0.22, 0, TAU);
                p.moveTo(0.06, -0.4);
                p.rect(-0.06, -0.42, 0.12, 1.2);
                p.rect(0.06, 0.55, 0.22, 0.1);
                p.rect(0.06, 0.68, 0.16, 0.1);
            });
            solid(c, "#3a2a1a", (p) => p.arc(0, -0.62, 0.1, 0, TAU), { light: false, outline: 0.02 });
            c.restore();
        }
    },

    bell(c, colour) {
        solid(c, colour, (p) => {
            p.moveTo(-0.12, -0.78);
            p.lineTo(0.12, -0.78);
            p.bezierCurveTo(0.45, -0.7, 0.45, 0.2, 0.7, 0.45);
            p.lineTo(-0.7, 0.45);
            p.bezierCurveTo(-0.45, 0.2, -0.45, -0.7, -0.12, -0.78);
        });
        solid(c, colour, (p) => p.arc(0, 0.58, 0.13, 0, TAU));
        line(c, "rgba(20, 12, 6, 0.8)", 0.05, [[-0.62, 0.35], [0.62, 0.35]]);
    },

    anchor(c, colour) {
        solid(c, colour, (p) => {
            p.arc(0, -0.72, 0.15, 0, TAU);
            p.moveTo(0.06, -0.55);
            p.rect(-0.07, -0.57, 0.14, 1.25);
            p.rect(-0.45, -0.4, 0.9, 0.12);
        });
        solid(c, colour, (p) => {
            p.moveTo(-0.72, 0.15);
            p.quadraticCurveTo(-0.6, 0.75, 0, 0.78);
            p.quadraticCurveTo(0.6, 0.75, 0.72, 0.15);
            p.lineTo(0.85, 0.32);
            p.lineTo(0.75, -0.05);
            p.lineTo(0.5, 0.15);
            p.lineTo(0.6, 0.2);
            p.quadraticCurveTo(0.5, 0.6, 0, 0.62);
            p.quadraticCurveTo(-0.5, 0.6, -0.6, 0.2);
            p.lineTo(-0.5, 0.15);
            p.lineTo(-0.75, -0.05);
            p.lineTo(-0.85, 0.32);
            p.closePath();
        });
    },

    tankard(c, colour) {
        solid(c, colour, (p) => {
            p.moveTo(0.35, -0.35);
            p.bezierCurveTo(0.85, -0.35, 0.85, 0.45, 0.35, 0.4);
            p.lineTo(0.35, 0.26);
            p.bezierCurveTo(0.68, 0.28, 0.68, -0.2, 0.35, -0.2);
            p.closePath();
        });
        solid(c, colour, (p) => p.rect(-0.5, -0.45, 0.88, 1.2));

        for (const y of [-0.3, 0.55]) {
            line(c, "rgba(20, 12, 6, 0.8)", 0.05, [[-0.5, y], [0.38, y]]);
        }

        solid(c, "#f6f0e2", (p) => {
            p.moveTo(-0.58, -0.4);
            p.bezierCurveTo(-0.7, -0.8, -0.25, -0.85, -0.1, -0.7);
            p.bezierCurveTo(0.05, -0.95, 0.5, -0.85, 0.46, -0.4);
            p.closePath();
        }, { light: false, outline: 0.04 });
    },

    barrel(c, colour) {
        solid(c, colour, (p) => {
            p.moveTo(-0.45, -0.75);
            p.quadraticCurveTo(-0.72, 0, -0.45, 0.75);
            p.lineTo(0.45, 0.75);
            p.quadraticCurveTo(0.72, 0, 0.45, -0.75);
            p.closePath();
        });

        for (const x of [-0.25, 0, 0.25]) {
            line(c, "rgba(40, 24, 12, 0.6)", 0.03, [[x, -0.73], [x * 1.3, 0], [x, 0.73]]);
        }

        for (const y of [-0.5, 0.5]) {
            line(c, "#3a3a3e", 0.1, [[-0.56, y], [0.56, y]]);
        }
    },

    horseshoe(c, colour) {
        solid(c, colour, (p) => {
            p.arc(0, -0.05, 0.75, Math.PI * 0.85, Math.PI * 2.15, false);
            p.lineTo(0.55, 0.75);
            p.lineTo(0.3, 0.75);
            p.arc(0, -0.05, 0.45, Math.PI * 2.15, Math.PI * 0.85, true);
            p.lineTo(-0.3, 0.75);
            p.lineTo(-0.55, 0.75);
            p.closePath();
        });

        for (let k = 0; k < 6; k++) {
            const a = Math.PI * (0.95 + (k / 5) * 1.1);

            solid(c, "#1a1008", (p) => p.arc(Math.cos(a) * 0.6, -0.05 + Math.sin(a) * 0.6, 0.04, 0, TAU), { light: false, outline: 0 });
        }
    },

    sword(c, colour) {
        c.save();
        c.rotate(-0.35);
        solid(c, "#d8dde2", (p) => {
            p.moveTo(-0.08, -0.35);
            p.lineTo(-0.08, 0.72);
            p.lineTo(0, 0.95);
            p.lineTo(0.08, 0.72);
            p.lineTo(0.08, -0.35);
            p.closePath();
        });
        solid(c, colour, (p) => p.rect(-0.4, -0.42, 0.8, 0.1));
        solid(c, "#5a3a22", (p) => p.rect(-0.06, -0.8, 0.12, 0.38));
        solid(c, colour, (p) => p.arc(0, -0.85, 0.1, 0, TAU));
        c.restore();
    },

    ship(c, colour) {
        line(c, "#5a3a22", 0.07, [[0, 0.3], [0, -0.9]]);
        solid(c, "#f2ead8", (p) => {
            p.moveTo(-0.05, -0.8);
            p.quadraticCurveTo(-0.55, -0.3, -0.05, 0.2);
            p.closePath();
            p.moveTo(0.05, -0.8);
            p.quadraticCurveTo(0.65, -0.35, 0.05, 0.2);
            p.closePath();
        }, { outline: 0.04 });
        solid(c, colour, (p) => {
            p.moveTo(-0.9, 0.2);
            p.lineTo(0.9, 0.2);
            p.quadraticCurveTo(0.7, 0.7, 0.4, 0.7);
            p.lineTo(-0.4, 0.7);
            p.quadraticCurveTo(-0.7, 0.7, -0.9, 0.2);
        });
        line(c, "#3c5a7a", 0.06, [[-0.9, 0.82], [-0.5, 0.78], [-0.1, 0.84], [0.3, 0.78], [0.9, 0.82]]);
    },

    rose(c, colour) {
        for (let k = 0; k < 5; k++) {
            const a = (k / 5) * TAU - Math.PI / 2;

            solid(c, colour, (p) => p.arc(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0.42, 0, TAU));
        }

        for (let k = 0; k < 5; k++) {
            const a = (k / 5) * TAU - Math.PI / 2 + TAU / 10;

            solid(c, shade(colour, 1.25), (p) => p.arc(Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.22, 0, TAU), { outline: 0.04 });
        }

        solid(c, "#e0b040", (p) => p.arc(0, 0, 0.13, 0, TAU), { outline: 0.03 });

        for (let k = 0; k < 5; k++) {
            const a = (k / 5) * TAU - Math.PI / 2 + TAU / 10;

            solid(c, "#3f7a34", (p) => {
                p.moveTo(Math.cos(a) * 0.6, Math.sin(a) * 0.6);
                p.lineTo(Math.cos(a) * 0.95, Math.sin(a) * 0.95);
                p.lineTo(Math.cos(a + 0.12) * 0.62, Math.sin(a + 0.12) * 0.62);
                p.closePath();
            }, { outline: 0.02 });
        }
    },

    oak(c, colour) {
        solid(c, "#5a3a22", (p) => {
            p.moveTo(-0.14, 0.9);
            p.lineTo(-0.1, 0.1);
            p.lineTo(-0.35, -0.1);
            p.lineTo(0.0, 0.0);
            p.lineTo(0.3, -0.12);
            p.lineTo(0.1, 0.1);
            p.lineTo(0.14, 0.9);
            p.closePath();
        });

        for (const [x, y, r] of [[-0.45, -0.25, 0.35], [0.45, -0.25, 0.35], [0, -0.5, 0.42], [-0.25, -0.65, 0.3], [0.28, -0.62, 0.3], [0, -0.2, 0.3]]) {
            solid(c, colour, (p) => p.arc(x, y, r, 0, TAU), { outline: 0.05 });
        }

        for (const [x, y] of [[-0.3, -0.1], [0.35, -0.05], [0.05, -0.75]]) {
            solid(c, "#b0782a", (p) => p.ellipse(x, y, 0.06, 0.08, 0, 0, TAU), { outline: 0.02 });
        }
    },

    lantern(c, colour) {
        solid(c, "#f6d270", (p) => p.rect(-0.35, -0.4, 0.7, 0.9), { light: false, outline: 0.04 });
        c.save();
        c.globalAlpha = 0.5;
        solid(c, "#fff3c0", (p) => p.arc(0, 0.05, 0.25, 0, TAU), { light: false, outline: 0 });
        c.restore();
        solid(c, colour, (p) => {
            p.moveTo(-0.5, -0.4);
            p.lineTo(0, -0.8);
            p.lineTo(0.5, -0.4);
            p.closePath();
            p.rect(-0.45, 0.5, 0.9, 0.12);
        });

        for (const x of [-0.37, 0, 0.37]) {
            line(c, shade(colour, 0.7), 0.06, [[x, -0.4], [x, 0.5]]);
        }

        solid(c, colour, (p) => p.arc(0, -0.88, 0.1, 0, TAU));
    },

    harp(c, colour) {
        solid(c, colour, (p) => {
            p.moveTo(-0.55, 0.85);
            p.lineTo(-0.55, -0.7);
            p.bezierCurveTo(-0.2, -0.95, 0.3, -0.4, 0.65, -0.55);
            p.lineTo(0.6, -0.38);
            p.bezierCurveTo(0.3, -0.25, -0.2, -0.65, -0.4, -0.55);
            p.lineTo(-0.4, 0.7);
            p.lineTo(0.5, 0.7);
            p.lineTo(0.6, -0.4);
            p.lineTo(0.66, -0.4);
            p.lineTo(0.58, 0.85);
            p.closePath();
        });

        for (let k = 0; k < 6; k++) {
            const x = -0.3 + k * 0.15;

            line(c, "#f2ead8", 0.025, [[x, -0.55 + k * 0.02], [x, 0.7]]);
        }
    },

    // The trades', and the guild's
    anvil(c, colour) {
        solid(c, colour, (p) => {
            p.moveTo(-0.9, -0.3);
            p.lineTo(0.7, -0.3);
            p.lineTo(0.7, -0.05);
            p.quadraticCurveTo(0.25, -0.05, 0.2, 0.15);
            p.lineTo(0.35, 0.55);
            p.lineTo(0.55, 0.55);
            p.lineTo(0.55, 0.75);
            p.lineTo(-0.55, 0.75);
            p.lineTo(-0.55, 0.55);
            p.lineTo(-0.35, 0.55);
            p.lineTo(-0.2, 0.15);
            p.quadraticCurveTo(-0.3, -0.05, -0.55, -0.1);
            p.closePath();
        });
        // A hammer over it
        c.save();
        c.rotate(0.6);
        solid(c, "#6b4a32", (p) => p.rect(0.2, -1.05, 0.08, 0.7));
        solid(c, "#7a7e86", (p) => p.rect(0.02, -1.12, 0.44, 0.18));
        c.restore();
    },

    shield(c, colour) {
        // Crossed swords behind a shield
        for (const side of [-1, 1]) {
            c.save();
            c.rotate(side * 0.75);
            solid(c, "#d8dde2", (p) => p.rect(-0.05, -0.95, 0.1, 1.7));
            solid(c, "#c9a13b", (p) => p.rect(-0.25, 0.55, 0.5, 0.08));
            solid(c, "#5a3a22", (p) => p.rect(-0.05, 0.63, 0.1, 0.3));
            c.restore();
        }

        solid(c, colour, (p) => {
            p.moveTo(-0.5, -0.55);
            p.lineTo(0.5, -0.55);
            p.lineTo(0.5, 0.05);
            p.quadraticCurveTo(0.45, 0.5, 0, 0.75);
            p.quadraticCurveTo(-0.45, 0.5, -0.5, 0.05);
            p.closePath();
        });
        solid(c, "#c9a13b", (p) => {
            p.rect(-0.07, -0.5, 0.14, 1.15);
            p.rect(-0.45, -0.18, 0.9, 0.14);
        }, { outline: 0.03 });
    },

    sunburst(c, colour) {
        // The Six's mark: a sun of six rays, a flame at its heart
        solid(c, colour, (p) => {
            for (let k = 0; k < 6; k++) {
                const a = (k / 6) * TAU - Math.PI / 2;

                p.moveTo(Math.cos(a - 0.22) * 0.45, Math.sin(a - 0.22) * 0.45);
                p.lineTo(Math.cos(a) * 0.95, Math.sin(a) * 0.95);
                p.lineTo(Math.cos(a + 0.22) * 0.45, Math.sin(a + 0.22) * 0.45);
            }
        });
        solid(c, colour, (p) => p.arc(0, 0, 0.48, 0, TAU));
        solid(c, "#e8662a", (p) => {
            p.moveTo(0, -0.32);
            p.bezierCurveTo(0.28, -0.05, 0.25, 0.3, 0, 0.32);
            p.bezierCurveTo(-0.25, 0.3, -0.28, -0.05, 0, -0.32);
        }, { outline: 0.03 });
    },
};

/** The emblems there's a painter for. */
export const EMBLEM_NAMES = Object.freeze(Object.keys(PAINTERS));

/**
 * Paint an emblem on a canvas's context: its middle at (x, y), `size` pixels across, in
 * `colour` (a "#rrggbb"), `count` of them (set out round the middle, smaller, for a sign like
 * The Three Bells).
 */
export function paintEmblem(context, name, { x, y, size, colour = "#c9a13b", count = 1 }) {
    const painter = PAINTERS[name] ?? PAINTERS.star;
    const places = count <= 1 ? [[0, 0, 1]] : Array.from({ length: Math.min(count, 7) }, (_, k, all) => {
        const shown = all.length;

        if (shown === 2) {
            return [(k - 0.5) * 0.9, 0, 0.5];
        }

        if (shown === 3) {
            return [[-0.5, -0.35], [0.5, -0.35], [0, 0.45]][k].concat(0.45);
        }

        const angle = (k / shown) * TAU - Math.PI / 2;

        return [Math.cos(angle) * 0.62, Math.sin(angle) * 0.62, 0.34];
    });

    for (const [dx, dy, scale] of places) {
        context.save();
        context.translate(x + (dx * size) / 2, y + (dy * size) / 2);
        context.scale((size / 2) * scale, (size / 2) * scale);
        painter(context, colour);
        context.restore();
    }
}

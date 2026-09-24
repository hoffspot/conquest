// Helpers shared by the tests.

/** Parse a grid from strings: "#" is obstructed, anything else is passable. */
export function parseGrid(rows) {
    return rows.map((row) => [...row].map((cell) => (cell === "#" ? 1 : 0)));
}

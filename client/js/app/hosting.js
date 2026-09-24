// Where the multiplayer server is.
//
// The Node server (npm start) serves the game and runs the multiplayer lobby, so by default the
// game connects back to the address it was loaded from ("same-origin"). A static web host such as
// GitHub Pages can't run the server: the Pages workflow replaces this file with null (no
// multiplayer, the menu only offers the campaign) or the wss:// address of a server hosted
// elsewhere.
export const MULTIPLAYER_SERVER = "same-origin";

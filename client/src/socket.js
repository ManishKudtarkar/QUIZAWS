import { io } from "socket.io-client";

// Same-origin connection. In dev, Vite proxies /socket.io to the Node server.
export const socket = io("/", {
  autoConnect: true,
  transports: ["websocket", "polling"],
});

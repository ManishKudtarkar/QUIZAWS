import React, { useState } from "react";
import Home from "./screens/Home.jsx";
import HostGame from "./screens/HostGame.jsx";
import PlayerGame from "./screens/PlayerGame.jsx";

// Top-level router. Keeps things simple with a small state machine:
//   "home"   -> choose to host or join
//   "host"   -> build quiz + run the game
//   "player" -> join with PIN + play
// If the URL carries a ?pin= (from a scanned QR code), jump straight to Join.
function initialMode() {
  try {
    return new URLSearchParams(window.location.search).get("pin")
      ? "player"
      : "home";
  } catch {
    return "home";
  }
}

export default function App() {
  const [mode, setMode] = useState(initialMode());

  if (mode === "host") return <HostGame onExit={() => setMode("home")} />;
  if (mode === "player") return <PlayerGame onExit={() => setMode("home")} />;
  return <Home onHost={() => setMode("host")} onJoin={() => setMode("player")} />;
}

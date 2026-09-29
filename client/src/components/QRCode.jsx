import React, { useEffect, useRef } from "react";
import QR from "qrcode";

// Renders the given text as a QR code onto a canvas.
export default function QRCode({ text, size = 200 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !text) return;
    QR.toCanvas(canvasRef.current, text, {
      width: size,
      margin: 1,
      color: { dark: "#1a1a2e", light: "#ffffff" },
    }).catch(() => {
      // Rendering failure is non-fatal; the PIN is still shown as a fallback.
    });
  }, [text, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ borderRadius: 12, background: "#fff", padding: 8 }}
    />
  );
}

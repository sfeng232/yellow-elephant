"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** The join link for a game (based on the address this page was opened from) and its QR code. */
export function useJoinUrl(code: string, width = 360) {
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    const joinUrl = `${window.location.origin}/join?code=${code}`;
    QRCode.toDataURL(joinUrl, { margin: 1, width, color: { dark: "#123a2a", light: "#ffffff" } })
      .catch(() => null)
      .then((dataUrl) => {
        setUrl(joinUrl);
        setQr(dataUrl);
      });
  }, [code, width]);
  return { url, qr };
}

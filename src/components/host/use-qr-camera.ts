"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

export type CameraState = "idle" | "starting" | "scanning" | "unsupported" | "denied" | "error";

/**
 * Scan QR codes with the device camera using the browser's built-in BarcodeDetector (Chrome,
 * Edge, Android). Calls `onCode` with each new value; the same value is ignored for a few seconds
 * so a ticket held in front of the camera checks in once.
 */
export function useQrCamera(onCode: (value: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastRef = useRef<{ value: string; at: number } | null>(null);
  const onCodeRef = useRef(onCode);
  const [state, setState] = useState<CameraState>("idle");

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  const stop = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState((s) => (s === "scanning" || s === "starting" ? "idle" : s));
  }, []);

  const start = useCallback(async () => {
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) return setState("unsupported");
    try {
      const formats = (await Ctor.getSupportedFormats?.()) ?? ["qr_code"];
      if (!formats.includes("qr_code")) return setState("unsupported");
    } catch {
      return setState("unsupported");
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const detector = new Ctor({ formats: ["qr_code"] });
      let busy = false;
      timerRef.current = window.setInterval(async () => {
        if (busy || video.readyState < 2) return;
        busy = true;
        try {
          const [hit] = await detector.detect(video);
          const value = hit?.rawValue?.trim();
          const now = Date.now();
          if (value && !(lastRef.current && lastRef.current.value === value && now - lastRef.current.at < 4000)) {
            lastRef.current = { value, at: now };
            onCodeRef.current(value);
          }
        } catch {
          // A frame that can't be read; try the next one.
        } finally {
          busy = false;
        }
      }, 250);
      setState("scanning");
    } catch (e) {
      stop();
      setState((e as Error).name === "NotAllowedError" ? "denied" : "error");
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { videoRef, state, start, stop };
}

/** Ticket QR codes carry `LOCAL:{code}`; also accept a bare booking code. */
export function bookingCodeFromQr(value: string): string | null {
  const m = /^(?:LOCAL:)?(LC[A-Z0-9]{5,8})$/i.exec(value.trim());
  return m ? m[1].toUpperCase() : null;
}

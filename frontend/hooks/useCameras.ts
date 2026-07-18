"use client";

import { useEffect, useState } from "react";

export interface CameraDevice {
  deviceId: string;
  label: string;
}

/**
 * Lists available video input devices (built-in webcam, plus any iPhone-as-webcam
 * bridge like Camo / iVCam / DroidCam). Device labels are only populated after
 * camera permission has been granted once, so before that they fall back to
 * "Camera N".
 */
export function useCameras(): CameraDevice[] {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return;

    let active = true;
    async function load() {
      try {
        const devices = await md.enumerateDevices();
        if (!active) return;
        const cams = devices
          .filter((d) => d.kind === "videoinput")
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${i + 1}`,
          }));
        setCameras(cams);
      } catch {
        // ignore — enumeration can fail before permission is granted
      }
    }

    load();
    md.addEventListener?.("devicechange", load);
    return () => {
      active = false;
      md.removeEventListener?.("devicechange", load);
    };
  }, []);

  return cameras;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Btn } from "./Btn";

/**
 * Take a player's photo with the phone's or the computer's camera (spec 3.2, O-18): a live preview in the
 * app's own centred card, Snap, then Retake or Use. The back camera first — the organiser photographs the
 * player — with a switch for the front one or a laptop's webcam. Without a camera, or with permission
 * refused, the card says so and offers the file picker instead.
 *
 * `shrink` is the edit sheet's crop-and-resize, so a snapshot is stored exactly like a chosen photo.
 */
export function CameraCapture({
  shrink,
  onUse,
  onChooseFile,
  onClose,
}: {
  shrink: (source: ImageBitmapSource) => Promise<Blob>;
  onUse: (photo: Blob) => void;
  onChooseFile: () => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [failure, setFailure] = useState<string | null>(null);
  // Only opened after a tap, so this never runs on the server.
  const noCamera = !navigator.mediaDevices?.getUserMedia;
  const problem = failure ?? (noCamera ? "This browser cannot use a camera here." : null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);

  // Open the camera; close it again when the card goes, the camera flips, or a photo has been taken.
  useEffect(() => {
    if (shot || noCamera) return;
    let stream: MediaStream | null = null;
    let gone = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (gone) {
          for (const t of s.getTracks()) t.stop();
          return;
        }
        stream = s;
        if (video.current) video.current.srcObject = s;
        setFailure(null);
      })
      .catch((e: unknown) => {
        const name = e instanceof DOMException ? e.name : "";
        setFailure(
          name === "NotAllowedError"
            ? "Camera permission was refused. Allow the camera for this site in the browser settings, or choose a file."
            : name === "NotFoundError"
              ? "No camera was found on this device."
              : `The camera could not start${e instanceof Error ? `: ${e.message}` : "."}`,
        );
      });
    return () => {
      gone = true;
      for (const t of stream?.getTracks() ?? []) t.stop();
    };
  }, [facing, shot, noCamera]);

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const snap = async () => {
    if (!video.current) return;
    const blob = await shrink(video.current);
    setShot({ blob, url: URL.createObjectURL(blob) });
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet dialog camera" role="dialog" aria-modal="true" aria-label="Take photo" onClick={(e) => e.stopPropagation()}>
        <h2>Take photo</h2>
        {problem ? (
          <div className="error">{problem}</div>
        ) : shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="camera-view" src={shot.url} alt="The photo just taken" />
        ) : (
          <video ref={video} className="camera-view" autoPlay playsInline muted onLoadedData={() => setReady(true)} />
        )}
        <div className="row dialog-actions">
          {problem ? (
            <Btn className="primary" onClick={onChooseFile}>Choose a file</Btn>
          ) : shot ? (
            <>
              <Btn className="primary" onClick={() => onUse(shot.blob)}>Use photo</Btn>
              <Btn onClick={() => { setReady(false); setShot(null); }}>Retake</Btn>
            </>
          ) : (
            <>
              <Btn className="primary" disabled={!ready} onClick={() => snap().catch((e: unknown) => setFailure(e instanceof Error ? e.message : String(e)))}>Snap</Btn>
              <Btn onClick={() => { setReady(false); setFacing((f) => (f === "environment" ? "user" : "environment")); }}>Switch camera</Btn>
            </>
          )}
          <Btn onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Camera, Check, X } from "lucide-react";

export default function CameraCapture({ onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const nativeCameraInputRef = useRef(null);
  const streamRef = useRef(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraReady(false);
    setIsCameraOn(false);
  };

  useEffect(() => {
    if (!isCameraOn || !videoRef.current || !streamRef.current) return undefined;

    const video = videoRef.current;
    const markReady = () => setCameraReady(video.videoWidth > 0 && video.videoHeight > 0);

    video.srcObject = streamRef.current;
    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("canplay", markReady);
    video.play().catch(() => {
      setCameraError("The camera preview could not start. Try the device camera instead.");
    });

    return () => {
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("canplay", markReady);
    };
  }, [isCameraOn]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startCamera = async () => {
    setCameraError("");

    if (!window.isSecureContext) {
      setCameraError("Camera access requires a secure HTTPS connection.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      nativeCameraInputRef.current?.click();
      return;
    }

    try {
      stopCamera();

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
      });

      streamRef.current = mediaStream;
      setIsCameraOn(true);
    } catch (err) {
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
        setCameraError("Camera permission is blocked. Allow it in your browser settings, then try again.");
      } else if (err?.name === "NotFoundError" || err?.name === "OverconstrainedError") {
        setCameraError("No available camera was found on this device.");
      } else if (err?.name === "NotReadableError") {
        setCameraError("The camera is being used by another app. Close it there, then try again.");
      } else {
        setCameraError("The camera could not start. Try the device camera instead.");
      }
    }
  };

  const handleNativeCapture = (event) => {
    const capturedFile = event.target.files?.[0];
    event.target.value = "";

    if (capturedFile) {
      setCameraError("");
      onCapture(capturedFile);
    }
  };

  const capture = () => {
    if (!cameraReady || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      setCameraError("The photo could not be captured. Please try again.");
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError("The photo could not be captured. Please try again.");
        return;
      }

      const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" });
      onCapture(file);
      stopCamera();
    }, "image/jpeg", 0.92);
  };

  return (
    <div className="camera-wrapper">
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleNativeCapture}
        className="hidden"
        aria-label="Take a receipt photo with the device camera"
      />

      {!isCameraOn ? (
        <button
          type="button"
          onClick={startCamera}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 font-semibold text-ink transition hover:border-seal hover:text-sealDark dark:border-white/10 dark:bg-white/5 dark:text-white"
        >
          <Camera size={17} aria-hidden="true" />
          Use camera
        </button>
      ) : null}
      {cameraError && !isCameraOn && (
        <div className="mt-2 text-center" aria-live="polite">
          <p className="text-xs text-alarm">{cameraError}</p>
          <button
            type="button"
            onClick={() => nativeCameraInputRef.current?.click()}
            className="mt-2 text-xs font-semibold text-sealDark underline underline-offset-2 dark:text-seal"
          >
            Try device camera
          </button>
        </div>
      )}
      {isCameraOn && (
        <div className="relative overflow-hidden rounded-2xl border border-black/10 bg-black p-2 dark:border-white/10">
          <video ref={videoRef} className="aspect-[4/3] w-full rounded-xl object-cover" muted playsInline autoPlay />
          {!cameraReady && (
            <div className="absolute inset-x-2 top-2 flex aspect-[4/3] items-center justify-center rounded-xl bg-black text-sm text-white/70">
              Starting camera...
            </div>
          )}
          {cameraError && (
            <p className="mt-2 text-center text-xs text-white" aria-live="polite">{cameraError}</p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={capture}
              disabled={!cameraReady}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-seal py-2.5 font-semibold text-[#10201a] disabled:cursor-wait disabled:opacity-50"
            >
              <Check size={16} aria-hidden="true" />
              Take Photo
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 font-semibold text-white"
            >
              <X size={16} aria-hidden="true" />
              Cancel
            </button>
          </div>
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
      )}
    </div>
  );
}

import { useRef, useState } from "react";
import { Camera, Check, X } from "lucide-react";

export default function CameraCapture({ onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const startCamera = async () => {
    setCameraError("");
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
      setIsCameraOn(true);
    } catch (err) {
      setCameraError("Camera access denied. Please allow camera permissions.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsCameraOn(false);
    }
  };

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      const file = new File([blob], "camera-capture.png", { type: "image/png" });
      onCapture(file);
      stopCamera();
    }, "image/png");
  };

  return (
    <div className="camera-wrapper">
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
        <p className="text-xs text-alarm mt-2 text-center">{cameraError}</p>
      )}
      {isCameraOn && (
        <div className="relative overflow-hidden rounded-2xl border border-black/10 bg-black p-2 dark:border-white/10">
          <video ref={videoRef} className="aspect-[4/3] w-full rounded-xl object-cover" muted playsInline />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={capture}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-seal py-2.5 font-semibold text-[#10201a]"
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

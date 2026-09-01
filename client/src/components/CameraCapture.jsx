import { useRef, useState } from "react";

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
          onClick={startCamera}
          className="w-full py-3 bg-seal text-ink font-medium rounded-xl border border-black/10"
        >
          📷 Open Camera
        </button>
      ) : null}
      {cameraError && !isCameraOn && (
        <p className="text-xs text-alarm mt-2 text-center">{cameraError}</p>
      )}
      {isCameraOn && (
        <div className="relative">
          <video ref={videoRef} className="w-full rounded-lg border border-black/10" muted />
          <div className="flex gap-2 mt-2">
            <button
              onClick={capture}
              className="flex-1 bg-ink text-paper py-2 rounded-lg"
            >
              Take Photo
            </button>
            <button
              onClick={stopCamera}
              className="flex-1 bg-alarm/10 text-alarm py-2 rounded-lg"
            >
              Cancel
            </button>
          </div>
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
      )}
    </div>
  );
}
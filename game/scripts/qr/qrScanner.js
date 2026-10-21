// Fine couche autour de la lib tierce html5-qrcode (scripts/qrCodeReader.js,
// chargée en <script> classique avant ce module ES : elle expose la
// globale window.Html5QrcodeScanner).

let mainScanner = null;

export function getMainScanner() {
  if (!mainScanner) {
    mainScanner = new Html5QrcodeScanner(
      'qrCodeReader',
      { fps: 10, qrbox: { width: 200, height: 200 }, rememberLastUsedCamera: true }
    );
  }
  return mainScanner;
}

export function createScanner(elementId) {
  return new Html5QrcodeScanner(
    elementId,
    { fps: 10, qrbox: { width: 200, height: 200 }, rememberLastUsedCamera: true }
  );
}

export function stopCameraDirectly() {
  const videoElem = document.querySelector('video');
  if (videoElem && videoElem.srcObject) {
    videoElem.srcObject.getTracks().forEach(track => track.stop());
    videoElem.srcObject = null;
  }
}

export function clearMainScanner() {
  if (mainScanner) mainScanner.clear();
  stopCameraDirectly();
}

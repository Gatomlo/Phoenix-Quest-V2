// Verrou "selector" : zones cliquables (hotspots) positionnées sur une image.
import { scenarioImg } from '../ui/render.js';
import { bullseyeIcon } from '../ui/icons.js';

export function insertSelector(step) {
  document.getElementById('contentImg').innerHTML =
    `<div id="imgHotsop" class="hotspot-container"><img id="hotspotImage" class="stepImg with-hotspots" src="${scenarioImg(step.media)}"></div>`;

  const buttonsToAdd = step.lockCode;
  const img = document.getElementById('hotspotImage');

  function placeHotspots() {
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;
    const container = document.getElementById('imgHotsop');
    buttonsToAdd.forEach((thisButton) => {
      const styleString = thisButton[0];
      const topMatch = styleString.match(/top:\s*(\d+)px/);
      const leftMatch = styleString.match(/left:\s*(\d+)px/);
      if (!topMatch || !leftMatch) {
        console.error('Format de style invalide:', styleString);
        return;
      }
      const topPercent = (parseFloat(topMatch[1]) / imgHeight) * 100;
      const leftPercent = (parseFloat(leftMatch[1]) / imgWidth) * 100;
      const size = Math.min(parseInt(thisButton[3], 10) || 32, 64);
      const hotspot = document.createElement('div');
      hotspot.style.top = topPercent + '%';
      hotspot.style.left = leftPercent + '%';
      hotspot.dataset.value = thisButton[1];
      hotspot.className = 'hotspotButton';
      hotspot.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="${thisButton[2]}" class="bi bi-bullseye" viewBox="0 0 16 16">${bullseyeIcon}</svg>`;
      container.appendChild(hotspot);
    });
  }

  if (img.complete) placeHotspots();
  else img.addEventListener('load', placeHotspots, { once: true });
}

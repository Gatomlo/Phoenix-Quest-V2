// Gestion générique des modals natives <dialog> et du toast d'erreur,
// en remplacement du JS de Bootstrap (bootstrap.bundle.js).

export function openModal(id) {
  const dialog = document.getElementById(id);
  if (dialog && !dialog.open) dialog.showModal();
}

export function closeModal(id) {
  const dialog = document.getElementById(id);
  if (dialog && dialog.open) dialog.close();
}

let toastTimeout = null;
export function showErrorToast() {
  const toast = document.getElementById('myToast');
  if (!toast) return;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 4000);
}

export function initDialogs() {
  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-open-modal]');
    if (opener) {
      openModal(opener.dataset.openModal);
      return;
    }
    const closer = event.target.closest('[data-close-modal]');
    if (closer) {
      const dialog = closer.closest('dialog');
      if (dialog) dialog.close();
      return;
    }
    if (event.target.closest('[data-close-toast]')) {
      document.getElementById('myToast')?.classList.remove('show');
      return;
    }
    // Fermeture au clic sur le fond (comportement des modals Bootstrap)
    if (event.target.tagName === 'DIALOG' && event.target.hasAttribute('open')) {
      event.target.close();
    }
  });
}

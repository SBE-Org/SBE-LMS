/**
 * Saves the certificate on screen as an A4 landscape PDF.
 *
 * Built in the browser so it uses the device's own fonts — Amharic and other
 * non-Latin names come out correctly. The PDF libraries are loaded only when
 * someone clicks Download, so normal pages stay light.
 */
const WIDTH = 1050; // px; the certificate's design width

/** Waits for the certificate's images (logo, signatures, seal) so they are not missing from the PDF. */
async function imagesReady(element) {
  await Promise.all([...element.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
}
const HEIGHT = Math.round(WIDTH / 1.414); // A4 proportions

export async function downloadCertificatePdf(element, filename) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  if (document.fonts?.ready) await document.fonts.ready;
  await imagesReady(element);

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    // A wide virtual window so the sizes in the stylesheet resolve to their full desktop values,
    // even when downloading from a phone.
    windowWidth: 1400,
    windowHeight: 1000,
    onclone(doc, el) {
      el.classList.add('cert-pdf');
      // Logo placement for downloaded PDFs is set separately from the on-screen certificate.
      el.querySelectorAll('.cert-logo').forEach((logo) => {
        if (logo.dataset.pdf === 'false') logo.remove();
        else if (logo.dataset.screen === 'false') logo.style.display = 'flex'; // shown only in the PDF
      });
      el.style.width = `${WIDTH}px`;
      el.style.height = `${HEIGHT}px`;
      // SVG icons use "currentColor", which is lost when they are drawn as images.
      el.querySelectorAll('svg').forEach((svg) => {
        const color = doc.defaultView.getComputedStyle(svg).color;
        svg.setAttribute('stroke', color);
        svg.style.color = color;
      });
    },
  });

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageW, pageH);
  pdf.setProperties({ title: filename.replace(/\.pdf$/i, '') });
  pdf.save(filename);
}

/** A CR80 card standing up, in millimetres. */
export const CARD_MM = [54, 85.6] as const;

/**
 * A PDF of card faces, one per page at card size, made in the browser and downloaded as
 * `fileName`.pdf. Each face is pictured as it shows on screen (colours, Bangla, the photo), so
 * nothing is sent anywhere. `scale` is pixels per CSS pixel (6 is about 575 dpi); `jpeg` keeps a
 * batch of many cards small.
 */
export async function downloadCardPdf(faces: HTMLElement[], fileName: string, { scale = 6, jpeg = false } = {}): Promise<void> {
  // Loaded only when asked for, so the pages stay light.
  const [{ toJpeg, toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const doc = new jsPDF({ unit: "mm", format: [...CARD_MM], orientation: "portrait", compress: true });
  for (const [i, face] of faces.entries()) {
    const image = jpeg ? await toJpeg(face, { pixelRatio: scale, quality: 0.92, cacheBust: true }) : await toPng(face, { pixelRatio: scale, cacheBust: true });
    if (i > 0) doc.addPage([...CARD_MM], "portrait");
    doc.addImage(image, jpeg ? "JPEG" : "PNG", 0, 0, CARD_MM[0], CARD_MM[1]);
  }
  doc.save(`${fileName}.pdf`);
}

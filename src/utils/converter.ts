/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';

/**
 * Cleanly generates a PDF from text or HTML blocks client-side
 * and triggers a native download prompt.
 */
export function convertDocumentToPDF(title: string, rawContent: string, format: string) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Standard margins
  const marginLeft = 20;
  const marginTop = 20;
  const pageWidth = 170; // Printable A4 width inside margins (210 - 40)
  const pageHeight = 250; // Printable height inside margins (297 - 47)

  // Document Title Header text
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(17, 24, 39); // deep slate/gray-900
  doc.text(title.replace(/\.[^/.]+$/, ""), marginLeft, marginTop);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128); // gray-500
  doc.text(`Format: ${format.toUpperCase()}  |  Compiled: ${new Date().toLocaleDateString()} via Document Yanga`, marginLeft, marginTop + 6);

  // Line Spacer
  doc.setDrawColor(229, 231, 235); // gray-205
  doc.line(marginLeft, marginTop + 10, marginLeft + pageWidth, marginTop + 10);

  // Parse and strip HTML nodes from mammoth DOCX outputs for standard clean PDF printing
  let printableText = rawContent;
  if (format === 'docx' || rawContent.includes('<')) {
    printableText = rawContent
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<h[1-6][^>]*>/gi, '\n\n## ')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<[^>]+>/g, '') // remove tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  // Handle Markdown blocks simply
  if (format === 'md') {
    printableText = printableText
      .replace(/\*\*(.*?)\*\*/g, '$1') // remove bold asterisks
      .replace(/\*(.*?)\*/g, '$1'); // remove italic asterisks
  }

  // Split lines into standard word sizes to prevent horizontal text spilling
  doc.setFont("Courier", "normal");
  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81); // gray-700
  
  const textLines = doc.splitTextToSize(printableText, pageWidth);
  
  let currentY = marginTop + 18;
  const lineHeight = 5.5;

  textLines.forEach((line: string) => {
    // Check height constraints before writing
    if (currentY > pageHeight) {
      doc.addPage();
      currentY = marginTop + 10; // reset y offset on new page
    }
    
    // Check if line represents an MD style title
    if (line.startsWith('## ')) {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(17, 24, 39);
      doc.text(line.replace('## ', ''), marginLeft, currentY);
      doc.setFont("Courier", "normal");
      doc.setFontSize(10);
      doc.setTextColor(55, 65, 81);
      currentY += lineHeight + 2;
    } else {
      doc.text(line, marginLeft, currentY);
      currentY += lineHeight;
    }
  });

  // Prompt safe document download
  const cleanFilename = title.toLowerCase().replace(/\s+/g, '_').replace(/\.[^/.]+$/, "") + '_converted.pdf';
  doc.save(cleanFilename);
}

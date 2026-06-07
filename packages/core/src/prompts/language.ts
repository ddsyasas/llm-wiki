export function humanTextInstruction(outputLanguage: string): string {
  const language = outputLanguage.trim();
  return `Write all human-facing text in natural ${language}. Keep slugs exactly as required; everything else should be ${language} even if the source material is in another language.`;
}

export function humanTextShapeLabel(outputLanguage: string, noun: string): string {
  const language = outputLanguage.trim();
  return `${noun} in ${language}`;
}

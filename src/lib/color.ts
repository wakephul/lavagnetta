/** Testo bianco o quasi nero sopra un colore, scegliendo quello che si legge meglio (contrasto WCAG). */
export function inkOn(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  if (Number.isNaN(n)) return '#fff'
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  // Contrasto con il bianco contro contrasto con #1f1d1a (luminanza ~0.012).
  return (1.05 / (L + 0.05) >= (L + 0.05) / 0.062) ? '#fff' : '#1f1d1a'
}

import type { ReactNode } from 'react';

/**
 * Text for an upper-cased label. Greek symbols (α, β, σ, λ) are kept as
 * written: upper-casing would turn α into Α, which reads as a Latin A.
 */
export function label(text: string): ReactNode {
  return text.split(/([α-ω]+)/).map((part, index) => (index % 2 ? <span key={index} className="inv-greek">{part}</span> : part));
}

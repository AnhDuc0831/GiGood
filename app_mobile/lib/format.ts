const numFormatter = new Intl.NumberFormat('en-US')

export function formatVnd(num: number): string {
  return `${numFormatter.format(num)} ₫`
}

export function formatToken(num: number): string {
  return `${numFormatter.format(num)} Token`
}

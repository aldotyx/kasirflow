/**
 * Indonesian number-to-words (terbilang) converter for natural spoken Rupiah announcements.
 */

const SATUAN = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
  'sepuluh',
  'sebelas',
];

export function terbilang(n: number): string {
  const num = Math.floor(Math.abs(n));

  if (num === 0) return 'nol';
  if (num < 12) return SATUAN[num];
  if (num < 20) return `${terbilang(num - 10)} belas`;
  if (num < 100) {
    const sisa = num % 10;
    return `${terbilang(Math.floor(num / 10))} puluh${sisa ? ' ' + terbilang(sisa) : ''}`;
  }
  if (num < 200) {
    const sisa = num - 100;
    return `seratus${sisa ? ' ' + terbilang(sisa) : ''}`;
  }
  if (num < 1000) {
    const sisa = num % 100;
    return `${terbilang(Math.floor(num / 100))} ratus${sisa ? ' ' + terbilang(sisa) : ''}`;
  }
  if (num < 2000) {
    const sisa = num - 1000;
    return `seribu${sisa ? ' ' + terbilang(sisa) : ''}`;
  }
  if (num < 1000000) {
    const sisa = num % 1000;
    return `${terbilang(Math.floor(num / 1000))} ribu${sisa ? ' ' + terbilang(sisa) : ''}`;
  }
  if (num < 1000000000) {
    const sisa = num % 1000000;
    return `${terbilang(Math.floor(num / 1000000))} juta${sisa ? ' ' + terbilang(sisa) : ''}`;
  }
  if (num < 1000000000000) {
    const sisa = num % 1000000000;
    return `${terbilang(Math.floor(num / 1000000000))} miliar${sisa ? ' ' + terbilang(sisa) : ''}`;
  }
  if (num < 1000000000000000) {
    const sisa = num % 1000000000000;
    return `${terbilang(Math.floor(num / 1000000000000))} triliun${sisa ? ' ' + terbilang(sisa) : ''}`;
  }

  return num.toString();
}

/**
 * Returns formatted spoken Rupiah words.
 * Example: 150000 -> "seratus lima puluh ribu rupiah"
 */
export function terbilangRupiah(amount: number): string {
  const positiveAmount = Math.max(0, Math.round(amount));
  if (positiveAmount === 0) return 'nol rupiah';
  return `${terbilang(positiveAmount)} rupiah`;
}

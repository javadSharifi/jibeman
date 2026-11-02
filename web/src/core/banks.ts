export interface Bank {
  code: string;
  name: string;
  color: string;
  gradientEnd: string;
  cardPrefixes: string[];
  ibanCodes: string[];
  letter: string;
}

export const Banks: Bank[] = [
  { code: 'mellat', name: 'ملت', color: '#C8102E', gradientEnd: '#8B0014', cardPrefixes: ['610433', '991975'], ibanCodes: ['012'], letter: 'م' },
  { code: 'blu', name: 'بلو', color: '#1F5FD6', gradientEnd: '#0E3EA3', cardPrefixes: ['62198618', '62198619'], ibanCodes: [], letter: 'ب' },
  { code: 'keshavarzi', name: 'کشاورزی', color: '#1C7A4B', gradientEnd: '#0E4A2C', cardPrefixes: ['603770', '639217'], ibanCodes: ['016'], letter: 'ک' },
  { code: 'melli', name: 'ملی', color: '#0B4F9C', gradientEnd: '#052B58', cardPrefixes: ['603799', '636214'], ibanCodes: ['017', '062'], letter: 'م' },
  { code: 'saderat', name: 'صادرات', color: '#1A3D8F', gradientEnd: '#0C2154', cardPrefixes: ['603769'], ibanCodes: ['019'], letter: 'ص' },
  { code: 'tejarat', name: 'تجارت', color: '#1B4B9B', gradientEnd: '#0D295C', cardPrefixes: ['627353', '585983'], ibanCodes: ['018'], letter: 'ت' },
  { code: 'sepah', name: 'سپه', color: '#B07D00', gradientEnd: '#6D4E00', cardPrefixes: ['589210', '639370', '505801', '636949', '627381', '639599'], ibanCodes: ['015', '063', '065'], letter: 'س' },
  { code: 'saman', name: 'سامان', color: '#0A6EBD', gradientEnd: '#053E6D', cardPrefixes: ['621986'], ibanCodes: ['056'], letter: 'س' },
  { code: 'pasargad', name: 'پاسارگاد', color: '#B8860B', gradientEnd: '#4A3700', cardPrefixes: ['502229', '639347'], ibanCodes: ['057'], letter: 'پ' },
  { code: 'parsian', name: 'پارسیان', color: '#8B1D2C', gradientEnd: '#4D0C15', cardPrefixes: ['622106', '639194', '627884'], ibanCodes: ['054'], letter: 'پ' },
  { code: 'maskan', name: 'مسکن', color: '#E65100', gradientEnd: '#8A3000', cardPrefixes: ['628023'], ibanCodes: ['014'], letter: 'م' },
  { code: 'refah', name: 'رفاه', color: '#00796B', gradientEnd: '#00433C', cardPrefixes: ['589463'], ibanCodes: ['013'], letter: 'ر' },
  { code: 'eghtesad', name: 'اقتصاد نوین', color: '#6A1B9A', gradientEnd: '#3E0A5D', cardPrefixes: ['627412'], ibanCodes: ['055'], letter: 'ا' },
  { code: 'ayandeh', name: 'آینده', color: '#5D4037', gradientEnd: '#32221D', cardPrefixes: ['636214'], ibanCodes: ['062'], letter: 'آ' },
  { code: 'resalat', name: 'رسالت', color: '#00838F', gradientEnd: '#00484F', cardPrefixes: ['504172'], ibanCodes: ['070'], letter: 'ر' },
  { code: 'shahr', name: 'شهر', color: '#C62828', gradientEnd: '#6B1111', cardPrefixes: ['502806', '504706'], ibanCodes: ['061'], letter: 'ش' },
  { code: 'post', name: 'پست بانک', color: '#2E7D32', gradientEnd: '#144717', cardPrefixes: ['627760'], ibanCodes: ['021'], letter: 'پ' },
  { code: 'sina', name: 'سینا', color: '#1565C0', gradientEnd: '#0A3668', cardPrefixes: ['639346'], ibanCodes: ['059'], letter: 'س' },
  { code: 'mehr', name: 'مهر ایران', color: '#2E7D32', gradientEnd: '#154418', cardPrefixes: ['606373'], ibanCodes: ['060'], letter: 'م' },
  { code: 'dey', name: 'دی', color: '#4A148C', gradientEnd: '#27054E', cardPrefixes: ['502938'], ibanCodes: ['066'], letter: 'د' },
  { code: 'karafarin', name: 'کارآفرین', color: '#1B5E20', gradientEnd: '#0A3310', cardPrefixes: ['627488', '502910'], ibanCodes: ['053'], letter: 'ک' },
  { code: 'sarmaye', name: 'سرمایه', color: '#0288D1', gradientEnd: '#014B74', cardPrefixes: ['639607'], ibanCodes: ['058'], letter: 'س' },
  { code: 'gardeshgari', name: 'گردشگری', color: '#3E2723', gradientEnd: '#1F1210', cardPrefixes: ['505416'], ibanCodes: ['064'], letter: 'گ' },
  { code: 'iranzamin', name: 'ایران زمین', color: '#512DA8', gradientEnd: '#281358', cardPrefixes: ['505785'], ibanCodes: ['069'], letter: 'ا' },
  { code: 'tosetaavon', name: 'توسعه تعاون', color: '#00695C', gradientEnd: '#003831', cardPrefixes: ['502908'], ibanCodes: ['022'], letter: 'ت' },
  { code: 'other', name: 'سایر', color: '#3A3FAE', gradientEnd: '#1C206B', cardPrefixes: [], ibanCodes: [], letter: 'س' },
];

export function getBankByCode(code?: string | null): Bank | undefined {
  if (!code) return undefined;
  return Banks.find((b) => b.code === code);
}

export function findBankByCardPrefix(digits: string): Bank | undefined {
  const clean = digits.replace(/\D/g, '');
  // Sort prefixes by length descending so 8-digit matches before 6-digit
  const sorted = [...Banks].sort((a, b) => {
    const maxA = Math.max(0, ...a.cardPrefixes.map(p => p.length));
    const maxB = Math.max(0, ...b.cardPrefixes.map(p => p.length));
    return maxB - maxA;
  });

  for (const bank of sorted) {
    for (const prefix of bank.cardPrefixes) {
      if (clean.startsWith(prefix)) return bank;
    }
  }
  return undefined;
}

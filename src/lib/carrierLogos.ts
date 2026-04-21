import type { SimpleIcon } from 'simple-icons';
import { siDhl, siFedex, siUps, siUsps } from 'simple-icons';

export interface CarrierBrand {
  abbr: string;
  bg: string;
  fg: string;
}

const CARRIER_BRANDS: Record<string, CarrierBrand> = {
  fedex: { abbr: 'FDX', bg: '#4D148C', fg: '#FF6600' },
  'federal express': { abbr: 'FDX', bg: '#4D148C', fg: '#FF6600' },
  ups: { abbr: 'UPS', bg: '#351C15', fg: '#FFB500' },
  usps: { abbr: 'USPS', bg: '#004B87', fg: '#FFFFFF' },
  amazon: { abbr: 'AMZ', bg: '#232F3E', fg: '#FF9900' },
  dhl: { abbr: 'DHL', bg: '#FFCC00', fg: '#D40511' },
  'old dominion': { abbr: 'OD', bg: '#C8102E', fg: '#FFFFFF' },
  estes: { abbr: 'EST', bg: '#003DA5', fg: '#FFFFFF' },
  xpo: { abbr: 'XPO', bg: '#00205B', fg: '#FFFFFF' },
  saia: { abbr: 'SAIA', bg: '#ED1C24', fg: '#FFFFFF' },
  'r+l': { abbr: 'R+L', bg: '#003366', fg: '#FFFFFF' },
  ontrac: { abbr: 'ONT', bg: '#00A651', fg: '#FFFFFF' },
  purolator: { abbr: 'PUR', bg: '#C8102E', fg: '#FFFFFF' },
  'pitney bowes': { abbr: 'PB', bg: '#0072CE', fg: '#FFFFFF' },
};

const CARRIER_ICONS: Record<string, SimpleIcon> = {
  fedex: siFedex,
  'federal express': siFedex,
  ups: siUps,
  usps: siUsps,
  dhl: siDhl,
};

export function getCarrierBrand(carrierName: string): CarrierBrand | null {
  const lower = carrierName.toLowerCase().trim();
  for (const [key, brand] of Object.entries(CARRIER_BRANDS)) {
    if (lower.includes(key)) return brand;
  }
  return null;
}

export function getCarrierLogo(carrierName: string): SimpleIcon | null {
  const lower = carrierName.toLowerCase().trim();
  for (const [key, icon] of Object.entries(CARRIER_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return null;
}

export function getCarrierInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
}

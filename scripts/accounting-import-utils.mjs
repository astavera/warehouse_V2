import { createHash } from 'node:crypto';

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s#.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function displayText(value) {
  const resolved = resolveCellValue(value);
  if (resolved == null) return null;
  if (resolved instanceof Date) return resolved.toISOString().slice(0, 10);
  if (typeof resolved === 'number') return Number.isInteger(resolved) ? String(resolved) : String(resolved);
  if (typeof resolved === 'object') return JSON.stringify(resolved);
  const text = String(resolved).trim();
  return text ? text : null;
}

export function resolveCellValue(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;
  if ('result' in value && value.result != null) return value.result;
  if ('text' in value && value.text != null) return value.text;
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText.map(part => part.text || '').join('');
  }
  if ('formula' in value && typeof value.formula === 'string') {
    const evaluated = evaluateSimpleFormula(value.formula);
    if (evaluated != null) return evaluated;
    return `=${value.formula}`;
  }
  return value;
}

export function evaluateSimpleFormula(formula) {
  const expression = String(formula || '').replace(/^=/, '').trim();
  if (!expression || !/^[0-9+\-*/().\s]+$/.test(expression)) return null;
  try {
    // The expression is restricted to arithmetic characters before evaluation.
    const result = Function(`"use strict"; return (${expression});`)();
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export function parseMoneyToCents(value) {
  const resolved = resolveCellValue(value);
  if (resolved == null || resolved === '') return null;
  if (typeof resolved === 'number' && Number.isFinite(resolved)) return parseMoneyTextToCents(resolved.toFixed(6));
  const formulaValue = typeof resolved === 'string' && resolved.trim().startsWith('=')
    ? evaluateSimpleFormula(resolved)
    : null;
  if (formulaValue != null) return parseMoneyTextToCents(formulaValue.toFixed(6));
  const text = String(resolved)
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\(([^)]+)\)/, '-$1')
    .trim();
  if (!text || text === '-') return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  return parseMoneyTextToCents(match[0]);
}

function parseMoneyTextToCents(text) {
  const [wholeRaw, decimalRaw = ''] = String(text).split('.');
  const sign = wholeRaw.startsWith('-') ? -1n : 1n;
  const whole = BigInt(wholeRaw.replace('-', '') || '0');
  const padded = `${decimalRaw}000`;
  let decimals = BigInt(padded.slice(0, 2));
  if (Number(padded[2] || '0') >= 5) decimals += 1n;
  return sign * (whole * 100n + decimals);
}

export function centsToDecimal(value) {
  if (value == null) return null;
  const cents = typeof value === 'bigint' ? value : BigInt(value);
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

export function parseMoney(value) {
  return centsToDecimal(parseMoneyToCents(value));
}

export function addCents(values) {
  return values.reduce((total, value) => total + (parseMoneyToCents(value) ?? 0n), 0n);
}

export function parseExcelDate(value) {
  const resolved = resolveCellValue(value);
  if (resolved == null || resolved === '' || resolved === '-') return null;
  if (resolved instanceof Date && !Number.isNaN(resolved.getTime())) return resolved.toISOString().slice(0, 10);
  if (typeof resolved === 'number' && Number.isFinite(resolved)) {
    return new Date(EXCEL_EPOCH + Math.round(resolved) * 86400000).toISOString().slice(0, 10);
  }
  const text = String(resolved).trim();
  if (!text || text === '-') return null;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const [, month, day, yearRaw] = match;
  const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
  return new Date(Date.UTC(year, Number(month) - 1, Number(day))).toISOString().slice(0, 10);
}

export function parsePaidStatus(value) {
  if (value === true) return 'paid';
  if (value === false || value == null || value === '') return 'pending';
  const normalized = normalizeText(value);
  if (['paid', 'yes', 'y', 'true', '1', 'x'].includes(normalized)) return 'paid';
  if (['cancelled', 'canceled', 'void'].includes(normalized)) return 'cancelled';
  if (['pending', 'no', 'n', 'false', '0'].includes(normalized)) return 'pending';
  return 'unknown';
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sourceRowHash(payload) {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function sourceRowKey(sourceFileSha256, sourceSheet, sourceRow) {
  return `${sourceFileSha256}:${String(sourceSheet || '').trim()}:${sourceRow}`;
}

export function finalAmountToPay(amount, credit) {
  return centsToDecimal((parseMoneyToCents(amount) ?? 0n) - (parseMoneyToCents(credit) ?? 0n));
}

export function truckDuplicateGroupKey(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

export function detectTruckDuplicateKeys(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = truckDuplicateGroupKey(row.violation_number);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

export function extractCellNote(cell) {
  const note = cell?.note;
  if (!note) return null;
  if (typeof note === 'string') return note.trim() || null;
  if (Array.isArray(note.texts)) {
    const text = note.texts.map(part => part.text || '').join('').trim();
    return text || null;
  }
  const text = JSON.stringify(note);
  return text === '{}' ? null : text;
}

import { Supplier, Carrier, Employee, ReceiptBatch } from '@/types/warehouse';

const DEFAULT_CARRIERS: Carrier[] = [
  { id: 'ups', name: 'UPS', type: 'parcel', active: true },
  { id: 'fedex', name: 'FedEx', type: 'parcel', active: true },
  { id: 'usps', name: 'USPS', type: 'parcel', active: true },
  { id: 'dhl', name: 'DHL', type: 'parcel', active: true },
];

function get<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function set<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const store = {
  getSuppliers: (): Supplier[] => get('wh_suppliers', []),
  setSuppliers: (s: Supplier[]) => set('wh_suppliers', s),
  addSupplier: (s: Supplier) => {
    const all = store.getSuppliers();
    all.push(s);
    store.setSuppliers(all);
    return s;
  },
  updateSupplier: (s: Supplier) => {
    const all = store.getSuppliers().map(x => x.id === s.id ? s : x);
    store.setSuppliers(all);
  },

  getCarriers: (): Carrier[] => {
    const custom = get<Carrier[]>('wh_carriers', []);
    const all = [...DEFAULT_CARRIERS];
    custom.forEach(c => { if (!all.find(x => x.id === c.id)) all.push(c); });
    return all.filter(c => c.active);
  },
  getAllCarriers: (): Carrier[] => {
    const custom = get<Carrier[]>('wh_carriers', []);
    const all = [...DEFAULT_CARRIERS];
    custom.forEach(c => { if (!all.find(x => x.id === c.id)) all.push(c); });
    return all;
  },
  addCarrier: (c: Carrier) => {
    const custom = get<Carrier[]>('wh_carriers', []);
    custom.push(c);
    set('wh_carriers', custom);
    return c;
  },
  updateCarrier: (c: Carrier) => {
    const custom = get<Carrier[]>('wh_carriers', []).map(x => x.id === c.id ? c : x);
    set('wh_carriers', custom);
  },

  getEmployees: (): Employee[] => get('wh_employees', []),
  addEmployee: (e: Employee) => {
    const all = store.getEmployees();
    all.push(e);
    set('wh_employees', all);
    return e;
  },
  updateEmployee: (e: Employee) => {
    const all = store.getEmployees().map(x => x.id === e.id ? e : x);
    set('wh_employees', all);
  },

  getBatches: (): ReceiptBatch[] => get('wh_batches', []),
  addBatch: (b: ReceiptBatch) => {
    const all = store.getBatches();
    all.unshift(b);
    set('wh_batches', all);
    return b;
  },

  getTodayBatches: (): ReceiptBatch[] => {
    const today = new Date().toISOString().split('T')[0];
    return store.getBatches().filter(b => b.receivedDate === today);
  },
};

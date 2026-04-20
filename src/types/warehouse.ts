export interface Supplier {
  id: string;
  name: string;
  code: string;
  contactName: string;
  phone: string;
  email: string;
  notes: string;
  active: boolean;
  createdAt: string;
}

export interface Carrier {
  id: string;
  name: string;
  type: 'parcel' | 'freight' | 'custom';
  active: boolean;
}

export interface Employee {
  id: string;
  name: string;
  active: boolean;
}

export type PackageType = 'pallet' | 'boxes';

export interface ReceiptItem {
  id: string;
  batchId: string;
  supplierId: string;
  packageType: PackageType;
  packageCount: number;
  damagedBox: boolean;
  damagedNotes: string;
  trackingNumber: string;
  comments: string;
  photoUrl: string;
  createdAt: string;
}

export interface ReceiptBatch {
  id: string;
  carrierId: string;
  receivedBy: string;
  receivedDate: string;
  receivedTime: string;
  sharedPhotoUrl: string;
  notes: string;
  items: ReceiptItem[];
  createdAt: string;
}

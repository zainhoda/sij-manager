/**
 * Fishbowl database type definitions
 * These types match the MySQL schema in the Fishbowl database
 */

// Bill of Materials
export interface FishbowlBOM {
  id: number;
  num: string;
  description: string | null;
  revision: string | null;
  activeFlag: boolean;
  dateCreated: Date;
  dateLastModified: Date;
  configurable: boolean;
  estimatedDuration: number | null;
}

export interface FishbowlBOMItem {
  id: number;
  bomId: number;
  partId: number;
  quantity: number;
  typeId: number;
  description: string | null;
  sortOrder: number;
  // Joined fields from part table
  partNum?: string;
  partDescription?: string;
}

export interface FishbowlBOMItemType {
  id: number;
  name: string;
}

// Work Instructions (bominstructionitem)
export interface FishbowlBOMInstruction {
  id: number;
  bomId: number;
  name: string;  // Step label like "Cut 1 / Back", "Step 1"
  description: string | null;  // Equipment/method like "Slitter Machine", "Clicker Press"
  details: string | null;  // Full instructions with dimensions, procedures
  sortOrder: number;
  url: string | null;
}

// BOM Item Types:
// 10 = Finished Good
// 20 = Raw Good
// 30 = Repair Raw Good
// 40 = Note
// 50 = Bill of Service
// 60 = Instruction

// Parts
export interface FishbowlPart {
  id: number;
  num: string;
  description: string | null;
  typeId: number;
  uomId: number;
  stdCost: number;
  activeFlag: boolean;
  trackingFlag: boolean;
  serializedFlag: boolean;
}

// Products
export interface FishbowlProduct {
  id: number;
  num: string;
  description: string | null;
  partId: number;
  price: number;
  activeFlag: boolean;
  kitFlag: boolean;
}

// Sales Orders
export interface FishbowlSO {
  id: number;
  num: string;
  customerId: number;
  statusId: number;
  dateCreated: Date;
  dateIssued: Date | null;
  dateCompleted: Date | null;
  totalPrice: number;
  subTotal: number;
  // Joined fields
  customerName?: string;
  statusName?: string;
}

export interface FishbowlSOItem {
  id: number;
  soId: number;
  soLineItem: number;
  productId: number;
  qtyOrdered: number;
  qtyFulfilled: number;
  qtyPicked: number;
  qtyToFulfill: number;
  unitPrice: number;
  totalPrice: number;
  statusId: number;
  description: string | null;
  dateScheduledFulfillment: Date | null;
  // Joined fields
  productNum?: string;
  productDescription?: string;
}

// SO Status values:
// 10 = Estimate
// 20 = Issued
// 25 = In Progress
// 60 = Fulfilled
// 70 = Closed Short
// 80 = Voided
// 85 = Cancelled
// 90 = Expired
// 95 = Historical

export const SO_STATUS = {
  ESTIMATE: 10,
  ISSUED: 20,
  IN_PROGRESS: 25,
  FULFILLED: 60,
  CLOSED_SHORT: 70,
  VOIDED: 80,
  CANCELLED: 85,
  EXPIRED: 90,
  HISTORICAL: 95,
} as const;

export type SOStatusId = typeof SO_STATUS[keyof typeof SO_STATUS];

// Manufacturing Orders
export interface FishbowlMO {
  id: number;
  num: string;
  soId: number | null;
  statusId: number;
  dateCreated: Date;
  dateIssued: Date | null;
  dateScheduled: Date | null;
  dateCompleted: Date | null;
}

export interface FishbowlMOItem {
  id: number;
  moId: number;
  partId: number;
  bomId: number | null;
  qtyToFulfill: number;
  qtyFulfilled: number;
  statusId: number;
  description: string | null;
  // Joined fields
  partNum?: string;
}

// Work Orders
export interface FishbowlWO {
  id: number;
  num: string;
  moItemId: number;
  statusId: number;
  qtyOrdered: number;
  qtyTarget: number;
  qtyScrapped: number;
  dateCreated: Date;
  dateScheduled: Date | null;
  dateStarted: Date | null;
  dateFinished: Date | null;
  locationId: number | null;
}

export interface FishbowlWOItem {
  id: number;
  woId: number;
  partId: number;
  qtyTarget: number;
  qtyUsed: number;
  qtyScrapped: number;
  typeId: number;
  // Joined fields
  partNum?: string;
  partDescription?: string;
}

// WO Status values:
// Derived from wostatus table

export const WO_STATUS = {
  OPEN: 10,
  STARTED: 20,
  COMPLETE: 30,
} as const;

// Customers
export interface FishbowlCustomer {
  id: number;
  name: string;
  number: string;
  activeFlag: boolean;
  statusId: number;
}

// Vendors
export interface FishbowlVendor {
  id: number;
  name: string;
  accountNum: string | null;
  activeFlag: boolean;
  statusId: number;
  leadTime: number | null;
}

// Locations
export interface FishbowlLocation {
  id: number;
  name: string;
  description: string | null;
  locationGroupId: number;
  typeId: number;
  activeFlag: boolean;
  pickable: boolean;
  receivable: boolean;
}

// Units of Measure
export interface FishbowlUOM {
  id: number;
  name: string;
  code: string;
  description: string | null;
}

// Query options
export interface BOMQueryOptions {
  active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SOQueryOptions {
  status?: 'open' | 'in_progress' | 'fulfilled' | 'all';
  customerId?: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  /** Only return SOs that have at least one item with a matching BOM (manufacturable) */
  hasBOM?: boolean;
}

export interface WOQueryOptions {
  status?: number;
  moId?: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

// Sync result types
export interface SyncResult {
  success: boolean;
  recordsSynced: number;
  errors: string[];
  startedAt: Date;
  completedAt: Date;
}

// Order chain - links SO -> MO -> WO
export interface OrderChain {
  so: FishbowlSO | null;
  soItems: FishbowlSOItem[];
  mos: FishbowlMO[];
  moItems: FishbowlMOItem[];
  wos: FishbowlWO[];
}

// Inventory - note: InventoryInfo is exported from inventory-service.ts
export interface BOMInventory {
  bomNum: string;
  onHandQty: number;
  cartonQty: number;
}

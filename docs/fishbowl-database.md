# Fishbowl Database Schema

**Database:** `si_jacobson_active_2024_10_04_0900st`
**Host:** `sijacobson.myfishbowl.com:4320`
**Type:** MySQL (Fishbowl Inventory Management)

## Connection

```
SIJ_HOST=sijacobson.myfishbowl.com
SIJ_DBNAME=si_jacobson_active_2024_10_04_0900st
SIJ_USER=gone
SIJ_PASSWORD=F1shing#
SIJ_PORT=4320
```

## Overview

This is the live Fishbowl database with active transactional data. Other databases on the same server are static snapshots:

| Database | Status | Latest Activity |
|----------|--------|-----------------|
| `si_jacobson_active_2024_10_04_0900st` | **LIVE** | Current |
| `si_jacobson_active_2024_10_04_0900cst` | Snapshot | Oct 3, 2024 |
| `si_jacobson_new_2024_10_01` | Snapshot | Oct 3, 2024 |

---

## Table Summary (Tables with Data)

### High-Volume Tables (>10k rows)
| Table | Rows | Description |
|-------|------|-------------|
| `revinfo` | 295,254 | Audit revision info |
| `inventorylog` | 243,259 | Inventory movement log |
| `inventorylogtocostlayer` | 236,867 | Cost layer tracking |
| `postsoitem` | 225,082 | Posted SO items |
| `shipitem` | 224,658 | Shipped line items |
| `shipcarton` | 224,605 | Shipping cartons |
| `partcosthistory` | 124,240 | Historical part costs |
| `orderhistory` | 10,384 | Order status changes |

### Core Transactional Tables
| Table | Rows | Description |
|-------|------|-------------|
| `so` | 1,550 | Sales Orders |
| `soitem` | 3,403 | Sales Order Line Items |
| `po` | 729 | Purchase Orders |
| `poitem` | 1,420 | Purchase Order Line Items |
| `wo` | 233 | Work Orders |
| `woitem` | 1,540 | Work Order Items |
| `mo` | 203 | Manufacturing Orders |
| `moitem` | 1,768 | Manufacturing Order Items |
| `pick` | 1,671 | Pick tickets |
| `pickitem` | 4,708 | Pick line items |
| `ship` | 1,381 | Shipments |
| `shipitem` | 224,658 | Shipment line items |
| `receipt` | 689 | Receipts (receiving) |
| `receiptitem` | 3,276 | Receipt line items |

### Master Data Tables
| Table | Rows | Description |
|-------|------|-------------|
| `customer` | 78 | Customer accounts |
| `vendor` | 187 | Supplier/vendor accounts |
| `part` | 939 | Parts/materials |
| `product` | 648 | Sellable products |
| `bom` | 213 | Bills of material |
| `bomitem` | 1,393 | BOM components |
| `location` | 791 | Warehouse locations |
| `contact` | 502 | Customer/vendor contacts |
| `address` | 531 | Addresses |
| `vendorparts` | 515 | Vendor-part relationships |
| `customerparts` | 194 | Customer-product relationships |
| `sysuser` | 15 | System users |

---

## Schema Details

### Sales Order (so)

Primary sales order header.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `num` | varchar(25) | SO number |
| `customerId` | int | FK to customer |
| `statusId` | int | FK to sostatus |
| `dateCreated` | datetime | Creation date |
| `dateIssued` | datetime | Issue date |
| `dateCompleted` | datetime | Completion date |
| `billToName` | varchar(60) | Billing name |
| `billToAddress` | varchar(90) | Billing address |
| `billToCity` | varchar(30) | Billing city |
| `billToStateId` | int | FK to stateconst |
| `billToZip` | varchar(10) | Billing zip |
| `shipToName` | varchar(60) | Shipping name |
| `shipToAddress` | varchar(90) | Shipping address |
| `shipToCity` | varchar(30) | Shipping city |
| `shipToStateId` | int | FK to stateconst |
| `shipToZip` | varchar(10) | Shipping zip |
| `customerPO` | varchar(25) | Customer PO reference |
| `totalPrice` | decimal(28,9) | Total price |
| `subTotal` | decimal(28,9) | Subtotal |
| `totalTax` | decimal(28,9) | Tax amount |
| `salesmanId` | int | FK to sysuser |
| `carrierId` | int | FK to carrier |
| `paymentTermsId` | int | FK to paymentterms |
| `locationGroupId` | int | FK to locationgroup |
| `customFields` | json | Custom field data |

**Status Values (sostatus):**
- 10: Estimate
- 20: Issued
- 25: In Progress
- 60: Fulfilled
- 70: Closed Short
- 80: Voided
- 85: Cancelled
- 90: Expired
- 95: Historical

### Sales Order Item (soitem)

Line items on sales orders.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `soId` | int | FK to so |
| `soLineItem` | int | Line number |
| `productId` | int | FK to product |
| `productNum` | varchar(70) | Product number |
| `description` | varchar(256) | Description |
| `qtyOrdered` | decimal(28,9) | Quantity ordered |
| `qtyFulfilled` | decimal(28,9) | Quantity fulfilled |
| `qtyPicked` | decimal(28,9) | Quantity picked |
| `qtyToFulfill` | decimal(28,9) | Remaining to fulfill |
| `unitPrice` | decimal(28,9) | Unit price |
| `totalPrice` | decimal(28,9) | Line total |
| `statusId` | int | FK to soitemstatus |
| `typeId` | int | FK to soitemtype |
| `uomId` | int | FK to uom |
| `dateScheduledFulfillment` | datetime | Scheduled ship date |

### Purchase Order (po)

Purchase order header.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `num` | varchar(25) | PO number |
| `vendorId` | int | FK to vendor |
| `statusId` | int | FK to postatus |
| `dateCreated` | datetime | Creation date |
| `dateIssued` | datetime | Issue date |
| `dateCompleted` | datetime | Completion date |
| `buyerId` | int | FK to sysuser |
| `shipToName` | varchar(60) | Ship-to name |
| `shipToAddress` | varchar(90) | Ship-to address |
| `remitToName` | varchar(60) | Remit-to name |
| `totalTax` | decimal(28,9) | Tax amount |
| `locationGroupId` | int | FK to locationgroup |
| `customFields` | json | Custom field data |

**Status Values (postatus):**
- 10: Bid Request
- 15: Pending Approval
- 20: Issued
- 30: Picking
- 40: Partial
- 50: Picked
- 55: Shipped
- 60: Fulfilled
- 70: Closed Short
- 80: Void
- 95: Historical

### Purchase Order Item (poitem)

Line items on purchase orders.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `poId` | int | FK to po |
| `poLineItem` | int | Line number |
| `partId` | int | FK to part |
| `partNum` | varchar(70) | Part number |
| `description` | varchar(256) | Description |
| `qtyToFulfill` | decimal(28,9) | Quantity ordered |
| `qtyFulfilled` | decimal(28,9) | Quantity received |
| `unitCost` | decimal(28,9) | Unit cost |
| `totalCost` | decimal(28,9) | Line total |
| `statusId` | int | FK to poitemstatus |
| `vendorPartNum` | varchar(70) | Vendor part number |
| `dateScheduledFulfillment` | datetime | Expected date |

### Part

Inventory parts/materials.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `num` | varchar(70) | Part number |
| `description` | varchar(252) | Description |
| `typeId` | int | FK to parttype |
| `uomId` | int | FK to uom |
| `stdCost` | decimal(28,9) | Standard cost |
| `activeFlag` | bit(1) | Active status |
| `trackingFlag` | bit(1) | Requires tracking |
| `serializedFlag` | bit(1) | Serialized |
| `defaultBomId` | int | FK to bom |
| `defaultProductId` | int | FK to product |

**Part Types (parttype):**
- 10: Inventory
- 20: Service
- 21: Labor
- 22: Overhead
- 30: Non-Inventory
- 40: Internal Use
- 50: Capital Equipment
- 60: Shipping
- 70: Tax
- 80: Misc

### Product

Sellable products (linked to parts).

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `num` | varchar(70) | Product number |
| `description` | varchar(252) | Description |
| `partId` | int | FK to part |
| `price` | decimal(28,9) | Default price |
| `uomId` | int | FK to uom |
| `activeFlag` | bit(1) | Active status |
| `kitFlag` | bit(1) | Is a kit |

### Customer

Customer accounts.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `name` | varchar(41) | Customer name |
| `number` | varchar(30) | Customer number |
| `activeFlag` | bit(1) | Active status |
| `statusId` | int | FK to customerstatus |
| `creditLimit` | decimal(28,9) | Credit limit |
| `defaultPaymentTermsId` | int | FK to paymentterms |
| `accountId` | int | FK to account |

### Vendor

Supplier/vendor accounts.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `name` | varchar(41) | Vendor name |
| `accountNum` | varchar(30) | Account number |
| `activeFlag` | bit(1) | Active status |
| `statusId` | int | FK to vendorstatus |
| `leadTime` | int | Default lead time (days) |
| `minOrderAmount` | decimal(28,9) | Minimum order |
| `defaultPaymentTermsId` | int | FK to paymentterms |

### Bill of Materials (bom)

Manufacturing recipes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `num` | varchar(70) | BOM number |
| `description` | varchar(252) | Description |
| `activeFlag` | bit(1) | Active status |
| `revision` | varchar(31) | Revision |
| `estimatedDuration` | int | Est. time (minutes) |

### BOM Item (bomitem)

Components in a BOM.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `bomId` | int | FK to bom |
| `partId` | int | FK to part |
| `quantity` | decimal(28,9) | Quantity required |
| `typeId` | int | FK to bomitemtype |
| `uomId` | int | FK to uom |
| `stage` | bit(1) | Is stage item |

**BOM Item Types (bomitemtype):**
- 10: Finished Good
- 20: Raw Good
- 30: Repair Raw Good
- 40: Note
- 50: Bill of Service
- 60: Instruction

### Location

Warehouse locations/bins.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `name` | varchar(30) | Location name |
| `description` | varchar(252) | Description |
| `locationGroupId` | int | FK to locationgroup |
| `typeId` | int | FK to locationtype |
| `parentId` | int | Parent location |
| `pickable` | bit(1) | Can pick from |
| `receivable` | bit(1) | Can receive to |
| `activeFlag` | bit(1) | Active status |

**Location Groups:**
- GOW (main warehouse)
- InTransit_to_GOW
- DROP SHIP

### Inventory Log (inventorylog)

Detailed inventory movement history.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `partId` | int | FK to part |
| `changeQty` | decimal(28,9) | Quantity change (+/-) |
| `qtyOnHand` | decimal(28,9) | QOH after change |
| `begLocationId` | int | Source location |
| `endLocationId` | int | Destination location |
| `cost` | decimal(28,9) | Cost at time |
| `dateCreated` | datetime | Log timestamp |
| `typeId` | int | FK to inventorylogtype |
| `userId` | int | FK to sysuser |

### Work Order (wo)

Production work orders.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `num` | varchar(30) | WO number |
| `moItemId` | int | FK to moitem |
| `statusId` | int | FK to wostatus |
| `qtyOrdered` | int | Quantity to produce |
| `qtyTarget` | int | Target quantity |
| `dateScheduled` | datetime | Scheduled date |
| `dateStarted` | datetime | Actual start |
| `dateFinished` | datetime | Completion date |
| `locationId` | int | Production location |

### Manufacturing Order (mo)

Manufacturing order header (groups work orders).

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `num` | varchar(25) | MO number |
| `soId` | int | FK to so (if from SO) |
| `statusId` | int | FK to mostatus |
| `dateCreated` | datetime | Creation date |
| `dateScheduled` | datetime | Scheduled date |
| `dateCompleted` | datetime | Completion date |

---

## Key Relationships

```
customer (1) ──── (*) so ──── (*) soitem ──── (1) product ──── (1) part
                   │                                              │
                   └── (*) ship ──── (*) shipitem                 │
                                                                  │
vendor (1) ──── (*) po ──── (*) poitem ───────────────────────────┘
                   │
                   └── (*) receipt ──── (*) receiptitem

part (1) ──── (*) bomitem ──── (1) bom
   │
   └── (*) vendorparts ──── (1) vendor

mo (1) ──── (*) moitem ──── (*) wo ──── (*) woitem ──── (1) part
```

---

## Common Queries

### Open Sales Orders
```sql
SELECT so.num, so.dateCreated, c.name as customer, so.totalPrice, ss.name as status
FROM so
JOIN customer c ON so.customerId = c.id
JOIN sostatus ss ON so.statusId = ss.id
WHERE so.statusId IN (20, 25)  -- Issued, In Progress
ORDER BY so.dateCreated DESC;
```

### Open Purchase Orders
```sql
SELECT po.num, po.dateCreated, v.name as vendor, ps.name as status
FROM po
JOIN vendor v ON po.vendorId = v.id
JOIN postatus ps ON po.statusId = ps.id
WHERE po.statusId IN (20, 30, 40)  -- Issued, Picking, Partial
ORDER BY po.dateCreated DESC;
```

### Inventory by Location
```sql
SELECT l.name as location, p.num as part, p.description, t.qty
FROM tag t
JOIN location l ON t.locationId = l.id
JOIN part p ON t.partId = p.id
WHERE t.qty > 0
ORDER BY l.name, p.num;
```

### Recent Order Activity
```sql
SELECT oh.dateCreated, ot.name as orderType, oh.comment, u.userName
FROM orderhistory oh
JOIN ordertype ot ON oh.orderTypeId = ot.id
LEFT JOIN sysuser u ON oh.userId = u.id
ORDER BY oh.dateCreated DESC
LIMIT 50;
```

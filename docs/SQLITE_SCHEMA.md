# SQLITE_SCHEMA.md
**Application:** W-RAW ERP PROFESSIONAL
**Database Engine:** SQLite (Native Desktop)

## 1. Core Architecture
The database follows a normalized relational structure designed for performance, offline-first capabilities, and complete transaction safety.

### 1.1 Master Data Tables
- `categories`: Groups materials and products.
- `materials`: Raw material definitions and global stock counters.
- `products`: Finished goods definitions and price lists.

### 1.2 Business Partner Tables
- `customers`: Client ledgers and balances.
- `suppliers`: Vendor ledgers and balances.
- `processors`: Out-source manufacturing hubs and ledgers.

### 1.3 Operations & Inventory
- `purchases`: Inbound raw material receipts.
- `sales`: Outbound finished goods dispatch.
- `processing_send` / `processing_receipt`: Job work tracking and loss tracking.
- `inventory_movement`: Ledger for all piece-level and weight-level material/product flow.

### 1.4 Accounting Engine
- `vouchers`: Double-entry accounting headers.
- `journalEntries`: Line items mapping to specific Sub-Ledgers (Customers, Suppliers) or General Ledgers.

## 2. Relationships & Constraints
- **Foreign Keys**: Enforced via `RESTRICT` and `CASCADE` rules. (e.g., Cannot delete a Material if it has Purchase History).
- **Unique Indexes**: Implemented on `code`, `voucherNo`, `purchaseNo`, and `saleNo`.
- **Transactions**: All multi-table updates (e.g., Sales Posting + Voucher Creation + Inventory Deduction) are strictly wrapped in SQLite ACID Transactions.

## 3. Migration Engine
- **Table:** `_migrations`
- **Behavior:** The ERP automatically compares `_migrations` with application codebase definitions at startup.
- **Rollback:** Forward-only architecture. Rollbacks are performed by restoring the `.sqlite` file from the Backup Hub.
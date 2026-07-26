# Internal Assessment - Database Architecture Phase 4

## Current State
- Provider: Zustand + LocalStorage (JSON).
- Relationships: Represented by IDs (e.g., supplierId), but referential integrity is not strictly enforced by a foreign key constraint.
- Constraints: Only UI/Service level validation; the data layer lacks structural enforcement.
- Indexes: Searching is done via Array.find() or Array.filter(), which has O(N) complexity.
- Transactions: Zustand's set() is atomic, meaning it provides basic transactional consistency if an error is thrown before returning the object. However, there is no formal BEGIN/COMMIT/ROLLBACK.
- Repositories: We have `ZustandRepository` which abstracts CRUD operations.
- Services: Extracted in Phase 3.

## Identified Weaknesses
- No formal Foreign Key constraints -> risk of orphan records if a supplier is deleted while purchases exist.
- No unique constraints enforced at the database level -> risk of duplicate codes.
- No indexes -> O(N) performance on large datasets (Thousands of records simulation will be slow).
- No data integrity constraints at the storage level -> negative stock could technically be saved if a service layer misses a check.

## Planned Improvements
1. **DatabaseEngine Abstraction**: Implement `DatabaseEngine` that wraps `useERPStore` and provides formal transaction management (`beginTransaction`, `commit`, `rollback`) for services to use.
2. **Schema Definition**: Define `ERP_SCHEMA` defining tables, foreign keys (with RESTRICT rules), and unique constraints.
3. **Index Optimization**: Implement `DatabaseIndexManager` that dynamically builds and maintains Map-based indexes for O(1) lookups.
4. **Data Integrity Checks**: Inject a pre-commit validation hook that runs through all schema constraints and integrity rules (e.g., no negative stock, no orphan records).
5. **Accounting Reconciliation Checks**: Enforce Trial Balance and Debit=Credit balancing before committing any voucher.
6. **Error Handling**: Throw typed `ConstraintViolationError`, `DuplicateKeyError`, etc.

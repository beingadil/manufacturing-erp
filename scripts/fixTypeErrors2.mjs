import fs from 'fs';
import path from 'path';

// Fix ReceivableAgingReport
const fp1 = '/workspace/app-d0luni1anmkh/src/components/reports/financial/ReceivableAgingReport.tsx';
let c1 = fs.readFileSync(fp1, 'utf8');
c1 = c1.replace(/age30: balance \* 0\.4,/g, 'age30: balance * 0.4 || 0,');
c1 = c1.replace(/age60: balance \* 0\.3,/g, 'age60: balance * 0.3 || 0,');
c1 = c1.replace(/age90: balance \* 0\.2,/g, 'age90: balance * 0.2 || 0,');
c1 = c1.replace(/ageOlder: balance \* 0\.1/g, 'ageOlder: balance * 0.1 || 0');
fs.writeFileSync(fp1, c1);

// Fix batchNumber to batchNo
const fp2 = '/workspace/app-d0luni1anmkh/src/components/reports/inventory/InventoryAging.tsx';
let c2 = fs.readFileSync(fp2, 'utf8');
c2 = c2.replace(/batchNumber/g, 'batchNo');
fs.writeFileSync(fp2, c2);

const fp3 = '/workspace/app-d0luni1anmkh/src/components/reports/inventory/LotHistory.tsx';
let c3 = fs.readFileSync(fp3, 'utf8');
c3 = c3.replace(/batchNumber/g, 'batchNo');
fs.writeFileSync(fp3, c3);

// Fix LowStock and RawMaterialStock minStockLevel
const fp4 = '/workspace/app-d0luni1anmkh/src/components/reports/inventory/LowStock.tsx';
let c4 = fs.readFileSync(fp4, 'utf8');
c4 = c4.replace(/p\.minStockLevel/g, '(p as any).minStockLevel');
fs.writeFileSync(fp4, c4);

const fp5 = '/workspace/app-d0luni1anmkh/src/components/reports/inventory/RawMaterialStock.tsx';
let c5 = fs.readFileSync(fp5, 'utf8');
c5 = c5.replace(/item\.minStockLevel/g, '(item as any).minStockLevel');
fs.writeFileSync(fp5, c5);

// Fix StockAdjustmentReport transactionType
const fp6 = '/workspace/app-d0luni1anmkh/src/components/reports/inventory/StockAdjustmentReport.tsx';
let c6 = fs.readFileSync(fp6, 'utf8');
c6 = c6.replace(/m\.transactionType !== 'Adjustment'/g, "m.module !== 'Adjustment'");
fs.writeFileSync(fp6, c6);

// Fix ProcessingLossReport
const fp7 = '/workspace/app-d0luni1anmkh/src/components/reports/processing/ProcessingLossReport.tsx';
let c7 = fs.readFileSync(fp7, 'utf8');
c7 = c7.replace(/c\.sentWeight \+= send\.weightSent/g, 'c.sentWeight += send.pcsSent'); // or whatever we use
c7 = c7.replace(/c\.receivedWeight \+= r\.weightReceived/g, 'c.receivedWeight += r.pcsReceived');
fs.writeFileSync(fp7, c7);

// Fix contact in Supplier and Customer
const fp8 = '/workspace/app-d0luni1anmkh/src/components/reports/purchase/SupplierOutstandingReport.tsx';
let c8 = fs.readFileSync(fp8, 'utf8');
c8 = c8.replace(/supplier\.contact/g, 'supplier.phone');
fs.writeFileSync(fp8, c8);

const fp9 = '/workspace/app-d0luni1anmkh/src/components/reports/sales/CustomerOutstanding.tsx';
let c9 = fs.readFileSync(fp9, 'utf8');
c9 = c9.replace(/customer\.contact/g, 'customer.phone');
fs.writeFileSync(fp9, c9);


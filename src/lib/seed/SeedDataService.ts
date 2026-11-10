import { Logger } from '../../lib/logger';
import { useERPStore } from '../../store/useERPStore';

const MONTHS_AGO = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};
/**
 * Demo seed — complete, deterministic pipeline.
 *
 * Every product ships with a 1:1 material BOM (materialId), every purchase is
 * sized so raw stock always covers the manufacturing orders that follow, and
 * the MOs are CREATED + COMPLETED before the demo sales are recorded (sales
 * draw from the finished-goods lots those MOs produce — never from raw).
 *
 * Idempotent per entity: catalog records are matched by code/name and never
 * duplicated; transactions are skipped once a demo purchase exists. A partial
 * older seed cannot be repaired (products created without a BOM cannot be
 * manufactured), so wipe the demo modules and seed again for a clean run.
 */
export class SeedDataService {
  static async seedAll(): Promise<void> {
    const store = useERPStore.getState();

    // Already fully seeded? Any completed demo MO means this demo dataset ran
    // to the end — do nothing.
    if ((store.manufacturingOrders || []).some(o => o.status === 'Completed' && (o.remarks || '') === 'Demo production')) {
      Logger.info('Seed', 'Demo data already seeded, skipping');
      return;
    }
    // Partially seeded (old bug): the surviving catalog cannot be reused
    // safely — bail out with instructions instead of double-seeding.
    if ((store.categories || []).some(c => c.name === 'Raw Materials') || (store.purchases || []).length > 0) {
      Logger.info('Seed', 'Partial demo data exists. Wipe modules (Settings → Advanced Features → Wipe Module Data) and seed again.');
      return;
    }

    Logger.info('Seed', 'Seeding demo data...');
    const add = (arr: any[] | undefined, pred: (x: any) => boolean) => (arr || []).find(pred);
    const ensureCat = (name: string, description: string, type: string) =>
      add(store.categories, (c) => c.name === name)?.id
        ?? store.addCategory({ name, description, type, status: 'Active' });

    const cat1 = ensureCat('Raw Materials', 'Primary raw materials', 'material');
    const cat2 = ensureCat('Finished Products', 'Manufactured goods for sale', 'product');
    ensureCat('Packing Materials', 'Materials for packaging', 'material');
    ensureCat('Consumables', 'Consumable workshop items', 'material');
    ensureCat('Services', 'External services', 'service');

    const ensureMaterial = (code: string, name: string, unit: string, minStockLevel: number, description: string, currentStock: number) =>
      add(store.materials, (m) => m.code === code)?.id
        ?? store.addRawMaterial({ code, name, categoryId: cat1, unit, minStockLevel, status: 'Active', description, currentStock });

    const m1 = ensureMaterial('RM-STL-001', 'Steel Sheet 3mm', 'Kg', 500, 'Mild steel sheet 3mm thickness', 3000);
    const m2 = ensureMaterial('RM-CPR-002', 'Copper Wire 14AWG', 'Kg', 200, 'Copper winding wire 14 AWG', 1000);
    const m3 = ensureMaterial('RM-ALM-003', 'Aluminum Rod 20mm', 'Kg', 300, 'Aluminum round rod 20mm dia', 1500);
    const m4 = ensureMaterial('RM-PLG-004', 'Plastic Granules HDPE', 'Kg', 400, 'HDPE granules for injection molding', 3000);
    const m5 = ensureMaterial('RM-WOD-005', 'Wood Planks Oak', 'Pcs', 100, 'Oak wood planks 2m x 0.3m', 400);
    const m6 = ensureMaterial('RM-GLS-006', 'Glass Panels 5mm', 'Pcs', 50, 'Tempered glass 5mm 1x1m', 200);
    const m7 = ensureMaterial('RM-RBR-007', 'Rubber Sheets 10mm', 'Pcs', 80, 'Industrial rubber sheet 10mm', 300);
    const m8 = ensureMaterial('RM-CRF-008', 'Carbon Fiber Sheet', 'Pcs', 30, 'Carbon fiber composite sheet', 100);
    const m9 = ensureMaterial('RM-CRT-009', 'Ceramic Tiles 30x30', 'Pcs', 200, 'Industrial ceramic tiles', 600);
    const m10 = ensureMaterial('RM-TEX-010', 'Textile Fabric Polyester', 'Mtr', 150, 'Polyester fabric roll 1.5m width', 500);

    const ensureProduct = (code: string, name: string, description: string, sellingPrice: number, minStockLevel: number, materialId: string) =>
      add(store.products, (p) => p.code === code)?.id
        ?? store.addProduct({ code, name, categoryId: cat2, unit: 'Pcs', sellingPrice, minStockLevel, status: 'Active', description, materialId } as any);

    // 1:1 whole-material BOMs — a legacy 1:1 product is a one-line BOM of 1 × its material.
    const p1 = ensureProduct('FG-MTB-001', 'Metal Bracket Type-A', 'Steel mounting bracket 200x150mm', 45.50, 200, m1);
    const p2 = ensureProduct('FG-ECN-002', 'Electrical Connector 12V', 'Heavy duty 12V connector', 12.75, 500, m2);
    const p3 = ensureProduct('FG-IPL-003', 'Industrial Pulley 6"', 'Cast iron pulley 6 inch', 89.00, 50, m3);
    const p4 = ensureProduct('FG-MFR-004', 'Machine Frame Base 1M', 'Steel frame base 1m x 0.8m', 250.00, 20, m1);
    const p5 = ensureProduct('FG-PGR-005', 'Precision Gear 48T', 'Steel precision gear 48 teeth', 67.30, 100, m1);

    const ensurePartner = (list: any[] | undefined, code: string, data: any, addFn: (d: any) => void) =>
      add(list, (x) => x.code === code)?.id ?? addFn(data);

    const sup1 = ensurePartner(store.suppliers, 'SUP-MTL-001', { code: 'SUP-MTL-001', name: 'MetalCorp Supply', contactPerson: 'John Smith', phone: '+1-555-0101', email: 'john@metalcorp.com', address: '100 Industrial Blvd, Detroit, MI', status: 'Active' }, (d) => store.addSupplier(d));
    const sup2 = ensurePartner(store.suppliers, 'SUP-RMW-002', { code: 'SUP-RMW-002', name: 'RawMats Ltd.', contactPerson: 'Sarah Lee', phone: '+1-555-0102', email: 'sarah@rawmats.com', address: '200 Commerce Dr, Chicago, IL', status: 'Active' }, (d) => store.addSupplier(d));
    const sup3 = ensurePartner(store.suppliers, 'SUP-GLB-003', { code: 'SUP-GLB-003', name: 'Global Materials Inc.', contactPerson: 'Mike Chen', phone: '+1-555-0103', email: 'mike@globalmat.com', address: '50 Trade Center, New York, NY', status: 'Active' }, (d) => store.addSupplier(d));
    const sup4 = ensurePartner(store.suppliers, 'SUP-QSP-004', { code: 'SUP-QSP-004', name: 'Quality Suppliers Co.', contactPerson: 'Emma Wilson', phone: '+1-555-0104', email: 'emma@qualitysup.com', address: '75 Market St, San Francisco, CA', status: 'Active' }, (d) => store.addSupplier(d));
    const sup5 = ensurePartner(store.suppliers, 'SUP-PRM-005', { code: 'SUP-PRM-005', name: 'Prime Materials', contactPerson: 'David Brown', phone: '+1-555-0105', email: 'david@primemat.com', address: '120 Industrial Park, Houston, TX', status: 'Active' }, (d) => store.addSupplier(d));

    const cust1 = ensurePartner(store.customers, 'CUS-BRC-001', { code: 'CUS-BRC-001', name: 'BuildRight Construction', contactPerson: 'Tom Harris', phone: '+1-555-0201', email: 'tom@buildright.com', address: '300 Main St, Denver, CO', status: 'Active' }, (d) => store.addCustomer(d));
    const cust2 = ensurePartner(store.customers, 'CUS-TPM-002', { code: 'CUS-TPM-002', name: 'TechParts Manufacturing', contactPerson: 'Lisa Wang', phone: '+1-555-0202', email: 'lisa@techparts.com', address: '400 Innovation Dr, Austin, TX', status: 'Active' }, (d) => store.addCustomer(d));
    const cust3 = ensurePartner(store.customers, 'CUS-IND-003', { code: 'CUS-IND-003', name: 'Industrial Solutions Inc.', contactPerson: 'Robert Taylor', phone: '+1-555-0203', email: 'robert@indsol.com', address: '500 Factory Rd, Seattle, WA', status: 'Active' }, (d) => store.addCustomer(d));
    const cust4 = ensurePartner(store.customers, 'CUS-PRW-004', { code: 'CUS-PRW-004', name: 'Precision Works Ltd.', contactPerson: 'Anna Martinez', phone: '+1-555-0204', email: 'anna@precisionworks.com', address: '600 Tech Park, Boston, MA', status: 'Active' }, (d) => store.addCustomer(d));
    const cust5 = ensurePartner(store.customers, 'CUS-NEG-005', { code: 'CUS-NEG-005', name: 'National Engineering', contactPerson: 'James Wilson', phone: '+1-555-0205', email: 'james@nateng.com', address: '700 Industrial Ave, Atlanta, GA', status: 'Active' }, (d) => store.addCustomer(d));

    const proc1 = ensurePartner(store.processors, 'PRC-HTT-001', { code: 'PRC-HTT-001', name: 'HeatTreat Services', contactPerson: 'Gary Moore', phone: '+1-555-0301', email: 'gary@heattreat.com', address: '80 Furnace Rd, Cleveland, OH', status: 'Active' }, (d) => store.addProcessor(d));
    const proc2 = ensurePartner(store.processors, 'PRC-SFN-002', { code: 'PRC-SFN-002', name: 'SurfaceFinish Ltd.', contactPerson: 'Nancy White', phone: '+1-555-0302', email: 'nancy@surfacefinish.com', address: '90 Polish St, Portland, OR', status: 'Active' }, (d) => store.addProcessor(d));
    const proc3 = ensurePartner(store.processors, 'PRC-AWB-003', { code: 'PRC-AWB-003', name: 'AssemblyWorks Co.', contactPerson: 'Kevin Park', phone: '+1-555-0303', email: 'kevin@assemblyworks.com', address: '110 Assembly Ln, Nashville, TN', status: 'Active' }, (d) => store.addProcessor(d));

    // Purchases — deterministic, sized so raw stock always covers production
    // (each purchase ≥ 1,500 PCS; steel/copper/aluminum far exceed the 900/300/300
    // pcs the demo MOs draw).
    const PURCHASES: Array<[number, string, string, number, number, number]> = [
      // [monthsAgo, supplier, material, weightKg, ratePerKg, weightPerPieceKg]
      [4, sup1, m1, 5000, 25, 2],
      [3, sup2, m1, 5000, 28, 2],
      [2, sup1, m2, 3000, 60, 1],
      [2, sup3, m3, 3000, 40, 2],
      [2, sup1, m1, 4000, 30, 2],
      [1, sup4, m4, 6000, 10, 1],
      [1, sup5, m5, 4000, 15, 4],
      [1, sup1, m2, 2000, 55, 1],
      [1, sup3, m6, 1500, 45, 1],
      [1, sup2, m7, 2500, 20, 2],
      [1, sup5, m8, 1200, 80, 1],
      [1, sup4, m9, 3000, 12, 2],
      [0, sup1, m10, 2500, 18, 1],
      [0, sup3, m3, 2000, 38, 2],
      [0, sup5, m1, 3000, 27, 2],
    ];

    for (const [monthsAgo, supplierId, materialId, weight, rate, wpp] of PURCHASES) {
      store.addPurchase({
        date: MONTHS_AGO(monthsAgo),
        supplierId,
        materialId,
        weight,
        weightUnit: 'KG',
        ratePerUnit: rate,
        weightPerPiece: wpp,
        remarks: 'Demo purchase',
      });
    }

    // Manufacture the demo products BEFORE selling — FG lots are what sales draw from.
    // 300 pcs each covers the 180 pcs sold per product below, with headroom.
    const MO_PLAN: Array<[number, string, number]> = [[4, p1, 300], [4, p2, 300], [4, p3, 300], [3, p4, 300], [3, p5, 300]];
    for (const [monthsAgo, productId, qty] of MO_PLAN) {
      const moId = store.addManufacturingOrder({
        productId,
        plannedQty: qty,
        date: MONTHS_AGO(monthsAgo),
        remarks: 'Demo production',
      });
      store.completeManufacturingOrder(moId, { date: MONTHS_AGO(Math.max(0, monthsAgo - 1)) });
    }

    // Sales — deterministic; FG lots were created above.
    const SALES: Array<[number, string, string, number, number]> = [
      [2, cust1, p1, 60, 45.50], [2, cust2, p2, 60, 12.75], [2, cust3, p3, 60, 89.00],
      [2, cust4, p4, 60, 250.00], [2, cust5, p5, 60, 67.30],
      [1, cust1, p1, 60, 45.50], [1, cust2, p2, 60, 12.75], [1, cust3, p3, 60, 89.00],
      [1, cust4, p4, 60, 250.00], [1, cust5, p5, 60, 67.30],
      [0, cust1, p1, 60, 45.50], [0, cust2, p2, 60, 12.75], [0, cust3, p3, 60, 89.00],
      [0, cust4, p4, 60, 250.00], [0, cust5, p5, 60, 67.30],
    ];
    for (const [monthsAgo, customerId, productId, pcsSold, pricePerPiece] of SALES) {
      store.addSale({
        date: MONTHS_AGO(monthsAgo),
        customerId,
        productId,
        pcsSold,
        pricePerPiece,
      });
    }

    // Processing dispatches — small, always available against raw stock. Tag
    // each with the first (Initial Processor) stage so the trail shows a real
    // stage instead of "Unstaged".
    const firstStage = [...(useERPStore.getState().processingStages || [])]
      .sort((a, b) => a.sequence - b.sequence)[0];
    const SENDS: Array<[number, string, string, number, number]> = [
      [2, proc1, m1, 50, 5], [2, proc2, m4, 50, 5], [1, proc3, m7, 50, 5],
      [1, proc1, m1, 50, 5], [1, proc2, m4, 50, 5], [0, proc3, m7, 50, 5],
    ];
    for (const [monthsAgo, processorId, materialId, pcsSent, ratePerPiece] of SENDS) {
      store.addProcessingSend({
        date: MONTHS_AGO(monthsAgo),
        processorId,
        materialId,
        pcsSent,
        ratePerPiece,
        stageId: firstStage?.id,
        remarks: 'Demo send',
      });
    }

    Logger.info('Seed', 'Demo data seeded: 5 categories, 10 materials, 5 products (BOM-linked), 5 suppliers, 5 customers, 3 processors, 15 purchases, 5 MOs completed, 15 sales, 6 processing sends');
  }
}

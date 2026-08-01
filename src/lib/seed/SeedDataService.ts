import { useERPStore } from '../../store/useERPStore';
import { Logger } from '../../lib/logger';

const MONTHS_AGO = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};

export class SeedDataService {
  static async seedAll(): Promise<void> {
    const store = useERPStore.getState();
    if (store.categories.length > 5) {
      Logger.info('Seed', 'Data already seeded, skipping');
      return;
    }

    Logger.info('Seed', 'Seeding demo data...');

    const cat1 = store.addCategory({ name: 'Raw Materials', description: 'Primary raw materials', type: 'material', status: 'Active' });
    const cat2 = store.addCategory({ name: 'Finished Products', description: 'Manufactured goods for sale', type: 'product', status: 'Active' });
    const cat3 = store.addCategory({ name: 'Packing Materials', description: 'Materials for packaging', type: 'material', status: 'Active' });
    const cat4 = store.addCategory({ name: 'Consumables', description: 'Consumable workshop items', type: 'material', status: 'Active' });
    const cat5 = store.addCategory({ name: 'Services', description: 'External services', type: 'service', status: 'Active' });

    const m1 = store.addRawMaterial({ code: 'RM-STL-001', name: 'Steel Sheet 3mm', categoryId: cat1, unit: 'Kg', minStockLevel: 500, status: 'Active', description: 'Mild steel sheet 3mm thickness', currentStock: 2000 });
    const m2 = store.addRawMaterial({ code: 'RM-CPR-002', name: 'Copper Wire 14AWG', categoryId: cat1, unit: 'Kg', minStockLevel: 200, status: 'Active', description: 'Copper winding wire 14 AWG', currentStock: 800 });
    const m3 = store.addRawMaterial({ code: 'RM-ALM-003', name: 'Aluminum Rod 20mm', categoryId: cat1, unit: 'Kg', minStockLevel: 300, status: 'Active', description: 'Aluminum round rod 20mm dia', currentStock: 1200 });
    const m4 = store.addRawMaterial({ code: 'RM-PLG-004', name: 'Plastic Granules HDPE', categoryId: cat1, unit: 'Kg', minStockLevel: 400, status: 'Active', description: 'HDPE granules for injection molding', currentStock: 3000 });
    const m5 = store.addRawMaterial({ code: 'RM-WOD-005', name: 'Wood Planks Oak', categoryId: cat1, unit: 'Pcs', minStockLevel: 100, status: 'Active', description: 'Oak wood planks 2m x 0.3m', currentStock: 400 });
    const m6 = store.addRawMaterial({ code: 'RM-GLS-006', name: 'Glass Panels 5mm', categoryId: cat1, unit: 'Pcs', minStockLevel: 50, status: 'Active', description: 'Tempered glass 5mm 1x1m', currentStock: 200 });
    const m7 = store.addRawMaterial({ code: 'RM-RBR-007', name: 'Rubber Sheets 10mm', categoryId: cat1, unit: 'Pcs', minStockLevel: 80, status: 'Active', description: 'Industrial rubber sheet 10mm', currentStock: 300 });
    const m8 = store.addRawMaterial({ code: 'RM-CRF-008', name: 'Carbon Fiber Sheet', categoryId: cat1, unit: 'Pcs', minStockLevel: 30, status: 'Active', description: 'Carbon fiber composite sheet', currentStock: 100 });
    const m9 = store.addRawMaterial({ code: 'RM-CRT-009', name: 'Ceramic Tiles 30x30', categoryId: cat1, unit: 'Pcs', minStockLevel: 200, status: 'Active', description: 'Industrial ceramic tiles', currentStock: 600 });
    const m10 = store.addRawMaterial({ code: 'RM-TEX-010', name: 'Textile Fabric Polyester', categoryId: cat1, unit: 'Mtr', minStockLevel: 150, status: 'Active', description: 'Polyester fabric roll 1.5m width', currentStock: 500 });

    const p1 = store.addProduct({ code: 'FG-MTB-001', name: 'Metal Bracket Type-A', categoryId: cat2, unit: 'Pcs', sellingPrice: 45.50, minStockLevel: 200, status: 'Active', description: 'Steel mounting bracket 200x150mm' });
    const p2 = store.addProduct({ code: 'FG-ECN-002', name: 'Electrical Connector 12V', categoryId: cat2, unit: 'Pcs', sellingPrice: 12.75, minStockLevel: 500, status: 'Active', description: 'Heavy duty 12V connector' });
    const p3 = store.addProduct({ code: 'FG-IPL-003', name: 'Industrial Pulley 6"', categoryId: cat2, unit: 'Pcs', sellingPrice: 89.00, minStockLevel: 50, status: 'Active', description: 'Cast iron pulley 6 inch' });
    const p4 = store.addProduct({ code: 'FG-MFR-004', name: 'Machine Frame Base 1M', categoryId: cat2, unit: 'Pcs', sellingPrice: 250.00, minStockLevel: 20, status: 'Active', description: 'Steel frame base 1m x 0.8m' });
    const p5 = store.addProduct({ code: 'FG-PGR-005', name: 'Precision Gear 48T', categoryId: cat2, unit: 'Pcs', sellingPrice: 67.30, minStockLevel: 100, status: 'Active', description: 'Steel precision gear 48 teeth' });

    const sup1 = store.addSupplier({ code: 'SUP-MTL-001', name: 'MetalCorp Supply', contactPerson: 'John Smith', phone: '+1-555-0101', email: 'john@metalcorp.com', address: '100 Industrial Blvd, Detroit, MI', status: 'Active' });
    const sup2 = store.addSupplier({ code: 'SUP-RMW-002', name: 'RawMats Ltd.', contactPerson: 'Sarah Lee', phone: '+1-555-0102', email: 'sarah@rawmats.com', address: '200 Commerce Dr, Chicago, IL', status: 'Active' });
    const sup3 = store.addSupplier({ code: 'SUP-GLB-003', name: 'Global Materials Inc.', contactPerson: 'Mike Chen', phone: '+1-555-0103', email: 'mike@globalmat.com', address: '50 Trade Center, New York, NY', status: 'Active' });
    const sup4 = store.addSupplier({ code: 'SUP-QSP-004', name: 'Quality Suppliers Co.', contactPerson: 'Emma Wilson', phone: '+1-555-0104', email: 'emma@qualitysup.com', address: '75 Market St, San Francisco, CA', status: 'Active' });
    const sup5 = store.addSupplier({ code: 'SUP-PRM-005', name: 'Prime Materials', contactPerson: 'David Brown', phone: '+1-555-0105', email: 'david@primemat.com', address: '120 Industrial Park, Houston, TX', status: 'Active' });

    const cust1 = store.addCustomer({ code: 'CUS-BRC-001', name: 'BuildRight Construction', contactPerson: 'Tom Harris', phone: '+1-555-0201', email: 'tom@buildright.com', address: '300 Main St, Denver, CO', status: 'Active' });
    const cust2 = store.addCustomer({ code: 'CUS-TPM-002', name: 'TechParts Manufacturing', contactPerson: 'Lisa Wang', phone: '+1-555-0202', email: 'lisa@techparts.com', address: '400 Innovation Dr, Austin, TX', status: 'Active' });
    const cust3 = store.addCustomer({ code: 'CUS-IND-003', name: 'Industrial Solutions Inc.', contactPerson: 'Robert Taylor', phone: '+1-555-0203', email: 'robert@indsol.com', address: '500 Factory Rd, Seattle, WA', status: 'Active' });
    const cust4 = store.addCustomer({ code: 'CUS-PRW-004', name: 'Precision Works Ltd.', contactPerson: 'Anna Martinez', phone: '+1-555-0204', email: 'anna@precisionworks.com', address: '600 Tech Park, Boston, MA', status: 'Active' });
    const cust5 = store.addCustomer({ code: 'CUS-NEG-005', name: 'National Engineering', contactPerson: 'James Wilson', phone: '+1-555-0205', email: 'james@nateng.com', address: '700 Industrial Ave, Atlanta, GA', status: 'Active' });

    const proc1 = store.addProcessor({ code: 'PRC-HTT-001', name: 'HeatTreat Services', contactPerson: 'Gary Moore', phone: '+1-555-0301', email: 'gary@heattreat.com', address: '80 Furnace Rd, Cleveland, OH', status: 'Active' });
    const proc2 = store.addProcessor({ code: 'PRC-SFN-002', name: 'SurfaceFinish Ltd.', contactPerson: 'Nancy White', phone: '+1-555-0302', email: 'nancy@surfacefinish.com', address: '90 Polish St, Portland, OR', status: 'Active' });
    const proc3 = store.addProcessor({ code: 'PRC-AWB-003', name: 'AssemblyWorks Co.', contactPerson: 'Kevin Park', phone: '+1-555-0303', email: 'kevin@assemblyworks.com', address: '110 Assembly Ln, Nashville, TN', status: 'Active' });

    for (let i = 0; i < 15; i++) {
      const monthOffset = Math.floor(i / 3);
      const supplier = [sup1, sup2, sup3, sup4, sup5][i % 5];
      const material = [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10][i % 10];
      const weight = 500 + Math.random() * 1500;
      const rate = 15 + Math.random() * 60;
      const wpp = 0.5 + Math.random() * 2;
      store.addPurchase({
        date: MONTHS_AGO(monthOffset + Math.floor(Math.random() * 2)),
        supplierId: supplier,
        materialId: material,
        weight: Math.round(weight * 100) / 100,
        weightUnit: 'KGs',
        ratePerUnit: Math.round(rate * 100) / 100,
        weightPerPiece: Math.round(wpp * 100) / 100,
        remarks: `Purchase batch ${i + 1} - ${supplier.split(' ')[0]}`,
      });
    }

    for (let i = 0; i < 15; i++) {
      const monthOffset = Math.floor(i / 3);
      const customer = [cust1, cust2, cust3, cust4, cust5][i % 5];
      const product = [p1, p2, p3, p4, p5][i % 5];
      const qty = 10 + Math.floor(Math.random() * 200);
      store.addSale({
        date: MONTHS_AGO(monthOffset),
        customerId: customer,
        productId: product,
        pcsSold: qty,
        pricePerPiece: [45.50, 12.75, 89.00, 250.00, 67.30][i % 5],
      });
    }

    for (let i = 0; i < 6; i++) {
      const processor = [proc1, proc2, proc3][i % 3];
      const material = [m1, m4, m7][i % 3];
      store.addProcessingSend({
        date: MONTHS_AGO(Math.floor(i / 2)),
        processorId: processor,
        materialId: material,
        pcsSent: 50 + Math.floor(Math.random() * 200),
        ratePerPiece: 5 + Math.random() * 20,
        remarks: `Processing batch ${i + 1}`,
      });
    }

    Logger.info('Seed', `Demo data seeded: 5 categories, 10 materials, 5 products, 5 suppliers, 5 customers, 3 processors, 15 purchases, 15 sales, 6 processing sends`);
  }
}

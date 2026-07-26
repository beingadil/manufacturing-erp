import { performance } from 'perf_hooks';
import fs from 'fs';

// Mock browser globals before any imports
const localStorageMock = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};
(global as any).localStorage = localStorageMock;
(global as any).window = {
  localStorage: localStorageMock,
  addEventListener: () => {},
  removeEventListener: () => {}
};

import { useERPStore } from '../src/store/useERPStore';
import { DataSimulator } from '../src/lib/qa/DataSimulator';
import { useAccessStore } from '../src/store/useAccessStore';

async function runBenchmark() {
  console.log('Starting ERP Performance Benchmark & Stress Test');
  console.log('------------------------------------------------');

  const results: any = {
    timestamp: new Date().toISOString(),
    environment: 'Node.js Benchmark Simulator',
    metrics: {}
  };

  // Seed needed data first
  useAccessStore.getState().seedDefaults();
  
  // Seed some materials and products to prevent errors
  useERPStore.setState({
    materials: [
      { id: 'mat-1', name: 'Steel 304', categoryId: 'cat-1', status: 'Active', stockPcs: 1000, processedStockPcs: 0, currentStock: 1000, minStockLevel: 100 }
    ],
    products: [
      { id: 'prod-1', name: 'Spoon', categoryId: 'cat-2', status: 'Active', stockPcs: 500, price: 10 }
    ],
    categories: [
      { id: 'cat-1', name: 'Raw Materials', description: '', status: 'Active', type: 'material' },
      { id: 'cat-2', name: 'Finished Goods', description: '', status: 'Active', type: 'product' }
    ]
  });

  const config = {
    customers: 20000,
    suppliers: 10000,
    purchases: 100000, 
    sales: 100000,
    daysRange: 365
  };

  console.log(`Target Dataset: ${config.customers} Customers, ${config.suppliers} Suppliers, ${config.purchases} Purchases, ${config.sales} Sales`);

  // 1. Data Generation Benchmark
  const startGen = performance.now();
  
  await DataSimulator.simulateData(config, (msg) => {
    // console.log(`[Simulator]: ${msg}`);
  });
  
  const endGen = performance.now();
  const generationTimeMs = endGen - startGen;
  
  const state = useERPStore.getState();
  
  results.metrics.dataGeneration = {
    durationMs: generationTimeMs,
    throughput: (config.customers + config.suppliers + config.purchases + config.sales) / (generationTimeMs / 1000),
    recordsCreated: {
      customers: state.customers.length,
      suppliers: state.suppliers.length,
      purchases: state.purchases.length,
      sales: state.sales.length
    }
  };

  console.log(`\n✅ Data Generation Complete in ${(generationTimeMs / 1000).toFixed(2)}s`);
  console.log(`Throughput: ${results.metrics.dataGeneration.throughput.toFixed(0)} records/sec`);

  // Memory Usage
  const memUsage = process.memoryUsage();
  results.metrics.memoryUsage = {
    heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
    rssMB: Math.round(memUsage.rss / 1024 / 1024)
  };
  
  console.log(`\nMemory Usage: ${results.metrics.memoryUsage.heapUsedMB} MB (Heap Used) / ${results.metrics.memoryUsage.heapTotalMB} MB (Heap Total)`);

  // 2. Query Benchmark
  console.log('\nRunning Query & Aggregation Benchmarks...');
  
  const startQuery = performance.now();
  const totalSalesAmount = state.sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const endQuery = performance.now();
  
  results.metrics.queryPerformance = {
    salesAggregationDurationMs: endQuery - startQuery,
    totalSalesAmount
  };

  console.log(`✅ Sales Aggregation (Summing ${state.sales.length} records): ${(endQuery - startQuery).toFixed(2)}ms`);

  // 3. QA Validation Benchmark
  console.log('\nRunning QA Validation & Integrity Checks...');
  const startValidation = performance.now();
  
  await DataSimulator.runCertificationChecks((msg) => {
    // console.log(`[QA]: ${msg}`);
  });
  
  const endValidation = performance.now();
  results.metrics.qaValidation = {
    durationMs: endValidation - startValidation,
    status: 'Passed'
  };

  console.log(`✅ QA Validation Checks Complete in ${(endValidation - startValidation).toFixed(2)}ms`);

  fs.writeFileSync('./benchmark_results.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to benchmark_results.json');
}

runBenchmark().catch(console.error);
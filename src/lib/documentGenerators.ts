import { format } from 'date-fns';
import { generateEnterpriseDocument } from './pdfEngine';
import { formatNumber } from './utils';

export function generateLedgerStatementPDF(
  partyName: string,
  partyType: string,
  transactions: any[],
  balance: number,
  options?: { title?: string; periodLabel?: string; accountCode?: string },
) {
  const totalDebit = transactions.reduce((sum, t) => sum + (Number(t.debit) || 0), 0);
  const totalCredit = transactions.reduce((sum, t) => sum + (Number(t.credit) || 0), 0);
  const filters = [
    ...(options?.accountCode ? [{ label: 'Account Code', value: options.accountCode }] : []),
    ...(options?.periodLabel ? [{ label: 'Period', value: options.periodLabel }] : []),
  ];

  generateEnterpriseDocument({
    title: options?.title || `${partyType.toUpperCase()} LEDGER STATEMENT`,
    subtitle: `Statement for: ${partyName}`,
    filters,
    tables: [{
      columns: [
        { header: 'Date', dataKey: 'date', format: 'date' },
        { header: 'Ref/Voucher', dataKey: 'referenceNo' },
        { header: 'Description', dataKey: 'description' },
        { header: 'Debit (Dr)', dataKey: 'debit', align: 'right', format: 'currency' },
        { header: 'Credit (Cr)', dataKey: 'credit', align: 'right', format: 'currency' },
        { header: 'Balance', dataKey: 'balance', align: 'right', format: 'currency' }
      ],
      // Raw values — the engine formats them, so the printed statement obeys
      // the Print & PDF currency and date settings. A side with no movement
      // shows the accounting dash rather than a zero amount.
      rows: transactions.map(t => ({
        date: t.date,
        referenceNo: t.referenceNo,
        description: t.description,
        debit: Number(t.debit) ? Number(t.debit) : '-',
        credit: Number(t.credit) ? Number(t.credit) : '-',
        balance: Number(t.balance) || 0,
      })),
      summaryRows: [
        { description: 'TOTAL PERIOD ACTIVITY', debit: totalDebit, credit: totalCredit },
        { description: 'CLOSING BALANCE', balance },
      ]
    }]
  });
}

export function generateInvoicePDF(sale: any, customer: any, product: any) {
  generateEnterpriseDocument({
    title: 'SALES INVOICE',
    documentNo: sale.invoiceNo,
    infoBlock: [
      [
        { label: 'Invoice Date', value: format(new Date(sale.date), 'dd-MMM-yyyy') },
        { label: 'Customer', value: customer?.name || 'Unknown' },
        { label: 'Address', value: customer?.address || 'N/A' }
      ],
      [
        { label: 'Phone', value: customer?.phone || 'N/A' },
        { label: 'NTN/Tax No', value: customer?.ntn || 'N/A' }
      ]
    ],
    tables: [{
      columns: [
        { header: 'Item / Description', dataKey: 'productName' },
        { header: 'Quantity (PCS)', dataKey: 'quantity', align: 'right', format: 'number' },
        { header: 'Unit Price', dataKey: 'price', align: 'right', format: 'currency' },
        { header: 'Total Amount', dataKey: 'total', align: 'right', format: 'currency' }
      ],
      rows: [{
        productName: product?.name || 'Unknown Product',
        quantity: Number(sale.pcsSold) || 0,
        price: Number(sale.pricePerPiece) || 0,
        total: Number(sale.totalAmount) || 0
      }],
      summaryRows: [
        { price: 'TOTAL AMOUNT', total: Number(sale.totalAmount) || 0 }
      ]
    }]
  });
}

export function generateDispatchSlipPDF(dispatch: any, processor: any, material: any) {
  generateEnterpriseDocument({
    title: 'PROCESSING DISPATCH SLIP',
    documentNo: dispatch.dispatchNo,
    infoBlock: [
      [
        { label: 'Dispatch Date', value: format(new Date(dispatch.date), 'dd-MMM-yyyy') },
        { label: 'Processor', value: processor?.name || 'Unknown' }
      ],
      [
        { label: 'Status', value: dispatch.status },
        { label: 'Contact', value: processor?.phone || 'N/A' }
      ]
    ],
    tables: [{
      columns: [
        { header: 'Material Description', dataKey: 'materialName' },
        { header: 'Dispatch Qty (PCS)', dataKey: 'qty', align: 'right', format: 'number' },
        { header: 'Agreed Rate / Pc', dataKey: 'rate', align: 'right', format: 'currency' }
      ],
      rows: [{
        materialName: material?.name || 'Unknown Material',
        qty: Number(dispatch.pcsSent) || 0,
        rate: Number(dispatch.ratePerPiece) || 0
      }]
    }]
  });
}

export function generatePurchaseInvoicePDF(purchase: any, supplier: any, material: any) {
  generateEnterpriseDocument({
    title: 'PURCHASE INVOICE',
    documentNo: purchase.purchaseNo,
    infoBlock: [
      [
        { label: 'Purchase Date', value: format(new Date(purchase.date), 'dd-MMM-yyyy') },
        { label: 'Supplier', value: supplier?.name || 'Unknown' },
        { label: 'Supplier Invoice #', value: purchase.invoiceNo || 'N/A' }
      ],
      [
        { label: 'Address', value: supplier?.address || 'N/A' },
        { label: 'NTN/Tax No', value: supplier?.ntn || 'N/A' }
      ]
    ],
    tables: [{
      columns: [
        { header: 'Material Description', dataKey: 'materialName' },
        { header: 'Weight', dataKey: 'weight', align: 'right' },
        { header: 'PCS (Est.)', dataKey: 'pcs', align: 'right', format: 'number' },
        { header: 'Rate / Unit', dataKey: 'rate', align: 'right', format: 'currency' },
        { header: 'Total Amount', dataKey: 'total', align: 'right', format: 'currency' }
      ],
      rows: [{
        materialName: material?.name || 'Unknown Material',
        weight: `${formatNumber(purchase.weight)} ${purchase.weightUnit}`,
        pcs: Number(purchase.calculatedPcs) || 0,
        rate: Number(purchase.ratePerUnit) || 0,
        total: Number(purchase.amount) || 0
      }],
      summaryRows: [
        { rate: 'TOTAL AMOUNT', total: Number(purchase.amount) || 0 }
      ]
    }]
  });
}

export function generateProcessorBillPDF(bill: any, processor: any, receipts: any[], materials: any[]) {
  const materialMap = new Map(materials.map(m => [m.id, m.name]));

  const formattedReceipts = receipts.map(r => ({
    receiptNo: r.receiveNo,
    date: r.date,
    materialName: materialMap.get(r.materialId) || 'Unknown Material',
    pcs: Number(r.pcsReceived) || 0,
    amount: Number(r.billAmount) || 0
  }));

  generateEnterpriseDocument({
    title: 'PROCESSING BILL',
    documentNo: bill.billNo,
    infoBlock: [
      [
        { label: 'Bill Date', value: format(new Date(bill.date), 'dd-MMM-yyyy') },
        { label: 'Processor', value: processor?.name || 'Unknown' }
      ]
    ],
    tables: [{
      columns: [
        { header: 'Receipt #', dataKey: 'receiptNo' },
        { header: 'Date', dataKey: 'date', format: 'date' },
        { header: 'Material', dataKey: 'materialName' },
        { header: 'Qty Received (PCS)', dataKey: 'pcs', align: 'right', format: 'number' },
        { header: 'Processing Fee', dataKey: 'amount', align: 'right', format: 'currency' }
      ],
      rows: formattedReceipts,
      summaryRows: [
        { pcs: 'TOTAL AMOUNT', amount: Number(bill.totalAmount) || 0 }
      ]
    }]
  });
}

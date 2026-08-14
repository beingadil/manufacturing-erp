import { generateEnterpriseDocument } from './pdfEngine';
import { formatCurrency, formatNumber } from './utils';
import { format } from 'date-fns';

export function generateLedgerStatementPDF(partyName: string, partyType: string, transactions: any[], balance: number) {
  generateEnterpriseDocument({
    title: `${partyType.toUpperCase()} LEDGER STATEMENT`,
    subtitle: `Statement for: ${partyName}`,
    tables: [{
      columns: [
        { header: 'Date', dataKey: 'date' },
        { header: 'Ref/Voucher', dataKey: 'referenceNo' },
        { header: 'Description', dataKey: 'description' },
        { header: 'Debit (Dr)', dataKey: 'debit', align: 'right' },
        { header: 'Credit (Cr)', dataKey: 'credit', align: 'right' },
        { header: 'Balance', dataKey: 'balance', align: 'right' }
      ],
      rows: transactions.map(t => ({
        ...t,
        debit: t.debit > 0 ? formatCurrency(t.debit) : '-',
        credit: t.credit > 0 ? formatCurrency(t.credit) : '-',
        balance: formatCurrency(t.balance)
      })),
      summaryRows: [[
        { description: 'CLOSING BALANCE', balance: formatCurrency(balance) }
      ]]
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
        { header: 'Quantity (PCS)', dataKey: 'quantity', align: 'right' },
        { header: 'Unit Price', dataKey: 'price', align: 'right' },
        { header: 'Total Amount', dataKey: 'total', align: 'right' }
      ],
      rows: [{
        productName: product?.name || 'Unknown Product',
        quantity: formatNumber(sale.pcsSold),
        price: formatCurrency(sale.pricePerPiece),
        total: formatCurrency(sale.totalAmount)
      }],
      summaryRows: [[
        { price: 'TOTAL AMOUNT', total: formatCurrency(sale.totalAmount) }
      ]]
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
        { header: 'Dispatch Qty (PCS)', dataKey: 'qty', align: 'right' },
        { header: 'Agreed Rate / Pc', dataKey: 'rate', align: 'right' }
      ],
      rows: [{
        materialName: material?.name || 'Unknown Material',
        qty: formatNumber(dispatch.pcsSent),
        rate: formatCurrency(dispatch.ratePerPiece)
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
        { header: 'PCS (Est.)', dataKey: 'pcs', align: 'right' },
        { header: 'Rate / Unit', dataKey: 'rate', align: 'right' },
        { header: 'Total Amount', dataKey: 'total', align: 'right' }
      ],
      rows: [{
        materialName: material?.name || 'Unknown Material',
        weight: `${formatNumber(purchase.weight)} ${purchase.weightUnit}`,
        pcs: formatNumber(purchase.calculatedPcs),
        rate: formatCurrency(purchase.ratePerUnit),
        total: formatCurrency(purchase.amount)
      }],
      summaryRows: [[
        { rate: 'TOTAL AMOUNT', total: formatCurrency(purchase.amount) }
      ]]
    }]
  });
}

export function generateProcessorBillPDF(bill: any, processor: any, receipts: any[], materials: any[]) {
  const materialMap = new Map(materials.map(m => [m.id, m.name]));

  const formattedReceipts = receipts.map(r => ({
    receiptNo: r.receiveNo,
    date: format(new Date(r.date), 'dd-MMM-yyyy'),
    materialName: materialMap.get(r.materialId) || 'Unknown Material',
    pcs: formatNumber(r.pcsReceived),
    amount: formatCurrency(r.billAmount)
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
        { header: 'Date', dataKey: 'date' },
        { header: 'Material', dataKey: 'materialName' },
        { header: 'Qty Received (PCS)', dataKey: 'pcs', align: 'right' },
        { header: 'Processing Fee', dataKey: 'amount', align: 'right' }
      ],
      rows: formattedReceipts,
      summaryRows: [[
        { pcs: 'TOTAL AMOUNT', amount: formatCurrency(bill.totalAmount) }
      ]]
    }]
  });
}

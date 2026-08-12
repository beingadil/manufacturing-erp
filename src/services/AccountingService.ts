import { useERPStore } from '../store/useERPStore';
import { ValidationEngine, VoucherValidator, VoucherDTO } from '../lib/validation';
import { BusinessWorkflowEngine } from '../lib/business/BusinessWorkflowEngine';
import { AccountingEngine } from '../lib/accounting/AccountingEngine';

export class AccountingService {
  static createVoucher(data: Omit<VoucherDTO, 'entries' | 'id'>, entries: VoucherDTO['entries']) {
    return BusinessWorkflowEngine.executeWorkflow('Voucher Creation', () => {
      const voucherData: VoucherDTO = {
        ...data,
        entries
      };
      ValidationEngine.validate(new VoucherValidator(), voucherData, 'Voucher Creation');
      
      const state = useERPStore.getState();
      const storeVoucherData = {
        ...data,
        type: data.type as any,
        totalDebit: entries.reduce((sum, e) => sum + (e.debit || 0), 0),
        totalCredit: entries.reduce((sum, e) => sum + (e.credit || 0), 0),
        status: 'Posted' as const,
        narration: data.narration || ''
      };
      state.addVoucher(storeVoucherData as any, entries as any);
      // Party balances are derived from the COMPLETE ledger — never from the
      // latest entry. Recompute after every mutation so the stored balance can
      // never drift from the ledger closing balance (spec §14, §17).
      AccountingEngine.recomputePartyBalances();
    }, 'Voucher created');
  }

  static updateVoucher(id: string, data: Partial<Omit<VoucherDTO, 'entries' | 'id'>>, entries: VoucherDTO['entries']) {
    return BusinessWorkflowEngine.executeWorkflow('Voucher Update', () => {
      const state = useERPStore.getState();
      const existing = state.vouchers.find(v => v.id === id);
      if (!existing) throw new Error('Voucher not found');

      const mergedData = { ...existing, ...data } as any;
      const voucherData: VoucherDTO = {
        id,
        date: mergedData.date,
        type: mergedData.type,
        referenceNo: mergedData.referenceNo,
        sourceModule: mergedData.sourceModule,
        narration: mergedData.narration,
        entries
      };
      ValidationEngine.validate(new VoucherValidator(), voucherData, 'Voucher Update');

      state.updateVoucher(id, data as any, entries as any);
      AccountingEngine.recomputePartyBalances();
    }, 'Voucher updated');
  }

  static deleteVoucher(id: string) {
    return BusinessWorkflowEngine.executeWorkflow('Voucher Deletion', () => {
      const state = useERPStore.getState();
      state.deleteVoucher(id);
      AccountingEngine.recomputePartyBalances();
    }, 'Voucher deleted');
  }

}

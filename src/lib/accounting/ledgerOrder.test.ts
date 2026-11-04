import { describe, expect, it } from "vitest";
import {
  AccountingEngine,
  compareLedgerEntries,
  compareVoucherRows,
} from "./AccountingEngine";
import { CashBookEngine } from "../finance/CashBookEngine";
import type { Account, JournalEntry, Voucher } from "../../types/erp";

const mkVoucher = (
  id: string,
  voucherNo: string,
  date: string,
  createdAt: string,
  status: Voucher["status"] = "Posted"
): Voucher => ({
  id,
  voucherNo,
  date,
  type: "Payment Voucher",
  narration: `Test ${voucherNo}`,
  totalDebit: 10,
  totalCredit: 10,
  status,
  sourceModule: "Manual",
  referenceNo: "",
  createdAt,
  createdBy: "test",
  versionHistory: [],
} as any);

const mkEntry = (id: string, voucherId: string, accountId: string, debit: number, credit: number): JournalEntry =>
  ({ id, voucherId, accountId, debit, credit, narration: "" } as any);

const cashAccount: Account = {
  id: "acc-cash", code: "1001", name: "Cash in Hand", type: "Assets",
  subtypeId: "", openingBalance: 1000, openingBalanceType: "Debit", status: "Active",
} as Account;

const payableAccount: Account = {
  id: "acc-ap", code: "2001", name: "Accounts Payable", type: "Liabilities",
  subtypeId: "", openingBalance: 500, openingBalanceType: "Credit", status: "Active",
} as Account;

describe("compareLedgerEntries — chronological ledger order", () => {
  it("orders by date, then by trailing voucher sequence, then by createdAt, then by id", () => {
    const a = { date: "2026-11-04", voucherNo: "PV-2026-0002", createdAt: "2026-11-04T05:00:00.000Z", id: "b" };
    const b = { date: "2026-11-04", voucherNo: "PV-2026-0001", createdAt: "2026-11-04T09:00:00.000Z", id: "a" };
    const c = { date: "2026-11-04", voucherNo: "PV-2026-0001", createdAt: "2026-11-04T02:00:00.000Z", id: "c" };
    const d = { date: "2026-11-03", voucherNo: "PV-2026-0009", createdAt: "2026-11-03T00:00:00.000Z", id: "d" };
    // d (2026-11-03) → c (seq 1, 02:00) → b (seq 1, 09:00) → a (seq 2)
    expect([a, b, c, d].sort(compareLedgerEntries).map(x => x.id)).toEqual(["d", "c", "a", "b"]);
  });

  it("rows without a numeric voucher sequence sort last within their date", () => {
    const a = { date: "2026-11-04", voucherNo: "ADJ", createdAt: "2026-11-04T01:00:00.000Z", id: "adj" };
    const b = { date: "2026-11-04", voucherNo: "PV-2026-0007", createdAt: "2026-11-04T02:00:00.000Z", id: "seq" };
    expect([a, b].sort(compareLedgerEntries).map(x => x.id)).toEqual(["seq", "adj"]);
  });

  it("compareVoucherRows matches raw compareLedgerEntries", () => {
    const v1 = mkVoucher("v1", "PV-2026-0002", "2026-11-04", "2026-11-04T05:00:00.000Z");
    const v2 = mkVoucher("v2", "PV-2026-0001", "2026-11-04", "2026-11-04T02:00:00.000Z");
    const rows = [
      { date: undefined as undefined, voucher: v1, id: "v1" },
      { date: undefined as undefined, voucher: v2, id: "v2" },
    ];
    expect(rows.sort(compareVoucherRows).map(r => r.id)).toEqual(["v2", "v1"]);
  });
});

describe("AccountingEngine.getLedger — running and closing balance in true chronological order", () => {
  // Simulate the app's storage: journal entries are unshifted (newest first).
  const vouchers = [
    mkVoucher("v5", "PV-2026-0005", "2026-11-04", "2026-11-04T05:00:00.000Z"),
    mkVoucher("v4", "PV-2026-0004", "2026-11-04", "2026-11-04T04:00:00.000Z"),
    mkVoucher("v3", "PV-2026-0003", "2026-11-04", "2026-11-04T03:00:00.000Z"),
    mkVoucher("v2", "PV-2026-0002", "2026-11-04", "2026-11-04T02:00:00.000Z"),
    mkVoucher("v1", "PV-2026-0001", "2026-11-04", "2026-11-04T01:00:00.000Z"),
  ];
  const entries = [
    mkEntry("je5", "v5", "acc-cash", 0, 10),
    mkEntry("je4", "v4", "acc-cash", 0, 10),
    mkEntry("je3", "v3", "acc-cash", 0, 10),
    mkEntry("je2", "v2", "acc-cash", 0, 10),
    mkEntry("je1", "v1", "acc-cash", 0, 10),
  ];

  it("rows come out in issuance order and the closing balance equals opening plus sum of deltas", () => {
    const { rows, openingBalance } = AccountingEngine.getLedger("acc-cash", [cashAccount], entries, vouchers);
    expect(openingBalance).toBe(1000);
    expect(rows.map(r => r.voucher?.voucherNo)).toEqual([
      "PV-2026-0001", "PV-2026-0002", "PV-2026-0003", "PV-2026-0004", "PV-2026-0005",
    ]);
    expect(rows.map(r => r.runningBalance)).toEqual([990, 980, 970, 960, 950]);
    expect(rows[rows.length - 1].runningBalance).toBe(950);
  });

  it("credit-normal accounts subtract their debits from opening", () => {
    const pv = mkVoucher("v9", "CP-2026-0001", "2026-11-04", "2026-11-04T01:00:00.000Z");
    const je = mkEntry("je9", "v9", "acc-ap", 200, 0);
    const { rows, openingBalance } = AccountingEngine.getLedger("acc-ap", [payableAccount], [je], [pv]);
    expect(openingBalance).toBe(500);
    expect(rows[0].runningBalance).toBe(300);
  });

  it("entries before dateFrom roll into the opening balance", () => {
    const older = mkVoucher("v0", "PV-2026-0000", "2026-11-01", "2026-11-01T09:00:00.000Z");
    const je0 = mkEntry("je0", "v0", "acc-cash", 0, 25);
    const inRange = mkVoucher("v1b", "PV-2026-0006", "2026-11-05", "2026-11-05T09:00:00.000Z");
    const je1 = mkEntry("je1b", "v1b", "acc-cash", 0, 10);
    const { rows, openingBalance } = AccountingEngine.getLedger(
      "acc-cash",
      [cashAccount],
      [je0, je1],
      [older, inRange],
      "2026-11-02"
    );
    expect(openingBalance).toBe(975); // 1000 − 25 (prior entry, credit-normal side)
    expect(rows.map(r => r.voucher?.voucherNo)).toEqual(["PV-2026-0006"]);
    expect(rows[0].runningBalance).toBe(965);
  });

  it("cancelled vouchers are excluded entirely", () => {
    const v = mkVoucher("vX", "PV-2026-0099", "2026-11-04", "2026-11-04T06:00:00.000Z", "Cancelled");
    const je = mkEntry("jeX", "vX", "acc-cash", 0, 999);
    const { rows, openingBalance } = AccountingEngine.getLedger("acc-cash", [cashAccount], [je], [v]);
    expect(rows).toHaveLength(0);
    expect(openingBalance).toBe(1000);
  });
});

describe("CashBookEngine.getCashBook — chronological rows and running cash balance", () => {
  it("same-day rows are computed in issuance order", () => {
    const vouchers = [
      mkVoucher("c5", "BP-2026-0003", "2026-11-04", "2026-11-04T05:00:00.000Z"),
      mkVoucher("c4", "CR-2026-0002", "2026-11-04", "2026-11-04T04:00:00.000Z"),
      mkVoucher("c3", "BP-2026-0002", "2026-11-04", "2026-11-04T03:00:00.000Z"),
      mkVoucher("c2", "CP-2026-0002", "2026-11-04", "2026-11-04T02:00:00.000Z"),
      mkVoucher("c1", "BP-2026-0001", "2026-11-04", "2026-11-04T01:00:00.000Z"),
    ];
    const entries = [
      mkEntry("e5", "c5", "acc-cash", 0, 100), // payment 100
      mkEntry("e4", "c4", "acc-cash", 250, 0), // receipt 250
      mkEntry("e3", "c3", "acc-cash", 0, 30),  // payment 30
      mkEntry("e2", "c2", "acc-cash", 60, 0),  // receipt 60
      mkEntry("e1", "c1", "acc-cash", 0, 10),  // payment 10
    ];
    const { rows, openingBalance } = CashBookEngine.getCashBook(
      ["acc-cash"],
      [cashAccount],
      entries,
      vouchers
    );
    expect(openingBalance).toBe(1000);
    expect(rows.map(r => r.voucherNo)).toEqual([
      "BP-2026-0001", "CP-2026-0002", "BP-2026-0002", "CR-2026-0002", "BP-2026-0003",
    ]);
    expect(rows.map(r => r.balance)).toEqual([990, 1050, 1020, 1270, 1170]);
  });
});

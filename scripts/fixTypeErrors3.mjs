import fs from 'fs';
import path from 'path';

// Fix ReceivableAgingReport
const fp1 = '/workspace/app-d0luni1anmkh/src/components/reports/financial/ReceivableAgingReport.tsx';
let c1 = fs.readFileSync(fp1, 'utf8');
c1 = c1.replace(/formatCurrency\(item\.age30\)/g, 'formatCurrency(item.age30 as number)');
c1 = c1.replace(/formatCurrency\(item\.age60\)/g, 'formatCurrency(item.age60 as number)');
c1 = c1.replace(/formatCurrency\(item\.age90\)/g, 'formatCurrency(item.age90 as number)');
c1 = c1.replace(/formatCurrency\(item\.ageOlder\)/g, 'formatCurrency(item.ageOlder as number)');
fs.writeFileSync(fp1, c1);

// Fix ProcessingLossReport
const fp7 = '/workspace/app-d0luni1anmkh/src/components/reports/processing/ProcessingLossReport.tsx';
let c7 = fs.readFileSync(fp7, 'utf8');
c7 = c7.replace(/send\.weightSent/g, '(send as any).weightSent || send.pcsSent');
c7 = c7.replace(/r\.weightReceived/g, '(r as any).weightReceived || r.pcsReceived');
fs.writeFileSync(fp7, c7);


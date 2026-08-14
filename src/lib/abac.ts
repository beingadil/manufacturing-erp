export function filterFinancialData(data: any[], _profile: any, isAdmin: boolean, policies: any[]) {
  if (isAdmin) return data;
  
  // Default fallback: if no policy is defined, they see nothing
  if (!policies || policies.length === 0) {
    return [];
  }

  let maxAmount = 0;
  let canViewAll = false;
  let maskFields = false;
  let allowedPeriodsDays = 0;

  for (const p of policies) {
    if (p.access_level === 'ALL') canViewAll = true;
    if (p.max_amount > maxAmount || !p.max_amount) maxAmount = p.max_amount || 9999999999;
    if (p.mask_sensitive_fields) maskFields = true;
    if (p.allowed_periods_days > allowedPeriodsDays || !p.allowed_periods_days) allowedPeriodsDays = p.allowed_periods_days || 999999;
  }

  const now = new Date().getTime();

  return data.map(item => {
    // Check Cross-period access (allowed_periods_days)
    if (item.date || item.createdAt) {
      const itemDate = new Date(item.date || item.createdAt).getTime();
      const diffDays = (now - itemDate) / (1000 * 3600 * 24);
      if (!canViewAll && diffDays > allowedPeriodsDays) {
        return null;
      }
    }

    // Check amount threshold
    const itemAmount = item.amount || item.totalAmount || item.debit || item.credit || 0;
    if (!canViewAll && itemAmount > maxAmount) {
      return null;
    }

    // Mask sensitive fields
    if (maskFields) {
      return {
        ...item,
        amount: '***',
        totalAmount: '***',
        debit: item.debit ? '***' : 0,
        credit: item.credit ? '***' : 0,
        balance: '***',
        ratePerUnit: '***',
        ratePerPiece: '***'
      };
    }

    return item;
  }).filter(Boolean);
}

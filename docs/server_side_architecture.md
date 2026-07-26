# 海量数据集报表系统：服务器端分页与聚合过滤架构设计

## 1. 系统架构设计

由于原系统采用前端数据持久化方案，在面对海量数据时会面临性能瓶颈。为了支持海量数据集的报表系统，我们将引入基于 **BaaS（如 Supabase / PostgreSQL）** 或独立后端（Node.js/Express + Prisma/Sequelize）的服务器端架构。

### 1.1 总体架构
- **前端展示层**：React + Vite + shadcn/ui + Zustand
- **API 网关/业务逻辑层**：RESTful API (Express/NestJS) 或 Supabase Edge Functions
- **数据持久层**：PostgreSQL
- **缓存层**：Redis（用于缓存高频聚合查询结果）

### 1.2 核心流程设计
1. **查询请求**：前端构建查询对象（包含 pagination, filters, aggregations, sorting），发送至后端。
2. **SQL 优化引擎**：后端将查询对象解析为优化的 SQL 语句，利用数据库索引和物化视图。
3. **缓存命中**：对于复杂的聚合报表，先查询 Redis 缓存，如果未命中再查库并异步写入缓存。
4. **分页返回**：结合元数据（总记录数、总页数等）将当前页数据返回前端。

---

## 2. API 接口规范

所有的报表查询统一采用标准化 RESTful 接口设计（以 HTTP POST 为主，方便传递复杂的 JSON 查询条件）。

### 2.1 统一报表查询接口
`POST /api/v1/reports/query`

**请求参数 (Request Body):**
```json
{
  "resource": "sales", 
  "pagination": {
    "offset": 0,
    "limit": 50
  },
  "filters": {
    "logic": "AND",
    "conditions": [
      { "field": "date", "operator": "BETWEEN", "value": ["2026-01-01", "2026-12-31"] },
      { "field": "amount", "operator": "GTE", "value": 10000 },
      { "field": "status", "operator": "IN", "value": ["Completed", "Pending"] }
    ]
  },
  "aggregations": [
    { "type": "SUM", "field": "total_amount", "alias": "totalSales" },
    { "type": "COUNT", "field": "id", "alias": "orderCount" }
  ],
  "groupBy": ["region", "product_id", "date_trunc('month', date)"],
  "sort": [
    { "field": "totalSales", "direction": "DESC" }
  ]
}
```

**响应参数 (Response Body):**
```json
{
  "success": true,
  "data": [
    { "region": "North", "product_id": "P001", "month": "2026-07", "totalSales": 500000, "orderCount": 120 }
  ],
  "meta": {
    "pagination": {
      "totalRecords": 10000,
      "currentPage": 1,
      "totalPages": 200,
      "hasNextPage": true
    },
    "executionTimeMs": 145
  }
}
```

---

## 3. 各占位符报表的数据聚合实现方案

### 3.1 销售报表：按地区、产品、时间段聚合
**聚合逻辑与 SQL 实现：**
```sql
SELECT 
    c.region,
    p.name AS product_name,
    DATE_TRUNC('month', s.date) AS period,
    SUM(s.total_amount) AS total_revenue,
    COUNT(s.id) AS order_count
FROM sales s
JOIN customers c ON s.customer_id = c.id
JOIN products p ON s.product_id = p.id
WHERE s.date BETWEEN $1 AND $2
GROUP BY c.region, p.name, DATE_TRUNC('month', s.date)
ORDER BY total_revenue DESC
LIMIT $3 OFFSET $4;
```
**前端呈现：** 热力图或多维数据透视表，直观展示不同地区的核心产品销量。

### 3.2 用户报表：按注册时间、等级、活跃度聚合
**聚合逻辑与 SQL 实现：**
```sql
SELECT 
    DATE_TRUNC('week', created_at) AS registration_week,
    user_level,
    CASE 
        WHEN last_login > NOW() - INTERVAL '7 days' THEN 'Highly Active'
        WHEN last_login > NOW() - INTERVAL '30 days' THEN 'Active'
        ELSE 'Inactive'
    END AS activity_status,
    COUNT(id) AS user_count
FROM users
GROUP BY registration_week, user_level, activity_status
ORDER BY registration_week DESC;
```
**前端呈现：** 漏斗图、环形图及时间序列柱状图，了解用户留存与分布。

### 3.3 库存报表：按仓库、商品类别聚合
**聚合逻辑与 SQL 实现（包含周转率）：**
```sql
WITH sales_summary AS (
    SELECT product_id, SUM(pcs_sold) as total_sold
    FROM sales
    WHERE date BETWEEN $1 AND $2
    GROUP BY product_id
)
SELECT 
    w.name AS warehouse_name,
    c.name AS category_name,
    SUM(i.stock_pcs) AS total_stock,
    COALESCE(SUM(ss.total_sold) / NULLIF(AVG(i.stock_pcs), 0), 0) AS turnover_rate
FROM inventory i
JOIN products p ON i.product_id = p.id
JOIN categories c ON p.category_id = c.id
JOIN warehouses w ON i.warehouse_id = w.id
LEFT JOIN sales_summary ss ON p.id = ss.product_id
GROUP BY w.name, c.name;
```
**前端呈现：** 使用指标卡片高亮低周转率的商品类别，以及堆叠柱状图显示各仓库库存分布。

### 3.4 财务报表：按部门、成本类型聚合
**聚合逻辑与 SQL 实现（收入、支出、利润）：**
```sql
SELECT 
    d.name AS department_name,
    a.subtype AS cost_type,
    SUM(CASE WHEN e.type = 'Credit' AND a.type = 'Revenue' THEN e.amount ELSE 0 END) AS total_income,
    SUM(CASE WHEN e.type = 'Debit' AND a.type = 'Expenses' THEN e.amount ELSE 0 END) AS total_expense,
    (
      SUM(CASE WHEN e.type = 'Credit' AND a.type = 'Revenue' THEN e.amount ELSE 0 END) - 
      SUM(CASE WHEN e.type = 'Debit' AND a.type = 'Expenses' THEN e.amount ELSE 0 END)
    ) AS net_profit
FROM ledger_entries e
JOIN accounts a ON e.account_id = a.id
JOIN departments d ON e.department_id = d.id
WHERE e.date BETWEEN $1 AND $2
GROUP BY d.name, a.subtype
ORDER BY net_profit DESC;
```
**前端呈现：** 瀑布图或利润树形图，按部门追踪成本和利润贡献。

---

## 4. 数据库与性能优化建议

### 4.1 索引优化
针对上述高频聚合与过滤，需在 PostgreSQL 中建立合适的复合索引和部分索引：
- **日期范围索引**：`CREATE INDEX idx_sales_date ON sales(date);`
- **外键关联索引**：`CREATE INDEX idx_sales_customer_product ON sales(customer_id, product_id);`
- **JSONB 灵活过滤索引**：如果使用 JSONB 存储可扩展属性，添加 GIN 索引 `CREATE INDEX idx_custom_fields ON sales USING GIN (custom_fields);`

### 4.2 物化视图 (Materialized Views)
对于不需要毫秒级实时的数据（如历史月度报表），可建立物化视图：
```sql
CREATE MATERIALIZED VIEW mv_monthly_sales_summary AS
SELECT DATE_TRUNC('month', date) AS month, product_id, SUM(total_amount) AS revenue
FROM sales
GROUP BY DATE_TRUNC('month', date), product_id;

-- 设定 Cron Job 每天凌晨刷新：
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_sales_summary;
```

---

## 5. 安全与可靠性考虑

1. **查询超时控制**：
   在数据库配置或连接池级别设定 `statement_timeout = '15s'`，防止极其复杂的恶意过滤条件阻塞数据库进程。
2. **行级安全 (RLS)**：
   确保 Supabase/PostgreSQL 的 RLS 策略对于聚合查询同样生效，查询执行时只会聚合用户有权限访问的行：
   `CREATE POLICY "Users can only view their department sales" ON sales FOR SELECT USING (department_id = auth.jwt()->>'dept_id');`
3. **API 速率限制 (Rate Limiting)**：
   在网关层使用 Redis Token Bucket 算法，限制报表导出与重度聚合查询的频率（如每分钟最多 10 次聚合请求）。
4. **审计日志 (Audit Logging)**：
   利用 PostgreSQL 触发器，在核心表数据发生变化时，将变更前后记录（OLD/NEW）写入 `audit_logs` 表，以便追踪数据修改操作。


# Requirements Document Update: W-RAW ERP PROFESSIONAL Access Management Module Enhancement

## 1. Goals and Non-Goals

### 1.1 Goals
- Enhance existing Access Management module at /users without recreating the entire structure
- Complete Users tab with full CRUD operations (Add, Edit, Delete, Activate/Deactivate, Change Password, Reset Password)
- Implement functional Roles & Permissions management (add/edit/delete roles, permission matrix)
- Add Login History tracking (simple version: User, Login Time, Logout Time, Status)
- Improve Audit Logs with filtering and search capabilities
- Implement comprehensive route guards aligned with permission matrix
- Ensure all tables support search, sorting, pagination, and relevant filters
- Maintain consistent UI/UX using shadcn/ui components, dark/light mode, mobile responsiveness
- Apply validation rules (duplicate prevention, role constraints, password requirements)
- Keep solution simple and practical for small manufacturing ERP with 1-2 daily users
- **Add default chart of accounts seeding functionality on Settings page**

### 1.2 Non-Goals
- Multi-company or multi-branch management
- Department hierarchy or organizational structure
- IP address restrictions or device tracking
- Session monitoring or concurrent login limits
- Complex approval workflows
- Advanced security features (2FA, biometric authentication)
- User self-registration or password recovery without admin intervention
- Role-based UI customization beyond permission-based visibility
- Integration with external identity providers

---

## 2. Existing Functionality to Retain

### 2.1 Current Implementation
- Single page at /users (UserManagement.tsx) with four tabs
- Users tab: profile listing, basic search, Add User modal calling admin-create-user Edge Function, inline role/department/cost center/status selection
- Roles & Permissions tab: role listing, role selection, permission matrix display (grouped by module/action)
- Data Policies tab: read-only list of data_access_policies
- Audit Logs tab: read-only list of audit_logs
- Database tables: roles, permissions, role_permissions, profiles, audit_logs, data_access_policies
- Edge Function: admin-create-user (creates user with service role, updates profile)
- AuthContext: isAdmin, hasPermission(module, action), permissions
- RouteGuard: uses hasPermission for procurement, processing, sales, ledgers, reports
- DashboardLayout: shows Access Management only for isAdmin, hides nav items based on hasPermission

### 2.2 Components to Retain and Enhance
- UserManagement.tsx structure (four-tab layout)
- admin-create-user Edge Function (extend for update/delete/password operations)
- AuthContext permission checking logic
- RouteGuard component
- Existing database schema (extend with new tables/columns)
- shadcn/ui component library and design system

---

## 3. Functional Requirements

### 3.1 Users Tab Enhancement

#### 3.1.1 User List Display
- Table columns: Full Name, Username, Email, Phone, Role, Department, Cost Center, Status, Actions
- Support search by Full Name, Username, Email
- Support filtering by Role, Status, Department, Cost Center
- Support sorting by any column
- Implement pagination (10/25/50/100 records per page)
- Display total user count

#### 3.1.2 Add User
- Modal form with fields:
  + Full Name (required)
  + Username (required, unique)
  + Password (required, minimum 8 characters)
  + Email (optional, unique if provided)
  + Phone (optional)
  + Role (required, dropdown from roles table)
  + Department (required, dropdown)
  + Cost Center (required, dropdown)
  + Status (required, default: Active)
- Validations:
  + Check duplicate username (case-insensitive)
  + Check duplicate email if provided (case-insensitive)
  + Validate password strength (minimum 8 characters, at least one letter and one number)
  + Ensure role exists and is active
- On success:
  + Call enhanced admin-create-user Edge Function
  + Create user in Supabase Auth
  + Insert profile record
  + Log action in audit_logs
  + Refresh user list
  + Show success message

#### 3.1.3 Edit User
- Modal form pre-filled with existing data
- Editable fields: Full Name, Username, Email, Phone, Role, Department, Cost Center, Status
- Password field not shown (use separate Change Password action)
- Validations:
  + Check duplicate username/email (exclude current user)
  + Prevent changing own role if logged-in user is only Administrator
  + Validate role assignment
- On success:
  + Call admin-update-user Edge Function
  + Update profile record
  + Update Supabase Auth metadata if needed
  + Log action in audit_logs
  + Refresh user list
  + Show success message

#### 3.1.4 Delete User
- Confirmation dialog showing user details
- Validations:
  + Prevent deleting only Administrator user
  + Prevent deleting own account
  + Warn if user has associated transactions
- On success:
  + Call admin-delete-user Edge Function
  + Delete user from Supabase Auth
  + Soft delete profile record (set deleted_at timestamp)
  + Log action in audit_logs
  + Refresh user list
  + Show success message

#### 3.1.5 Activate/Deactivate User
- Toggle button in Actions column
- Validations:
  + Prevent deactivating only Administrator user
  + Prevent deactivating own account
- On success:
  + Update profile status
  + Update Supabase Auth user status
  + Log action in audit_logs
  + Refresh user list
  + Show success message

#### 3.1.6 Change Password
- Modal form with fields:
  + New Password (required, minimum 8 characters)
  + Confirm Password (required, must match)
- Validations:
  + Validate password strength
  + Ensure passwords match
- On success:
  + Call admin-change-password Edge Function
  + Update password in Supabase Auth
  + Log action in audit_logs
  + Show success message

#### 3.1.7 Reset Password
- Send password reset email via Supabase Auth
- Confirmation dialog
- On success:
  + Trigger Supabase Auth password reset flow
  + Log action in audit_logs
  + Show success message with instructions

### 3.2 Roles & Permissions Tab Enhancement

#### 3.2.1 Default Roles
- System includes three default roles:
  + Administrator: full system access, cannot be deleted
  + Accountant: access to accounting, reports, limited business operations
  + Staff: basic access to assigned modules
- Default roles can have permissions modified but cannot be deleted

#### 3.2.2 Role List Display
- Table columns: Role Name, Description, User Count, Type (Default/Custom), Actions
- Support search by Role Name
- Support filtering by Type
- Display total role count

#### 3.2.3 Add Custom Role
- Modal form with fields:
  + Role Name (required, unique)
  + Description (optional)
- Validations:
  + Check duplicate role name (case-insensitive)
  + Validate role name format (alphanumeric, spaces, hyphens)
- On success:
  + Insert role record with type = 'Custom'
  + Log action in audit_logs
  + Refresh role list
  + Show success message
  + Open permission matrix for new role

#### 3.2.4 Edit Role
- Modal form pre-filled with existing data
- Editable fields: Role Name, Description
- Cannot edit Type field
- Validations:
  + Check duplicate role name (exclude current role)
  + Prevent editing default role names (Administrator, Accountant, Staff)
- On success:
  + Update role record
  + Log action in audit_logs
  + Refresh role list
  + Show success message

#### 3.2.5 Delete Role
- Confirmation dialog showing role details and user count
- Validations:
  + Prevent deleting default roles
  + Prevent deleting role with assigned users
  + Show list of users if role is assigned
- On success:
  + Delete role record
  + Delete associated role_permissions records
  + Log action in audit_logs
  + Refresh role list
  + Show success message

#### 3.2.6 Permission Matrix
- Display permissions grouped by module
- Modules:
  + Dashboard
  + Customers
  + Suppliers
  + Processors
  + Raw Materials
  + Products
  + Purchases
  + Sales
  + Processing
  + Inventory
  + Accounting
  + Reports
  + Settings
- Actions per module: View, Create, Edit, Delete, Print, Export
- Matrix layout: rows = modules, columns = actions
- Checkboxes to toggle permissions for selected role
- Administrator role has all permissions checked and disabled (cannot be modified)
- On permission change:
  + Update role_permissions table
  + Log action in audit_logs
  + Show success message
  + Refresh AuthContext permissions if current user's role is modified

### 3.3 Data Policies Tab (No Changes)
- Retain existing read-only display of data_access_policies
- No functional changes required in this phase

### 3.4 Audit Logs Tab Enhancement

#### 3.4.1 Audit Log Display
- Table columns: Date, Time, User, Module, Action, Record ID, Details
- Support search by User, Module, Action, Record ID
- Support filtering by Date Range, Module, Action
- Support sorting by Date/Time (default: newest first)
- Implement pagination (25/50/100 records per page)
- Display total log count

#### 3.4.2 Tracked Actions
- User Management: User Created, User Updated, User Deleted, User Activated, User Deactivated, Password Changed, Password Reset
- Role Management: Role Created, Role Updated, Role Deleted, Permission Updated
- Business Operations: Purchase Created, Purchase Edited, Purchase Deleted, Sale Created, Sale Edited, Sale Deleted, Processing Created, Processing Edited, Processing Deleted
- Accounting: Voucher Created, Voucher Edited, Voucher Deleted, Account Created, Account Modified, Account Deleted
- Inventory: Stock Updated, Batch Created, Batch Modified
- Settings: Settings Updated, Logo Changed, Company Info Updated, Chart of Accounts Seeded

#### 3.4.3 Log Entry Format
- Timestamp: ISO 8601 format
- User: Full Name and Username
- Module: Module name (e.g., Users, Purchases, Accounting)
- Action: Action performed (e.g., Created, Edited, Deleted)
- Record ID: Identifier of affected record
- Details: JSON object with before/after values for edits, or relevant context

### 3.5 Login History Tab (New)

#### 3.5.1 Login History Display
- Table columns: User, Login Time, Logout Time, Status
- Status values: Active (currently logged in), Logged Out, Session Expired
- Support search by User
- Support filtering by Date Range, Status
- Support sorting by Login Time (default: newest first)
- Implement pagination (25/50/100 records per page)
- Display total session count

#### 3.5.2 Login Tracking
- Record login event when user successfully authenticates
- Record logout event when user explicitly logs out
- Mark session as expired if user does not log out (based on Supabase Auth session expiry)
- No device or IP tracking (keep simple)

### 3.6 Settings Page Enhancement (New)

#### 3.6.1 Seed Default Chart of Accounts Button
- Display button labeled \"Seed Default Chart of Accounts\" on Settings page
- Button visible only to users with Settings > Edit permission
- On button click:
  + Show confirmation dialog with message: \"This will create a default chart of accounts structure. Existing accounts will not be affected. Do you want to continue?\"
  + Dialog includes Cancel and Confirm buttons
- On confirmation:
  + Call seed-chart-of-accounts Edge Function
  + Show loading indicator during operation
  + On success: display toast notification \"Default chart of accounts seeded successfully\"
  + On failure: display toast notification \"Failed to seed chart of accounts. Please try again or contact support.\"
  + Log action in audit_logs (Module: Settings, Action: Chart of Accounts Seeded)

#### 3.6.2 Default Chart of Accounts Structure
- Asset accounts:
  + Current Assets: Cash, Bank Accounts, Accounts Receivable, Inventory (Raw Materials, Work in Progress, Finished Goods), Prepaid Expenses
  + Fixed Assets: Land, Buildings, Machinery, Equipment, Vehicles, Accumulated Depreciation
- Liability accounts:
  + Current Liabilities: Accounts Payable, Short-term Loans, Accrued Expenses, Taxes Payable
  + Long-term Liabilities: Long-term Loans, Bonds Payable
- Equity accounts:
  + Owner's Equity, Retained Earnings, Current Year Earnings
- Revenue accounts:
  + Sales Revenue, Service Revenue, Other Income
- Expense accounts:
  + Cost of Goods Sold, Raw Material Purchases, Direct Labor, Manufacturing Overhead
  + Operating Expenses: Salaries, Rent, Utilities, Depreciation, Marketing, Administrative Expenses
  + Financial Expenses: Interest Expense, Bank Charges

#### 3.6.3 Seeding Logic
- Check if chart of accounts already exists (if accounts table has records)
- If accounts exist, skip seeding and show message: \"Chart of accounts already exists. Seeding skipped.\"
- If no accounts exist, insert default account structure with appropriate account codes, names, types, and parent-child relationships
- Ensure account codes follow standard numbering convention (e.g., 1000-1999 for Assets, 2000-2999 for Liabilities, etc.)

---

## 4. Database Schema Changes

### 4.1 New Table: login_history

```sql
CREATE TABLE public.login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logout_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Logged Out', 'Session Expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_history_user_id ON public.login_history(user_id);
CREATE INDEX idx_login_history_login_time ON public.login_history(login_time DESC);
```

### 4.2 Modify Table: profiles

```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX idx_profiles_username ON public.profiles(LOWER(username)) WHERE deleted_at IS NULL;
```

### 4.3 Modify Table: roles

```sql
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Custom' CHECK (type IN ('Default', 'Custom'));
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS description TEXT;
```

### 4.4 Seed Data: Default Roles and Permissions

```sql
-- Insert default roles
INSERT INTO public.roles (name, type, description) VALUES
  ('Administrator', 'Default', 'Full system access with all permissions'),
  ('Accountant', 'Default', 'Access to accounting, reports, and limited business operations'),
  ('Staff', 'Default', 'Basic access to assigned modules')
ON CONFLICT (name) DO NOTHING;

-- Insert permissions (module + action combinations)
INSERT INTO public.permissions (module, action) VALUES
  ('Dashboard', 'View'),
  ('Customers', 'View'), ('Customers', 'Create'), ('Customers', 'Edit'), ('Customers', 'Delete'), ('Customers', 'Print'), ('Customers', 'Export'),
  ('Suppliers', 'View'), ('Suppliers', 'Create'), ('Suppliers', 'Edit'), ('Suppliers', 'Delete'), ('Suppliers', 'Print'), ('Suppliers', 'Export'),
  ('Processors', 'View'), ('Processors', 'Create'), ('Processors', 'Edit'), ('Processors', 'Delete'), ('Processors', 'Print'), ('Processors', 'Export'),
  ('Raw Materials', 'View'), ('Raw Materials', 'Create'), ('Raw Materials', 'Edit'), ('Raw Materials', 'Delete'), ('Raw Materials', 'Print'), ('Raw Materials', 'Export'),
  ('Products', 'View'), ('Products', 'Create'), ('Products', 'Edit'), ('Products', 'Delete'), ('Products', 'Print'), ('Products', 'Export'),
  ('Purchases', 'View'), ('Purchases', 'Create'), ('Purchases', 'Edit'), ('Purchases', 'Delete'), ('Purchases', 'Print'), ('Purchases', 'Export'),
  ('Sales', 'View'), ('Sales', 'Create'), ('Sales', 'Edit'), ('Sales', 'Delete'), ('Sales', 'Print'), ('Sales', 'Export'),
  ('Processing', 'View'), ('Processing', 'Create'), ('Processing', 'Edit'), ('Processing', 'Delete'), ('Processing', 'Print'), ('Processing', 'Export'),
  ('Inventory', 'View'), ('Inventory', 'Print'), ('Inventory', 'Export'),
  ('Accounting', 'View'), ('Accounting', 'Create'), ('Accounting', 'Edit'), ('Accounting', 'Delete'), ('Accounting', 'Print'), ('Accounting', 'Export'),
  ('Reports', 'View'), ('Reports', 'Print'), ('Reports', 'Export'),
  ('Settings', 'View'), ('Settings', 'Edit')
ON CONFLICT (module, action) DO NOTHING;

-- Assign all permissions to Administrator role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Administrator'
ON CONFLICT DO NOTHING;

-- Assign accounting and reports permissions to Accountant role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Accountant'
  AND p.module IN ('Dashboard', 'Accounting', 'Reports', 'Purchases', 'Sales')
ON CONFLICT DO NOTHING;

-- Assign basic view permissions to Staff role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Staff'
  AND p.action = 'View'
  AND p.module IN ('Dashboard', 'Customers', 'Suppliers', 'Products', 'Inventory')
ON CONFLICT DO NOTHING;
```

### 4.5 Database Functions and Triggers

#### 4.5.1 Function: log_login

```sql
CREATE OR REPLACE FUNCTION public.log_login()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.login_history (user_id, login_time, status)
  VALUES (NEW.id, NOW(), 'Active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 4.5.2 Trigger: on_auth_user_login

```sql
CREATE TRIGGER on_auth_user_login
AFTER UPDATE OF last_sign_in_at ON auth.users
FOR EACH ROW
WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
EXECUTE FUNCTION public.log_login();
```

---

## 5. Edge Function Changes

### 5.1 Enhance admin-create-user

#### Current Functionality
- Creates user in Supabase Auth with service role
- Inserts profile record

#### Enhancements
- Add duplicate username/email validation
- Add password strength validation
- Add role existence validation
- Return detailed error messages
- Log action in audit_logs

### 5.2 New Function: admin-update-user

#### Functionality
- Update user profile (full_name, username, email, phone, role_id, department, cost_center, status)
- Validate duplicate username/email (exclude current user)
- Validate role assignment
- Prevent changing own role if only Administrator
- Update Supabase Auth metadata if needed
- Log action in audit_logs
- Return success/error response

### 5.3 New Function: admin-delete-user

#### Functionality
- Validate deletion constraints (not only Administrator, not own account)
- Soft delete profile (set deleted_at timestamp)
- Delete user from Supabase Auth
- Log action in audit_logs
- Return success/error response

### 5.4 New Function: admin-change-password

#### Functionality
- Validate password strength
- Update password in Supabase Auth using service role
- Log action in audit_logs
- Return success/error response

### 5.5 New Function: admin-reset-password

#### Functionality
- Trigger Supabase Auth password reset email
- Log action in audit_logs
- Return success/error response

### 5.6 New Function: seed-chart-of-accounts

#### Functionality
- Check if accounts table has existing records
- If accounts exist, return message: \"Chart of accounts already exists. Seeding skipped.\"
- If no accounts exist, insert default chart of accounts structure
- Insert asset accounts (current assets, fixed assets)
- Insert liability accounts (current liabilities, long-term liabilities)
- Insert equity accounts
- Insert revenue accounts
- Insert expense accounts (COGS, operating expenses, financial expenses)
- Assign appropriate account codes, names, types, and parent-child relationships
- Log action in audit_logs (Module: Settings, Action: Chart of Accounts Seeded)
- Return success/error response

---

## 6. Frontend Component Plan

### 6.1 Reuse Existing Components
- shadcn/ui components: Button, Input, Select, Dialog, Table, Tabs, Badge, Checkbox, Label, Form
- DataTable component (if exists) for table display with sorting, pagination, filtering
- Toast notifications for success/error messages
- Existing UserManagement.tsx structure (four-tab layout)

### 6.2 New/Enhanced Components

#### 6.2.1 UserManagement.tsx
- Enhance Users tab:
  + Replace inline select boxes with Edit User modal
  + Add Delete, Change Password, Reset Password action buttons
  + Implement search, filters, sorting, pagination
  + Add duplicate validation on Add/Edit
- Enhance Roles & Permissions tab:
  + Add role management (Add, Edit, Delete buttons)
  + Implement permission matrix with checkboxes
  + Add role type badge (Default/Custom)
- Add Login History tab:
  + Create new tab component
  + Display login_history table data
  + Implement search, filters, sorting, pagination
- Enhance Audit Logs tab:
  + Add search, filters (date range, module, action)
  + Implement sorting, pagination

#### 6.2.2 AddUserModal.tsx
- Form fields: Full Name, Username, Password, Email, Phone, Role, Department, Cost Center, Status
- Client-side validation (required fields, password strength, email format)
- Call admin-create-user Edge Function
- Handle success/error responses
- Show toast notifications

#### 6.2.3 EditUserModal.tsx
- Pre-fill form with existing user data
- Editable fields: Full Name, Username, Email, Phone, Role, Department, Cost Center, Status
- Client-side validation (duplicate check, role validation)
- Call admin-update-user Edge Function
- Handle success/error responses
- Show toast notifications

#### 6.2.4 DeleteUserDialog.tsx
- Confirmation dialog with user details
- Display validation warnings (only Administrator, own account, associated transactions)
- Call admin-delete-user Edge Function
- Handle success/error responses
- Show toast notifications

#### 6.2.5 ChangePasswordModal.tsx
- Form fields: New Password, Confirm Password
- Client-side validation (password strength, match)
- Call admin-change-password Edge Function
- Handle success/error responses
- Show toast notifications

#### 6.2.6 ResetPasswordDialog.tsx
- Confirmation dialog
- Call admin-reset-password Edge Function
- Handle success/error responses
- Show toast notifications with instructions

#### 6.2.7 AddRoleModal.tsx
- Form fields: Role Name, Description
- Client-side validation (required, duplicate check)
- Insert role record via Supabase client
- Handle success/error responses
- Show toast notifications
- Open permission matrix for new role

#### 6.2.8 EditRoleModal.tsx
- Pre-fill form with existing role data
- Editable fields: Role Name, Description
- Client-side validation (duplicate check, prevent editing default role names)
- Update role record via Supabase client
- Handle success/error responses
- Show toast notifications

#### 6.2.9 DeleteRoleDialog.tsx
- Confirmation dialog with role details and user count
- Display validation warnings (default role, assigned users)
- Delete role record via Supabase client
- Handle success/error responses
- Show toast notifications

#### 6.2.10 PermissionMatrix.tsx
- Display permissions grouped by module
- Checkboxes for each module-action combination
- Disable checkboxes for Administrator role
- On checkbox change:
  + Update role_permissions table via Supabase client
  + Log action in audit_logs
  + Refresh AuthContext permissions if current user's role is modified
- Show toast notifications

#### 6.2.11 LoginHistoryTable.tsx
- Display login_history data
- Columns: User, Login Time, Logout Time, Status
- Implement search, filters, sorting, pagination
- Use DataTable component if available

#### 6.2.12 AuditLogsTable.tsx
- Display audit_logs data
- Columns: Date, Time, User, Module, Action, Record ID, Details
- Implement search, filters (date range, module, action), sorting, pagination
- Use DataTable component if available

#### 6.2.13 SettingsPage.tsx (Enhanced)
- Add \"Seed Default Chart of Accounts\" button
- Button visible only to users with Settings > Edit permission
- On button click, show SeedChartOfAccountsDialog

#### 6.2.14 SeedChartOfAccountsDialog.tsx (New)
- Confirmation dialog with message: \"This will create a default chart of accounts structure. Existing accounts will not be affected. Do you want to continue?\"
- Cancel and Confirm buttons
- On confirmation:
  + Call seed-chart-of-accounts Edge Function
  + Show loading indicator
  + On success: display toast notification \"Default chart of accounts seeded successfully\"
  + On failure: display toast notification \"Failed to seed chart of accounts. Please try again or contact support.\"

### 6.3 Component Hierarchy

```
UserManagement.tsx
├── Tabs
│   ├── Users Tab
│   │   ├── Search/Filter Bar
│   │   ├── Add User Button → AddUserModal
│   │   ├── Users Table
│   │   │   └── Actions Column
│   │   │       ├── Edit Button → EditUserModal
│   │   │       ├── Delete Button → DeleteUserDialog
│   │   │       ├── Activate/Deactivate Toggle
│   │   │       ├── Change Password Button → ChangePasswordModal
│   │   │       └── Reset Password Button → ResetPasswordDialog
│   │   └── Pagination
│   ├── Roles & Permissions Tab
│   │   ├── Add Role Button → AddRoleModal
│   │   ├── Roles Table
│   │   │   └── Actions Column
│   │   │       ├── Edit Button → EditRoleModal
│   │   │       └── Delete Button → DeleteRoleDialog
│   │   └── PermissionMatrix (for selected role)
│   ├── Data Policies Tab (No Changes)
│   ├── Audit Logs Tab
│   │   ├── Search/Filter Bar
│   │   ├── AuditLogsTable
│   │   └── Pagination
│   └── Login History Tab (New)
│       ├── Search/Filter Bar
│       ├── LoginHistoryTable
│       └── Pagination

SettingsPage.tsx
├── Existing Settings Content
└── Seed Default Chart of Accounts Button → SeedChartOfAccountsDialog
```

---

## 7. Route Guard and Permission Mapping Updates

### 7.1 Current Route Guards
- App.tsx guards: procurement, processing, sales, ledgers, reports
- Unguarded routes: categories, materials, products, processors, suppliers, customers, accounting pages

### 7.2 Permission Mapping

| Route | Module | Required Action |
|-------|--------|----------------|
| /dashboard | Dashboard | View |
| /customers | Customers | View |
| /customers/add | Customers | Create |
| /customers/edit/:id | Customers | Edit |
| /suppliers | Suppliers | View |
| /suppliers/add | Suppliers | Create |
| /suppliers/edit/:id | Suppliers | Edit |
| /processors | Processors | View |
| /processors/add | Processors | Create |
| /processors/edit/:id | Processors | Edit |
| /materials | Raw Materials | View |
| /materials/add | Raw Materials | Create |
| /materials/edit/:id | Raw Materials | Edit |
| /products | Products | View |
| /products/add | Products | Create |
| /products/edit/:id | Products | Edit |
| /purchases | Purchases | View |
| /purchases/add | Purchases | Create |
| /purchases/edit/:id | Purchases | Edit |
| /sales | Sales | View |
| /sales/add | Sales | Create |
| /sales/edit/:id | Sales | Edit |
| /processing | Processing | View |
| /processing/dispatch | Processing | Create |
| /processing/receipt | Processing | Create |
| /inventory | Inventory | View |
| /accounting/* | Accounting | View |
| /accounting/vouchers/add | Accounting | Create |
| /accounting/vouchers/edit/:id | Accounting | Edit |
| /reports | Reports | View |
| /settings | Settings | View |
| /settings/edit | Settings | Edit |
| /users | Settings | View (Admin only) |

### 7.3 Implementation Plan
- Update RouteGuard component to accept module and action props
- Wrap all routes in App.tsx with RouteGuard
- Pass appropriate module and action for each route
- Update DashboardLayout to hide nav items based on hasPermission
- Ensure action buttons (Add, Edit, Delete, Print, Export) are conditionally rendered based on permissions
- Ensure \"Seed Default Chart of Accounts\" button on Settings page is visible only to users with Settings > Edit permission

### 7.4 Example Route Guard Usage

```tsx
<Route
  path=\"/customers\"
  element={
    <RouteGuard module=\"Customers\" action=\"View\">
      <CustomersPage />
    </RouteGuard>
  }
/>

<Route
  path=\"/customers/add\"
  element={
    <RouteGuard module=\"Customers\" action=\"Create\">
      <AddCustomerPage />
    </RouteGuard>
  }
/>
```

---

## 8. Audit Logging Approach

### 8.1 Logging Mechanism
- Use Supabase client to insert records into audit_logs table
- Log from both frontend (user actions) and Edge Functions (server-side operations)
- Include context: user_id, module, action, record_id, details (JSON), timestamp

### 8.2 Frontend Logging
- Create utility function `logAudit(module, action, recordId, details)`
- Call after successful operations (create, update, delete)
- Example: After deleting a purchase, call `logAudit('Purchases', 'Deleted', purchaseId, { purchaseNumber, supplier, amount })`
- After seeding chart of accounts, call `logAudit('Settings', 'Chart of Accounts Seeded', null, { accountCount })`

### 8.3 Edge Function Logging
- Include audit logging in all Edge Functions (admin-create-user, admin-update-user, seed-chart-of-accounts, etc.)
- Use service role to insert into audit_logs
- Example: After creating a user, insert audit log with action 'User Created'
- After seeding chart of accounts, insert audit log with action 'Chart of Accounts Seeded'

### 8.4 Audit Log Schema

```sql
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  record_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_module ON public.audit_logs(module);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
```

---

## 9. Validation Rules

### 9.1 User Management Validations

#### Add User
- Full Name: required, max 100 characters
- Username: required, unique (case-insensitive), alphanumeric with underscores/hyphens, 3-30 characters
- Password: required, minimum 8 characters, at least one letter and one number
- Email: optional, valid email format, unique if provided (case-insensitive)
- Phone: optional, valid phone format
- Role: required, must exist in roles table and be active
- Department: required
- Cost Center: required
- Status: required, default Active

#### Edit User
- Same as Add User, except:
  + Username/Email uniqueness check excludes current user
  + Cannot change own role if logged-in user is only Administrator
  + Password field not shown (use Change Password)

#### Delete User
- Cannot delete only Administrator user in system
- Cannot delete own account
- Warn if user has associated transactions (optional: allow with confirmation)

#### Activate/Deactivate User
- Cannot deactivate only Administrator user
- Cannot deactivate own account

#### Change Password
- New Password: required, minimum 8 characters, at least one letter and one number
- Confirm Password: required, must match New Password

#### Reset Password
- User must have valid email address
- Confirmation required before sending reset email

### 9.2 Role Management Validations

#### Add Role
- Role Name: required, unique (case-insensitive), alphanumeric with spaces/hyphens, 3-50 characters
- Description: optional, max 200 characters

#### Edit Role
- Same as Add Role, except:
  + Role Name uniqueness check excludes current role
  + Cannot edit default role names (Administrator, Accountant, Staff)

#### Delete Role
- Cannot delete default roles (Administrator, Accountant, Staff)
- Cannot delete role with assigned users
- Show list of users if role is assigned

### 9.3 Permission Matrix Validations
- Administrator role permissions cannot be modified (all checkboxes disabled)
- At least one role must have full permissions (prevent locking out all admins)

### 9.4 Chart of Accounts Seeding Validations
- Check if accounts table has existing records before seeding
- If accounts exist, skip seeding and show message: \"Chart of accounts already exists. Seeding skipped.\"
- Confirmation required before seeding

### 9.5 Error Messages
- Duplicate username: \"Username already exists. Please choose a different username.\"
- Duplicate email: \"Email already exists. Please use a different email address.\"
- Weak password: \"Password must be at least 8 characters and contain at least one letter and one number.\"
- Invalid role: \"Selected role does not exist or is inactive.\"
- Cannot delete only admin: \"Cannot delete the only Administrator user. Assign another user as Administrator first.\"
- Cannot delete own account: \"You cannot delete your own account.\"
- Cannot deactivate only admin: \"Cannot deactivate the only Administrator user.\"
- Cannot change own role: \"You cannot change your own role while you are the only Administrator.\"
- Role has users: \"Cannot delete role. {count} users are assigned to this role.\"
- Duplicate role name: \"Role name already exists. Please choose a different name.\"
- Cannot edit default role: \"Cannot edit the name of a default role.\"
- Chart of accounts already exists: \"Chart of accounts already exists. Seeding skipped.\"
- Chart of accounts seeding failed: \"Failed to seed chart of accounts. Please try again or contact support.\"

---

## 10. Testing and Acceptance Criteria

### 10.1 Users Tab

#### AC1: Add User
1. Admin user navigates to Access Management > Users tab
2. Clicks Add User button
3. Fills in all required fields (Full Name, Username, Password, Role, Department, Cost Center)
4. Submits form
5. System validates inputs (no duplicates, password strength)
6. User is created in Supabase Auth and profile table
7. Audit log entry is created
8. Success message is displayed
9. User list is refreshed and new user appears

#### AC2: Edit User
1. Admin user navigates to Access Management > Users tab
2. Clicks Edit button for a user
3. Modifies Full Name and Role
4. Submits form
5. System validates inputs (no duplicates, role exists)
6. Profile is updated
7. Audit log entry is created
8. Success message is displayed
9. User list is refreshed with updated data

#### AC3: Delete User
1. Admin user navigates to Access Management > Users tab
2. Clicks Delete button for a user (not own account, not only Administrator)
3. Confirmation dialog appears with user details
4. Admin confirms deletion
5. User is soft deleted (deleted_at set)
6. User is removed from Supabase Auth
7. Audit log entry is created
8. Success message is displayed
9. User list is refreshed and deleted user is removed

#### AC4: Activate/Deactivate User
1. Admin user navigates to Access Management > Users tab
2. Clicks Activate/Deactivate toggle for a user (not own account, not only Administrator)
3. Status is updated in profile and Supabase Auth
4. Audit log entry is created
5. Success message is displayed
6. User list is refreshed with updated status

#### AC5: Change Password
1. Admin user navigates to Access Management > Users tab
2. Clicks Change Password button for a user
3. Enters new password and confirms
4. Submits form
5. System validates password strength and match
6. Password is updated in Supabase Auth
7. Audit log entry is created
8. Success message is displayed

#### AC6: Reset Password
1. Admin user navigates to Access Management > Users tab
2. Clicks Reset Password button for a user
3. Confirmation dialog appears
4. Admin confirms
5. Password reset email is sent via Supabase Auth
6. Audit log entry is created
7. Success message is displayed with instructions

#### AC7: Search and Filter Users
1. Admin user navigates to Access Management > Users tab
2. Enters search term in search box (e.g., username)
3. User list is filtered to show matching results
4. Applies filter by Role (e.g., Accountant)
5. User list is further filtered
6. Clears filters
7. Full user list is displayed

#### AC8: Pagination
1. Admin user navigates to Access Management > Users tab
2. User list displays 25 records per page by default
3. Clicks Next Page button
4. Next 25 records are displayed
5. Changes page size to 50
6. User list displays 50 records per page

### 10.2 Roles & Permissions Tab

#### AC9: Add Custom Role
1. Admin user navigates to Access Management > Roles & Permissions tab
2. Clicks Add Role button
3. Enters Role Name and Description
4. Submits form
5. System validates inputs (no duplicate name)
6. Role is created with type = Custom
7. Audit log entry is created
8. Success message is displayed
9. Role list is refreshed and new role appears
10. Permission matrix opens for new role

#### AC10: Edit Role
1. Admin user navigates to Access Management > Roles & Permissions tab
2. Clicks Edit button for a custom role
3. Modifies Role Name and Description
4. Submits form
5. System validates inputs (no duplicate name, not default role)
6. Role is updated
7. Audit log entry is created
8. Success message is displayed
9. Role list is refreshed with updated data

#### AC11: Delete Role
1. Admin user navigates to Access Management > Roles & Permissions tab
2. Clicks Delete button for a custom role with no assigned users
3. Confirmation dialog appears
4. Admin confirms deletion
5. Role and associated role_permissions are deleted
6. Audit log entry is created
7. Success message is displayed
8. Role list is refreshed and deleted role is removed

#### AC12: Prevent Deleting Default Role
1. Admin user navigates to Access Management > Roles & Permissions tab
2. Attempts to delete Administrator role
3. System displays error message
4. Deletion is prevented

#### AC13: Prevent Deleting Role with Users
1. Admin user navigates to Access Management > Roles & Permissions tab
2. Attempts to delete a role with assigned users
3. Confirmation dialog shows user count and list
4. System displays error message
5. Deletion is prevented

#### AC14: Update Permissions
1. Admin user navigates to Access Management > Roles & Permissions tab
2. Selects a custom role
3. Permission matrix displays with checkboxes
4. Admin checks/unchecks permissions (e.g., grant Purchases > Create)
5. System updates role_permissions table
6. Audit log entry is created
7. Success message is displayed
8. If current user's role is modified, AuthContext permissions are refreshed

#### AC15: Administrator Permissions Locked
1. Admin user navigates to Access Management > Roles & Permissions tab
2. Selects Administrator role
3. Permission matrix displays with all checkboxes checked and disabled
4. Admin cannot modify Administrator permissions

### 10.3 Audit Logs Tab

#### AC16: View Audit Logs
1. Admin user navigates to Access Management > Audit Logs tab
2. Audit logs are displayed in table format
3. Columns: Date, Time, User, Module, Action, Record ID, Details
4. Logs are sorted by Date/Time (newest first)

#### AC17: Search and Filter Audit Logs
1. Admin user navigates to Access Management > Audit Logs tab
2. Enters search term (e.g., username)
3. Audit logs are filtered to show matching results
4. Applies filter by Module (e.g., Purchases)
5. Audit logs are further filtered
6. Applies date range filter (e.g., last 7 days)
7. Audit logs are filtered to selected date range
8. Clears filters
9. Full audit log list is displayed

#### AC18: Pagination
1. Admin user navigates to Access Management > Audit Logs tab
2. Audit logs display 25 records per page by default
3. Clicks Next Page button
4. Next 25 records are displayed

### 10.4 Login History Tab

#### AC19: View Login History
1. Admin user navigates to Access Management > Login History tab
2. Login history is displayed in table format
3. Columns: User, Login Time, Logout Time, Status
4. Records are sorted by Login Time (newest first)

#### AC20: Track Login Events
1. User logs in to system
2. Login event is recorded in login_history table
3. Status is set to Active
4. Login Time is set to current timestamp

#### AC21: Track Logout Events
1. User logs out of system
2. Logout event updates login_history record
3. Logout Time is set to current timestamp
4. Status is changed to Logged Out

#### AC22: Search and Filter Login History
1. Admin user navigates to Access Management > Login History tab
2. Enters search term (e.g., username)
3. Login history is filtered to show matching results
4. Applies filter by Status (e.g., Active)
5. Login history is further filtered
6. Applies date range filter (e.g., today)
7. Login history is filtered to selected date range

### 10.5 Route Guards and Permissions

#### AC23: Route Access Control
1. User with Staff role logs in
2. User navigates to /customers
3. System checks hasPermission('Customers', 'View')
4. If permission exists, page is displayed
5. If permission does not exist, user is redirected to dashboard with error message

#### AC24: Action Button Visibility
1. User with Accountant role navigates to /purchases
2. User has Purchases > View permission
3. User does not have Purchases > Create permission
4. Add Purchase button is hidden
5. Edit and Delete buttons are hidden for purchase records
6. Print and Export buttons are visible if user has corresponding permissions

#### AC25: Navigation Menu Visibility
1. User with Staff role logs in
2. DashboardLayout renders navigation menu
3. Menu items are filtered based on hasPermission
4. User sees Dashboard, Customers, Suppliers, Products, Inventory
5. User does not see Purchases, Sales, Processing, Accounting, Reports, Settings

### 10.6 Validation Rules

#### AC26: Duplicate Username Validation
1. Admin user attempts to add a user with existing username
2. System displays error: \"Username already exists. Please choose a different username.\"
3. User creation is prevented

#### AC27: Weak Password Validation
1. Admin user attempts to add a user with password \"12345\"
2. System displays error: \"Password must be at least 8 characters and contain at least one letter and one number.\"
3. User creation is prevented

#### AC28: Cannot Delete Only Administrator
1. Admin user attempts to delete the only Administrator user
2. System displays error: \"Cannot delete the only Administrator user. Assign another user as Administrator first.\"
3. Deletion is prevented

#### AC29: Cannot Change Own Role
1. Admin user (only Administrator) attempts to change own role to Accountant
2. System displays error: \"You cannot change your own role while you are the only Administrator.\"
3. Role change is prevented

#### AC30: Duplicate Role Name Validation
1. Admin user attempts to add a role with existing name
2. System displays error: \"Role name already exists. Please choose a different name.\"
3. Role creation is prevented

### 10.7 Settings Page - Chart of Accounts Seeding

#### AC31: Seed Default Chart of Accounts Button Visibility
1. User with Settings > Edit permission navigates to Settings page
2. \"Seed Default Chart of Accounts\" button is visible
3. User without Settings > Edit permission navigates to Settings page
4. \"Seed Default Chart of Accounts\" button is hidden

#### AC32: Seed Default Chart of Accounts - Confirmation Dialog
1. Admin user navigates to Settings page
2. Clicks \"Seed Default Chart of Accounts\" button
3. Confirmation dialog appears with message: \"This will create a default chart of accounts structure. Existing accounts will not be affected. Do you want to continue?\"
4. Dialog includes Cancel and Confirm buttons
5. Admin clicks Cancel
6. Dialog closes, no action taken

#### AC33: Seed Default Chart of Accounts - Success
1. Admin user navigates to Settings page
2. Clicks \"Seed Default Chart of Accounts\" button
3. Confirmation dialog appears
4. Admin clicks Confirm
5. System checks if accounts table is empty
6. System inserts default chart of accounts structure
7. Audit log entry is created (Module: Settings, Action: Chart of Accounts Seeded)
8. Success toast notification is displayed: \"Default chart of accounts seeded successfully\"
9. Dialog closes

#### AC34: Seed Default Chart of Accounts - Already Exists
1. Admin user navigates to Settings page
2. Clicks \"Seed Default Chart of Accounts\" button
3. Confirmation dialog appears
4. Admin clicks Confirm
5. System checks if accounts table has existing records
6. System skips seeding
7. Toast notification is displayed: \"Chart of accounts already exists. Seeding skipped.\"
8. Dialog closes

#### AC35: Seed Default Chart of Accounts - Failure
1. Admin user navigates to Settings page
2. Clicks \"Seed Default Chart of Accounts\" button
3. Confirmation dialog appears
4. Admin clicks Confirm
5. System attempts to seed chart of accounts
6. Edge Function returns error
7. Error toast notification is displayed: \"Failed to seed chart of accounts. Please try again or contact support.\"
8. Dialog closes

#### AC36: Verify Default Chart of Accounts Structure
1. Admin user successfully seeds default chart of accounts
2. Admin navigates to Accounting module
3. Chart of accounts displays with following structure:
   - Asset accounts (Current Assets, Fixed Assets)
   - Liability accounts (Current Liabilities, Long-term Liabilities)
   - Equity accounts
   - Revenue accounts
   - Expense accounts (COGS, Operating Expenses, Financial Expenses)
4. All accounts have appropriate account codes and parent-child relationships

---

## 11. memory.md Update Outline

### 11.1 Retained Features
- Four-tab layout in UserManagement.tsx (Users, Roles & Permissions, Data Policies, Audit Logs)
- Basic user listing and role selection
- Permission matrix display structure
- Read-only Data Policies tab
- Existing database tables (roles, permissions, role_permissions, profiles, audit_logs, data_access_policies)
- admin-create-user Edge Function (enhanced)
- AuthContext with isAdmin, hasPermission, permissions
- RouteGuard component
- DashboardLayout navigation filtering
- shadcn/ui component library and design system

### 11.2 Enhanced Features
- Users tab: full CRUD operations (Add, Edit, Delete, Activate/Deactivate, Change Password, Reset Password)
- Users tab: search, filters (Role, Status, Department, Cost Center), sorting, pagination
- Users tab: duplicate validation for username/email
- Roles & Permissions tab: role management (Add, Edit, Delete custom roles)
- Roles & Permissions tab: functional permission matrix with checkboxes
- Roles & Permissions tab: default roles (Administrator, Accountant, Staff) with type badges
- Audit Logs tab: search, filters (date range, module, action), sorting, pagination
- admin-create-user Edge Function: enhanced with validations and audit logging
- Settings page: added \"Seed Default Chart of Accounts\" button with confirmation dialog

### 11.3 New Features
- Login History tab: tracks user login/logout events with simple status tracking
- New database table: login_history
- New Edge Functions: admin-update-user, admin-delete-user, admin-change-password, admin-reset-password, seed-chart-of-accounts
- Database schema changes: profiles table (username, phone, deleted_at), roles table (type, description)
- Seed data: default roles (Administrator, Accountant, Staff) and permissions
- Database trigger: on_auth_user_login to log login events
- Comprehensive route guards for all routes (customers, suppliers, processors, materials, products, purchases, sales, processing, inventory, accounting, reports, settings)
- Permission-based action button visibility (Add, Edit, Delete, Print, Export)
- Validation rules: duplicate prevention, role constraints, password strength, deletion constraints
- Audit logging: frontend and Edge Function logging for all user actions
- Chart of accounts seeding: default manufacturing ERP chart of accounts structure

### 11.4 Files Modified
- UserManagement.tsx: enhanced all tabs, added Login History tab
- App.tsx: added route guards for all routes
- DashboardLayout.tsx: updated navigation filtering logic
- AuthContext.tsx: no changes (existing logic sufficient)
- RouteGuard.tsx: updated to accept module and action props
- SettingsPage.tsx: added \"Seed Default Chart of Accounts\" button
- Supabase Edge Functions: admin-create-user (enhanced), admin-update-user (new), admin-delete-user (new), admin-change-password (new), admin-reset-password (new), seed-chart-of-accounts (new)

### 11.5 Database Changes
- New table: login_history
- Modified table: profiles (added username, phone, deleted_at)
- Modified table: roles (added type, description)
- Seed data: default roles and permissions
- New trigger: on_auth_user_login
- New function: log_login

### 11.6 Known Issues
- No device or IP tracking in login history (intentionally kept simple)
- No session monitoring or concurrent login limits
- No advanced 2FA or biometric authentication
- No user self-registration or password recovery without admin intervention
- No role-based UI customization beyond permission-based visibility
- Soft delete for users (deleted_at timestamp) but hard delete from Supabase Auth
- Chart of accounts seeding is one-time operation, no update or rollback mechanism

### 11.7 Future Recommendations
- Implement role hierarchy (e.g., Manager > Supervisor > Staff)
- Add department and cost center management UI
- Implement data access policies UI (currently read-only)
- Add bulk user import/export functionality
- Implement password expiry and forced password change
- Add session timeout configuration
- Implement IP whitelisting for admin access
- Add email notifications for critical actions (user deletion, role changes)
- Implement approval workflow for sensitive operations
- Add user activity dashboard (login frequency, most accessed modules)
- Implement permission templates for quick role setup
- Add role cloning functionality
- Implement permission inheritance for role hierarchy
- Add user impersonation for admin troubleshooting
- Implement audit log export and archival
- Add compliance reporting (SOC2, ISO27001 audit trails)
- Add chart of accounts update/rollback mechanism
- Implement custom chart of accounts templates for different industries

---

## 12. Implementation Phases

### Phase 1: Database and Edge Functions (Week 1)
- Create login_history table
- Modify profiles and roles tables
- Insert seed data (default roles and permissions)
- Create database trigger and function for login tracking
- Enhance admin-create-user Edge Function
- Create admin-update-user Edge Function
- Create admin-delete-user Edge Function
- Create admin-change-password Edge Function
- Create admin-reset-password Edge Function
- Create seed-chart-of-accounts Edge Function

### Phase 2: Users Tab Enhancement (Week 2)
- Implement AddUserModal with validations
- Implement EditUserModal with validations
- Implement DeleteUserDialog with validations
- Implement ChangePasswordModal
- Implement ResetPasswordDialog
- Add search, filters, sorting, pagination to Users table
- Integrate Edge Functions with frontend
- Implement audit logging for user actions

### Phase 3: Roles & Permissions Tab Enhancement (Week 3)
- Implement AddRoleModal with validations
- Implement EditRoleModal with validations
- Implement DeleteRoleDialog with validations
- Implement functional PermissionMatrix with checkboxes
- Add role type badges (Default/Custom)
- Integrate role management with Supabase client
- Implement audit logging for role actions

### Phase 4: Audit Logs and Login History (Week 4)
- Enhance AuditLogsTable with search, filters, sorting, pagination
- Create LoginHistoryTable component
- Add Login History tab to UserManagement.tsx
- Implement login/logout tracking
- Test audit logging across all modules

### Phase 5: Route Guards and Permissions (Week 5)
- Update RouteGuard component to accept module and action props
- Add route guards to all routes in App.tsx
- Update DashboardLayout navigation filtering
- Implement permission-based action button visibility across all pages
- Test permission enforcement across all modules

### Phase 6: Settings Page Enhancement (Week 6)
- Add \"Seed Default Chart of Accounts\" button to SettingsPage.tsx
- Implement SeedChartOfAccountsDialog component
- Integrate seed-chart-of-accounts Edge Function
- Implement permission-based button visibility
- Test chart of accounts seeding functionality

### Phase 7: Testing and Documentation (Week 7)
- Conduct comprehensive testing (unit, integration, E2E)
- Verify all acceptance criteria (AC1-AC36)
- Update memory.md with implementation details
- Create user documentation for Access Management module
- Create user documentation for chart of accounts seeding
- Conduct security review and penetration testing
- Deploy to production

---

## 13. Success Metrics

- All 36 acceptance criteria pass testing
- Zero critical bugs in production
- Admin users can manage users, roles, and permissions without technical support
- Audit logs capture all critical actions with complete context
- Route guards prevent unauthorized access to all protected routes
- Permission-based UI rendering works consistently across all modules
- Login history accurately tracks user sessions
- Chart of accounts seeding completes successfully on first attempt
- Default chart of accounts structure matches manufacturing ERP requirements
- System performance remains acceptable with 100+ users and 10,000+ audit log entries
- User feedback indicates improved usability and clarity of access control

---

## 14. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Edge Function failures during user operations | High | Implement comprehensive error handling, retry logic, and rollback mechanisms |
| Permission matrix complexity causing performance issues | Medium | Optimize database queries, implement caching, use indexes |
| Audit log table growing too large | Medium | Implement log rotation, archival strategy, and retention policies |
| Users locked out due to permission misconfiguration | High | Prevent removing all admin permissions, implement emergency admin access |
| Duplicate validation race conditions | Low | Use database unique constraints, implement optimistic locking |
| Login history table growing too large | Low | Implement automatic cleanup of old records (e.g., older than 1 year) |
| Route guard bypass via direct URL manipulation | High | Enforce permissions on backend API, not just frontend routes |
| Soft delete causing username conflicts | Medium | Implement unique constraint excluding deleted records |
| Chart of accounts seeding fails mid-operation | Medium | Implement transaction rollback, validate data before insertion |
| Seeding overwrites existing accounts | High | Check for existing accounts before seeding, prevent accidental overwrite |
| Default chart of accounts not suitable for all businesses | Low | Document customization process, provide guidance for modifications |

---

## 15. Dependencies

- Supabase Auth for user authentication and management
- Supabase Database for data storage
- Supabase Edge Functions for server-side operations
- shadcn/ui component library
- React + TypeScript + Vite
- Tailwind CSS for styling
- Existing ERP modules (Purchases, Sales, Processing, Accounting, etc.)
- Existing accounts table structure in database

---

## 16. Assumptions

- Supabase service role key is securely stored and accessible to Edge Functions
- Admin users have technical understanding of roles and permissions
- System will have 1-2 daily active admin users managing access control
- User base will not exceed 100 users in near term
- Audit log retention period is at least 1 year
- Login history retention period is at least 6 months
- All users have valid email addresses for password reset functionality
- Department and cost center data already exists in database
- Existing ERP modules will be updated to respect new permission system
- Accounts table exists in database with appropriate structure
- Chart of accounts seeding is one-time operation during initial setup
- Default chart of accounts structure is suitable for small manufacturing businesses

---

## 17. Out of Scope (Explicitly Not Included)

- Multi-company or multi-branch support
- Department hierarchy management UI
- Data access policies management UI (remains read-only)
- User self-registration
- Advanced 2FA methods (SMS, authenticator apps)
- Device and IP tracking in login history
- Session monitoring and concurrent login limits
- User activity analytics and dashboards
- Role hierarchy and permission inheritance
- Approval workflows for sensitive operations
- Bulk user import/export
- Password expiry and forced password change
- Session timeout configuration
- IP whitelisting
- Email notifications for critical actions
- User impersonation
- Audit log export and archival UI
- Compliance reporting (SOC2, ISO27001)
- Integration with external identity providers
- Custom fields for users and roles
- Role templates and cloning
- Permission versioning and rollback
- Chart of accounts update or rollback mechanism
- Custom chart of accounts templates for different industries
- Bulk account import/export
- Account hierarchy visualization
- Account usage analytics

---

This PRD update provides a comprehensive plan for enhancing the existing Access Management module and adding chart of accounts seeding functionality while maintaining simplicity and practicality for a small manufacturing ERP system. Implementation should follow the phased approach, with continuous testing and validation against acceptance criteria.
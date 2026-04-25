import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import ProtectedRoute from './components/ProtectedRoute';
import CompanyRequiredRoute from './components/CompanyRequiredRoute';
import RoleRequiredRoute from './components/RoleRequiredRoute';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CreateCompanyPage from './pages/CreateCompanyPage';
import DashboardPage from './pages/DashboardPage';
import InventoryPage from './pages/InventoryPage';
import SalesPage from './pages/SalesPage';
import CreateInvoicePage from './pages/CreateInvoicePage';
import ViewInvoicePage from './pages/ViewInvoicePage';
import PurchasesPage from './pages/PurchasesPage';
import CreatePurchasePage from './pages/CreatePurchasePage';
import ViewPurchasePage from './pages/ViewPurchasePage';
import ExpensesPage from './pages/ExpensesPage';
import PayablesPage from './pages/PayablesPage';
import AccountsPage from './pages/AccountsPage';
import LedgerPage from './pages/LedgerPage';
import JournalPage from './pages/JournalPage';
import TrialBalancePage from './pages/TrialBalancePage';
import GSTPage from './pages/GSTPage';
import ReportsPage from './pages/ReportsPage';
import MembersPage from './pages/MembersPage';
import CompanyProfilePage from './pages/CompanyProfilePage';
import ProfitLossPage from './pages/reports/ProfitLossPage';
import BalanceSheetPage from './pages/reports/BalanceSheetPage';
import CashFlowPage from './pages/reports/CashFlowPage';
import SalesReportPage from './pages/reports/SalesReportPage';
import InventoryReportPage from './pages/reports/InventoryReportPage';
import RecipesPage from './pages/RecipesPage';
import WastagePage from './pages/WastagePage';
import ProductionPage from './pages/ProductionPage';
import MenuMasterPage from './pages/MenuMasterPage';

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/create-company" element={<CreateCompanyPage />} />

            <Route element={<CompanyRequiredRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/sales" element={<SalesPage />} />
                <Route path="/sales/new" element={<CreateInvoicePage />} />
                <Route path="/sales/:saleId" element={<ViewInvoicePage />} />
                <Route path="/purchases" element={<PurchasesPage />} />
                <Route path="/purchases/new" element={<CreatePurchasePage />} />
                <Route path="/purchases/:purchaseId" element={<ViewPurchasePage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/payables" element={<PayablesPage />} />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/ledger" element={<LedgerPage />} />
                <Route path="/ledger/:accountId" element={<LedgerPage />} />
                <Route path="/journal" element={<JournalPage />} />
                <Route path="/trial-balance" element={<TrialBalancePage />} />
                <Route path="/gst" element={<GSTPage />} />
                <Route path="/company/profile" element={<CompanyProfilePage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/reports/profit-loss" element={<ProfitLossPage />} />

                {/* Admins and managers can view; staff get Access Denied */}
                <Route element={<RoleRequiredRoute permission="edit" message="Only admins and managers can view the team members page." />}>
                  <Route path="/members" element={<MembersPage />} />
                </Route>
                <Route path="/reports/balance-sheet" element={<BalanceSheetPage />} />
                <Route path="/reports/cash-flow" element={<CashFlowPage />} />
                <Route path="/reports/sales" element={<SalesReportPage />} />
                <Route path="/reports/inventory" element={<InventoryReportPage />} />
                <Route path="/recipes" element={<RecipesPage />} />
                <Route path="/wastage" element={<WastagePage />} />
                <Route path="/production" element={<ProductionPage />} />
                <Route path="/fnb/menu-master" element={<MenuMasterPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}

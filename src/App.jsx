import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import ProtectedRoute from './components/ProtectedRoute';
import CompanyRequiredRoute from './components/CompanyRequiredRoute';
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
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}

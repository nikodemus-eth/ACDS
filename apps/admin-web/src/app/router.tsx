import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ProvidersPage } from '../features/providers/ProvidersPage';
import { ProviderDetailPage } from '../features/providers/ProviderDetailPage';
import { ProfilesPage } from '../features/profiles/ProfilesPage';
import { PoliciesPage } from '../features/policies/PoliciesPage';
import { AuditPage } from '../features/audit/AuditPage';
import { ExecutionsPage } from '../features/executions/ExecutionsPage';
import { ExecutionDetailPage } from '../features/executions/ExecutionDetailPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/providers" replace />} />
          <Route path="/providers" element={<ProvidersPage />} />
          <Route path="/providers/:id" element={<ProviderDetailPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/policies" element={<PoliciesPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/executions" element={<ExecutionsPage />} />
          <Route path="/executions/:id" element={<ExecutionDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

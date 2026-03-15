import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ProvidersPage } from '../features/providers/ProvidersPage';
import { ProviderDetailPage } from '../features/providers/ProviderDetailPage';
import { ProfilesPage } from '../features/profiles/ProfilesPage';
import { PoliciesPage } from '../features/policies/PoliciesPage';
import { AuditPage } from '../features/audit/AuditPage';
import { ExecutionsPage } from '../features/executions/ExecutionsPage';
import { ExecutionDetailPage } from '../features/executions/ExecutionDetailPage';
import { AdaptationPage } from '../features/adaptation/AdaptationPage';
import { FamilyPerformancePage } from '../features/adaptation/FamilyPerformancePage';
import { ApprovalQueuePage } from '../features/adaptation/ApprovalQueuePage';
import { ApprovalDetailPage } from '../features/adaptation/ApprovalDetailPage';
import { RollbackQueuePage } from '../features/adaptation/RollbackQueuePage';
import { RollbackDetailPage } from '../features/adaptation/RollbackDetailPage';

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
          <Route path="/adaptation" element={<AdaptationPage />} />
          <Route path="/adaptation/approvals" element={<ApprovalQueuePage />} />
          <Route path="/adaptation/approvals/:id" element={<ApprovalDetailPage />} />
          <Route path="/adaptation/rollbacks" element={<RollbackQueuePage />} />
          <Route path="/adaptation/rollbacks/:familyKey" element={<RollbackDetailPage />} />
          <Route path="/adaptation/:familyKey" element={<FamilyPerformancePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

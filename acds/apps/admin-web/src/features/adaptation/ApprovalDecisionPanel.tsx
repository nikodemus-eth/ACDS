import { useState } from 'react';
import {
  useApproveRecommendation,
  useRejectRecommendation,
} from '../../hooks/useAdaptationApprovals';

interface ApprovalDecisionPanelProps {
  approvalId: string;
  status: string;
  onDecisionComplete?: () => void;
}

const panelStyle: React.CSSProperties = {
  padding: '20px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  backgroundColor: '#ffffff',
  marginTop: '24px',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '80px',
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '13px',
  fontFamily: 'inherit',
  resize: 'vertical',
  boxSizing: 'border-box',
};

const buttonBaseStyle: React.CSSProperties = {
  padding: '8px 20px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
};

const approveButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: '#059669',
  color: '#ffffff',
};

const rejectButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: '#dc2626',
  color: '#ffffff',
};

const disabledButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: '#9ca3af',
  color: '#ffffff',
  cursor: 'not-allowed',
};

export function ApprovalDecisionPanel({
  approvalId,
  status,
  onDecisionComplete,
}: ApprovalDecisionPanelProps) {
  const [reason, setReason] = useState('');
  const [decisionMade, setDecisionMade] = useState(false);

  const approveMutation = useApproveRecommendation();
  const rejectMutation = useRejectRecommendation();

  const isPending = status === 'pending';
  const isProcessing = approveMutation.isPending || rejectMutation.isPending;

  async function handleApprove() {
    await approveMutation.mutateAsync({ id: approvalId, reason: reason || undefined });
    setDecisionMade(true);
    onDecisionComplete?.();
  }

  async function handleReject() {
    await rejectMutation.mutateAsync({ id: approvalId, reason: reason || undefined });
    setDecisionMade(true);
    onDecisionComplete?.();
  }

  if (!isPending || decisionMade) {
    return (
      <div style={panelStyle}>
        <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 600, color: '#374151' }}>
          Decision
        </h3>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>
          {decisionMade
            ? 'Decision recorded successfully.'
            : `This approval is in "${status}" status and cannot be modified.`}
        </p>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600, color: '#374151' }}>
        Make a Decision
      </h3>

      <label
        htmlFor="approval-reason"
        style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '6px' }}
      >
        Reason (optional)
      </label>
      <textarea
        id="approval-reason"
        style={textareaStyle}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Provide a reason for your decision..."
        disabled={isProcessing}
      />

      <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
        <button
          type="button"
          style={isProcessing ? disabledButtonStyle : approveButtonStyle}
          onClick={handleApprove}
          disabled={isProcessing}
        >
          {approveMutation.isPending ? 'Approving...' : 'Approve'}
        </button>
        <button
          type="button"
          style={isProcessing ? disabledButtonStyle : rejectButtonStyle}
          onClick={handleReject}
          disabled={isProcessing}
        >
          {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
        </button>
      </div>

      {(approveMutation.isError || rejectMutation.isError) && (
        <p style={{ color: '#dc2626', fontSize: '13px', marginTop: '12px' }}>
          Error: {(approveMutation.error ?? rejectMutation.error)?.message ?? 'Unknown error'}
        </p>
      )}
    </div>
  );
}

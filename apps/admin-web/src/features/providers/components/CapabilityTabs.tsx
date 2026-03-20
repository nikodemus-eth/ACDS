import type { CapabilityManifestEntry } from '@acds/core-types';

interface CapabilityTabsProps {
  capabilities: CapabilityManifestEntry[];
  selectedId: string | null;
  onSelect: (capabilityId: string) => void;
}

function groupByCategory(capabilities: CapabilityManifestEntry[]): Map<string, CapabilityManifestEntry[]> {
  const groups = new Map<string, CapabilityManifestEntry[]>();
  for (const cap of capabilities) {
    const list = groups.get(cap.category) ?? [];
    list.push(cap);
    groups.set(cap.category, list);
  }
  return groups;
}

export function CapabilityTabs({ capabilities, selectedId, onSelect }: CapabilityTabsProps) {
  const groups = groupByCategory(capabilities);

  return (
    <div className="capability-tabs">
      {[...groups.entries()].map(([category, caps]) => (
        <div key={category} className="capability-tabs__group">
          <h4 className="capability-tabs__category">{category}</h4>
          <div className="capability-tabs__list">
            {caps.map((cap) => (
              <button
                key={cap.capabilityId}
                className={`capability-tabs__tab${selectedId === cap.capabilityId ? ' capability-tabs__tab--active' : ''}${!cap.available ? ' capability-tabs__tab--disabled' : ''}`}
                onClick={() => onSelect(cap.capabilityId)}
                disabled={!cap.available}
              >
                {cap.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

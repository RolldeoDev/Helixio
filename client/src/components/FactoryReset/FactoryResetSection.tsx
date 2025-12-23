/**
 * Factory Reset Section
 *
 * "Danger Zone" section for the Settings page that provides
 * access to the Factory Reset modal.
 */

import './FactoryResetModal.css';

interface FactoryResetSectionProps {
  onShowModal: () => void;
}

export function FactoryResetSection({ onShowModal }: FactoryResetSectionProps) {
  return (
    <div className="danger-zone">
      <h3 className="danger-zone-header">
        <span className="danger-zone-header-icon">!</span>
        Danger Zone
      </h3>

      <div className="danger-zone-content">
        <div className="danger-zone-item">
          <div className="danger-zone-info">
            <h4>Factory Reset</h4>
            <p>
              Clear cached data, reading history, or completely reset Helixio to its initial state.
              Your comic files are never touched.
            </p>
          </div>
          <button className="danger-zone-btn" onClick={onShowModal}>
            Factory Reset...
          </button>
        </div>
      </div>
    </div>
  );
}

export default FactoryResetSection;

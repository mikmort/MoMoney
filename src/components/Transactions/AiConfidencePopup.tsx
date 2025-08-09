import React from 'react';
import styled from 'styled-components';

const PopupOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const PopupContent = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

  h3 {
    margin: 0 0 16px 0;
    color: #333;
    font-size: 1.3rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .confidence-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 0.85rem;
    font-weight: 600;
    
    &.high {
      background: #e8f5e8;
      color: #2e7d32;
    }
    
    &.medium {
      background: #fff3e0;
      color: #f57c00;
    }
    
    &.low {
      background: #ffebee;
      color: #c62828;
    }
  }

  .reasoning-section {
    margin: 16px 0;
    
    h4 {
      margin: 0 0 8px 0;
      color: #555;
      font-size: 1rem;
    }
    
    .reasoning-text {
      background: #f8f9fa;
      border-left: 4px solid #2196f3;
      padding: 12px 16px;
      border-radius: 4px;
      font-style: italic;
      line-height: 1.5;
      color: #555;
    }
  }

  .transaction-details {
    margin: 16px 0;
    background: #f8f9fa;
    padding: 12px;
    border-radius: 6px;
    
    .detail-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      
      &:last-child {
        margin-bottom: 0;
      }
      
      .label {
        font-weight: 500;
        color: #666;
      }
      
      .value {
        color: #333;
      }
    }
  }

  .close-button {
    background: #2196f3;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    float: right;
    margin-top: 16px;
    
    &:hover {
      background: #1976d2;
    }
  }

  .metadata-section {
    margin: 16px 0;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    background: #fafafa;
    
    .section-header {
      padding: 12px 16px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
      font-weight: 600;
      color: #444;
      font-size: 0.95rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-content {
      padding: 12px 16px;
      
      .metadata-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 12px;
        
        .metadata-item {
          display: flex;
          justify-content: space-between;
          padding: 6px 8px;
          background: #fff;
          border-radius: 4px;
          border: 1px solid #e8e8e8;
          font-size: 0.85rem;
          
          .label {
            font-weight: 500;
            color: #666;
          }
          
          .value {
            color: #333;
            font-weight: 600;
          }
        }
      }

      .tokens-list {
        margin-top: 12px;
        
        .tokens-header {
          font-size: 0.9rem;
          font-weight: 600;
          color: #555;
          margin-bottom: 8px;
        }
        
        .token-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          
          .token-tag {
            padding: 4px 8px;
            background: #e3f2fd;
            color: #1565c0;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 500;
            border: 1px solid #bbdefb;
          }
        }
      }
    }
  }
`;

interface AiConfidencePopupProps {
  isOpen: boolean;
  onClose: () => void;
  confidence: number;
  reasoning?: string;
  category: string;
  subcategory?: string;
  description: string;
  amount: number;
  proxyMetadata?: {
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    finishReason?: string;
    requestId?: string;
    created?: number;
    keyTokens?: string[];
    processingTime?: number;
  };
}

export const AiConfidencePopup: React.FC<AiConfidencePopupProps> = ({
  isOpen,
  onClose,
  confidence,
  reasoning,
  category,
  subcategory,
  description,
  amount,
  proxyMetadata
}) => {
  if (!isOpen) return null;

  const percentage = Math.round(confidence * 100);
  const confidenceLevel = percentage > 90 ? 'high' : percentage >= 60 ? 'medium' : 'low';
  const confidenceIcon = percentage > 90 ? '✅' : percentage >= 60 ? '⚠️' : '❌';

  return (
    <PopupOverlay onClick={onClose}>
      <PopupContent onClick={(e) => e.stopPropagation()}>
        <h3>
          🤖 AI Classification Details
          <span className={`confidence-badge ${confidenceLevel}`}>
            {confidenceIcon} {percentage}% Confidence
          </span>
        </h3>

        <div className="transaction-details">
          <div className="detail-row">
            <span className="label">Description:</span>
            <span className="value">{description}</span>
          </div>
          <div className="detail-row">
            <span className="label">Amount:</span>
            <span className="value">
              ${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="detail-row">
            <span className="label">Category:</span>
            <span className="value">{category}</span>
          </div>
          {subcategory && (
            <div className="detail-row">
              <span className="label">Subcategory:</span>
              <span className="value">{subcategory}</span>
            </div>
          )}
        </div>

        {reasoning && (
          <div className="reasoning-section">
            <h4>🧠 AI Reasoning</h4>
            <div className="reasoning-text">
              {reasoning}
            </div>
          </div>
        )}

        {!reasoning && (
          <div className="reasoning-section">
            <h4>🧠 AI Reasoning</h4>
            <div className="reasoning-text">
              No detailed reasoning available for this classification.
            </div>
          </div>
        )}

        {/* Enhanced proxy metadata for trust building */}
        {proxyMetadata && (
          <div className="metadata-section">
            <div className="section-header">
              <span>🔍 Classification Details</span>
            </div>
            <div className="section-content">
              <div className="metadata-grid">
                {proxyMetadata.model && (
                  <div className="metadata-item">
                    <span className="label">AI Model:</span>
                    <span className="value">{proxyMetadata.model}</span>
                  </div>
                )}
                {proxyMetadata.processingTime && (
                  <div className="metadata-item">
                    <span className="label">Processing Time:</span>
                    <span className="value">{proxyMetadata.processingTime}ms</span>
                  </div>
                )}
                {proxyMetadata.totalTokens && (
                  <div className="metadata-item">
                    <span className="label">Total Tokens:</span>
                    <span className="value">{proxyMetadata.totalTokens.toLocaleString()}</span>
                  </div>
                )}
                {proxyMetadata.finishReason && (
                  <div className="metadata-item">
                    <span className="label">Finish Reason:</span>
                    <span className="value">{proxyMetadata.finishReason}</span>
                  </div>
                )}
                {proxyMetadata.promptTokens && (
                  <div className="metadata-item">
                    <span className="label">Prompt Tokens:</span>
                    <span className="value">{proxyMetadata.promptTokens.toLocaleString()}</span>
                  </div>
                )}
                {proxyMetadata.completionTokens && (
                  <div className="metadata-item">
                    <span className="label">Response Tokens:</span>
                    <span className="value">{proxyMetadata.completionTokens.toLocaleString()}</span>
                  </div>
                )}
              </div>
              
              {proxyMetadata.keyTokens && proxyMetadata.keyTokens.length > 0 && (
                <div className="tokens-list">
                  <div className="tokens-header">Key Classification Tokens:</div>
                  <div className="token-tags">
                    {proxyMetadata.keyTokens.map((token, index) => (
                      <span key={index} className="token-tag">{token}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <button className="close-button" onClick={onClose}>
          Close
        </button>
      </PopupContent>
    </PopupOverlay>
  );
};

export default AiConfidencePopup;

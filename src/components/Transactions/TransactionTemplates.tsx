import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Button } from '../../styles/globalStyles';

interface TransactionTemplate {
  id: string;
  name: string;
  description: string;
  amount: number;
  category: string;
  subcategory?: string;
  account: string;
  type: 'income' | 'expense';
  isRecurring?: boolean;
}

interface TransactionTemplatesProps {
  onUseTemplate: (template: TransactionTemplate) => void;
  uniqueCategories: string[];
  uniqueAccounts: string[];
}

const TemplatesContainer = styled.div`
  margin-bottom: 20px;
  
  .templates-header {
    display: flex;
    justify-content: between;
    align-items: center;
    margin-bottom: 12px;
    
    h4 {
      margin: 0;
      color: #333;
    }
  }
  
  .templates-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  
  .template-card {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    
    &:hover {
      border-color: #2196f3;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .template-name {
      font-weight: 600;
      color: #333;
      margin-bottom: 4px;
    }
    
    .template-details {
      font-size: 0.9rem;
      color: #666;
      
      .amount {
        font-weight: 500;
        
        &.expense {
          color: #f44336;
        }
        
        &.income {
          color: #4caf50;
        }
      }
    }
    
    .template-category {
      font-size: 0.8rem;
      color: #999;
      margin-top: 4px;
    }
    
    .delete-template {
      position: absolute;
      top: 8px;
      right: 8px;
      background: #f44336;
      color: white;
      border: none;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      font-size: 12px;
      cursor: pointer;
      display: none;
    }
    
    &:hover .delete-template {
      display: block;
    }
  }
  
  .add-template-form {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 16px;
    margin-top: 12px;
    
    .form-row {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      
      input, select {
        flex: 1;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
      }
    }
    
    .form-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
  }
`;

const STORAGE_KEY = 'mo-money-templates';

export const TransactionTemplates: React.FC<TransactionTemplatesProps> = ({
  onUseTemplate,
  uniqueCategories,
  uniqueAccounts
}) => {
  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    amount: '',
    category: '',
    subcategory: '',
    account: '',
    type: 'expense' as 'income' | 'expense'
  });

  // Load templates from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setTemplates(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load templates:', error);
      }
    } else {
      // Initialize with common templates
      const defaultTemplates: TransactionTemplate[] = [
        {
          id: '1',
          name: 'Rent Payment',
          description: 'Monthly rent payment',
          amount: -1200,
          category: 'Housing',
          subcategory: 'Rent',
          account: 'Checking',
          type: 'expense',
          isRecurring: true
        },
        {
          id: '2',
          name: 'Salary',
          description: 'Monthly salary deposit',
          amount: 5000,
          category: 'Income',
          subcategory: 'Salary',
          account: 'Checking',
          type: 'income',
          isRecurring: true
        },
        {
          id: '3',
          name: 'Netflix',
          description: 'Netflix subscription',
          amount: -15.99,
          category: 'Entertainment',
          subcategory: 'Streaming Services',
          account: 'Credit Card',
          type: 'expense',
          isRecurring: true
        }
      ];
      setTemplates(defaultTemplates);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultTemplates));
    }
  }, []);

  // Save templates to localStorage
  useEffect(() => {
    if (templates.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    }
  }, [templates]);

  const handleAddTemplate = () => {
    if (!newTemplate.name || !newTemplate.description || !newTemplate.amount) {
      alert('Please fill in required fields');
      return;
    }

    const template: TransactionTemplate = {
      id: Date.now().toString(),
      name: newTemplate.name,
      description: newTemplate.description,
      amount: newTemplate.type === 'expense' ? -Math.abs(Number(newTemplate.amount)) : Math.abs(Number(newTemplate.amount)),
      category: newTemplate.category || 'Uncategorized',
      subcategory: newTemplate.subcategory,
      account: newTemplate.account || 'Default',
      type: newTemplate.type
    };

    setTemplates([...templates, template]);
    setNewTemplate({
      name: '',
      description: '',
      amount: '',
      category: '',
      subcategory: '',
      account: '',
      type: 'expense'
    });
    setShowAddForm(false);
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(templates.filter(t => t.id !== id));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <TemplatesContainer>
      <div className="templates-header">
        <h4>🔖 Quick Templates</h4>
        <Button 
          variant="outline"
          onClick={() => setShowAddForm(!showAddForm)}
          style={{ fontSize: '12px', padding: '4px 8px' }}
        >
          {showAddForm ? 'Cancel' : '+ Add Template'}
        </Button>
      </div>

      {showAddForm && (
        <div className="add-template-form">
          <div className="form-row">
            <input
              type="text"
              placeholder="Template name *"
              value={newTemplate.name}
              onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
            />
            <input
              type="text"
              placeholder="Description *"
              value={newTemplate.description}
              onChange={(e) => setNewTemplate({...newTemplate, description: e.target.value})}
            />
          </div>
          <div className="form-row">
            <input
              type="number"
              step="0.01"
              placeholder="Amount *"
              value={newTemplate.amount}
              onChange={(e) => setNewTemplate({...newTemplate, amount: e.target.value})}
            />
            <select
              value={newTemplate.type}
              onChange={(e) => setNewTemplate({...newTemplate, type: e.target.value as 'income' | 'expense'})}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="form-row">
            <select
              value={newTemplate.category}
              onChange={(e) => setNewTemplate({...newTemplate, category: e.target.value})}
            >
              <option value="">Select Category</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={newTemplate.account}
              onChange={(e) => setNewTemplate({...newTemplate, account: e.target.value})}
            >
              <option value="">Select Account</option>
              {uniqueAccounts.map(acc => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <Button 
              variant="outline" 
              onClick={() => setShowAddForm(false)}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddTemplate}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              Add Template
            </Button>
          </div>
        </div>
      )}

      <div className="templates-grid">
        {templates.map((template) => (
          <div
            key={template.id}
            className="template-card"
            onClick={() => onUseTemplate(template)}
            style={{ position: 'relative' }}
          >
            <div className="template-name">{template.name}</div>
            <div className="template-details">
              <span className={`amount ${template.type}`}>
                {formatCurrency(template.amount)}
              </span>
              {template.isRecurring && (
                <span style={{ marginLeft: '8px', fontSize: '12px' }}>🔄</span>
              )}
            </div>
            <div className="template-category">
              {template.category} • {template.account}
            </div>
            <button
              className="delete-template"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteTemplate(template.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </TemplatesContainer>
  );
};

export default TransactionTemplates;

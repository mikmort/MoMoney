import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { CategoryRule, RuleCondition } from '../../types';
import { dataService } from '../../services/dataService';
import { rulesService } from '../../services/rulesService';
import { defaultCategories } from '../../data/defaultCategories';
import { Button, Card } from '../../styles/globalStyles';

const RulesContainer = styled.div`
  margin-top: 20px;
`;

const RuleCard = styled(Card)`
  margin-bottom: 15px;
  padding: 15px;
  position: relative;
`;

const RuleHeader = styled.div`
  display: flex;
  justify-content: between;
  align-items: center;
  margin-bottom: 10px;
`;

const RuleTitle = styled.h4`
  margin: 0;
  flex: 1;
  color: #333;
`;

const RuleControls = styled.div`
  display: flex;
  gap: 8px;
`;

const RuleStatus = styled.span<{ isActive: boolean }>`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background: ${props => props.isActive ? '#e8f5e8' : '#f0f0f0'};
  color: ${props => props.isActive ? '#2e7d32' : '#666'};
`;

const RuleDescription = styled.p`
  margin: 5px 0;
  color: #666;
  font-size: 14px;
`;

const RuleConditions = styled.div`
  margin: 10px 0;
  font-size: 13px;
`;

const ConditionItem = styled.div`
  margin: 5px 0;
  padding: 5px 8px;
  background: #f8f9fa;
  border-radius: 4px;
  color: #555;
`;

const RuleAction = styled.div`
  margin: 10px 0;
  font-size: 13px;
  font-weight: 500;
  color: #2196f3;
`;

const AddRuleForm = styled.div`
  border: 2px dashed #ddd;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  background: #fafafa;
`;

const FormGroup = styled.div`
  margin-bottom: 15px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #333;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: #2196f3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;

  &:focus {
    outline: none;
    border-color: #2196f3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
  }
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 15px;
`;

interface CategoryRulesManagerProps {
  isVisible: boolean;
  onClose: () => void;
}

export const CategoryRulesManager: React.FC<CategoryRulesManagerProps> = ({
  isVisible,
  onClose,
}) => {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    field: 'description' as RuleCondition['field'],
    operator: 'contains' as RuleCondition['operator'],
    value: '',
    categoryName: '',
    subcategoryName: '',
  });

  useEffect(() => {
    if (isVisible) {
      loadRules();
    }
  }, [isVisible]);

  const loadRules = async () => {
    try {
      // Initialize rules from existing transactions if no rules exist
      await rulesService.initializeRulesFromExistingTransactions();
      
      const allRules = await dataService.getAllCategoryRules();
      setRules(allRules);
    } catch (error) {
      console.error('Failed to load category rules:', error);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.name || !newRule.value || !newRule.categoryName) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const rule = {
        name: newRule.name,
        description: newRule.description,
        isActive: true,
        priority: rules.length + 1,
        conditions: [
          {
            field: newRule.field,
            operator: newRule.operator,
            value: newRule.value,
            caseSensitive: false,
          },
        ],
        action: {
          categoryId: newRule.categoryName.toLowerCase().replace(/\s+/g, '-'),
          categoryName: newRule.categoryName,
          subcategoryId: newRule.subcategoryName 
            ? `${newRule.categoryName.toLowerCase().replace(/\s+/g, '-')}-${newRule.subcategoryName.toLowerCase().replace(/\s+/g, '-')}`
            : undefined,
          subcategoryName: newRule.subcategoryName || undefined,
        },
      };

      await dataService.addCategoryRule(rule);
      await loadRules();
      setNewRule({
        name: '',
        description: '',
        field: 'description',
        operator: 'contains',
        value: '',
        categoryName: '',
        subcategoryName: '',
      });
      setIsAddingRule(false);
    } catch (error) {
      console.error('Failed to add rule:', error);
      alert('Failed to add rule');
    }
  };

  const handleToggleRule = async (ruleId: string, isActive: boolean) => {
    try {
      await dataService.updateCategoryRule(ruleId, { isActive });
      await loadRules();
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (window.confirm('Are you sure you want to delete this rule?')) {
      try {
        await dataService.deleteCategoryRule(ruleId);
        await loadRules();
      } catch (error) {
        console.error('Failed to delete rule:', error);
      }
    }
  };

  if (!isVisible) return null;

  return (
    <RulesContainer>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3>Category Rules ({rules.length})</h3>
        <div>
          <Button 
            onClick={() => setIsAddingRule(!isAddingRule)}
            style={{ marginRight: '10px' }}
          >
            {isAddingRule ? 'Cancel' : 'Add Rule'}
          </Button>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>
      </div>

      {isAddingRule && (
        <AddRuleForm>
          <h4>Add New Category Rule</h4>
          <FormGroup>
            <Label>Rule Name *</Label>
            <Input
              type="text"
              value={newRule.name}
              onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
              placeholder="e.g., København Parking Rule"
            />
          </FormGroup>

          <FormGroup>
            <Label>Description</Label>
            <Input
              type="text"
              value={newRule.description}
              onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
              placeholder="Optional description of this rule"
            />
          </FormGroup>

          <FormRow>
            <FormGroup>
              <Label>Field *</Label>
              <Select
                value={newRule.field}
                onChange={(e) => setNewRule({ ...newRule, field: e.target.value as RuleCondition['field'] })}
              >
                <option value="description">Description</option>
                <option value="amount">Amount</option>
                <option value="account">Account</option>
              </Select>
            </FormGroup>

            <FormGroup>
              <Label>Operator *</Label>
              <Select
                value={newRule.operator}
                onChange={(e) => setNewRule({ ...newRule, operator: e.target.value as RuleCondition['operator'] })}
              >
                <option value="contains">Contains</option>
                <option value="equals">Equals</option>
                <option value="startsWith">Starts With</option>
                <option value="endsWith">Ends With</option>
                {newRule.field === 'amount' && (
                  <>
                    <option value="greaterThan">Greater Than</option>
                    <option value="lessThan">Less Than</option>
                  </>
                )}
              </Select>
            </FormGroup>

            <FormGroup>
              <Label>Value *</Label>
              <Input
                type={newRule.field === 'amount' ? 'number' : 'text'}
                value={newRule.value}
                onChange={(e) => setNewRule({ ...newRule, value: e.target.value })}
                placeholder={newRule.field === 'description' ? 'e.g., København' : 'Enter value'}
              />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup>
              <Label>Category *</Label>
              <Select
                value={newRule.categoryName}
                onChange={(e) => setNewRule({ ...newRule, categoryName: e.target.value, subcategoryName: '' })}
              >
                <option value="">Select Category</option>
                {defaultCategories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </Select>
            </FormGroup>

            <FormGroup>
              <Label>Subcategory</Label>
              <Select
                value={newRule.subcategoryName}
                onChange={(e) => setNewRule({ ...newRule, subcategoryName: e.target.value })}
                disabled={!newRule.categoryName}
              >
                <option value="">Select Subcategory (Optional)</option>
                {newRule.categoryName && 
                  defaultCategories
                    .find(cat => cat.name === newRule.categoryName)
                    ?.subcategories.map(sub => (
                      <option key={sub.id} value={sub.name}>{sub.name}</option>
                    ))
                }
              </Select>
            </FormGroup>

            <FormGroup>
              <Button onClick={handleAddRule} style={{ marginTop: '25px' }}>
                Add Rule
              </Button>
            </FormGroup>
          </FormRow>
        </AddRuleForm>
      )}

      {rules.map(rule => (
        <RuleCard key={rule.id}>
          <RuleHeader>
            <RuleTitle>{rule.name}</RuleTitle>
            <RuleControls>
              <RuleStatus isActive={rule.isActive}>
                {rule.isActive ? 'Active' : 'Inactive'}
              </RuleStatus>
              <Button 
                style={{ padding: '4px 8px', fontSize: '12px' }}
                onClick={() => handleToggleRule(rule.id, !rule.isActive)}
              >
                {rule.isActive ? 'Disable' : 'Enable'}
              </Button>
              <Button 
                style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#f44336', color: 'white' }}
                onClick={() => handleDeleteRule(rule.id)}
              >
                Delete
              </Button>
            </RuleControls>
          </RuleHeader>

          {rule.description && (
            <RuleDescription>{rule.description}</RuleDescription>
          )}

          <RuleConditions>
            <strong>Conditions:</strong>
            <div>
              {rule.conditions.map((condition, index) => (
                <ConditionItem key={index}>
                  {`${condition.field} ${condition.operator} "${condition.value}"`}
                </ConditionItem>
              ))}
            </div>
          </RuleConditions>

          <RuleAction>
            → Category: {rule.action.categoryName}
            {rule.action.subcategoryName && ` > ${rule.action.subcategoryName}`}
          </RuleAction>
        </RuleCard>
      ))}

      {rules.length === 0 && !isAddingRule && (
        <Card style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
          <p>No category rules defined yet.</p>
          <p>Create rules to automatically categorize transactions before AI processing.</p>
          <Button onClick={() => setIsAddingRule(true)}>
            Add Your First Rule
          </Button>
        </Card>
      )}
    </RulesContainer>
  );
};
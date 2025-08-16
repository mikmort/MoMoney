import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { CategoryRule, RuleCondition } from '../../types';
import { dataService } from '../../services/dataService';
import { rulesService } from '../../services/rulesService';
import { defaultCategories } from '../../data/defaultCategories';
import { Button, Card, PageHeader, FlexBox } from '../../styles/globalStyles';
import { useNotification } from '../../contexts/NotificationContext';
import { DeleteRulesDialog } from './DeleteRulesDialog';

const RulesContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const RuleCard = styled(Card)`
  position: relative;
  padding: 8px 12px;
  
  /* Override default Card padding for more compact display */
  & > * {
    margin: 0;
  }
`;

const RuleHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  padding: 2px 0;
  cursor: pointer;
  transition: background-color 0.2s ease;
  
  &:hover {
    background-color: #f8f9fa;
    border-radius: 4px;
    padding: 2px 6px;
  }
`;

const RuleHeaderContent = styled.div`
  display: flex;
  align-items: center;
  flex: 1;
  gap: 10px;
`;

const ExpandIcon = styled.span<{ $isExpanded: boolean }>`
  display: inline-block;
  transition: transform 0.2s ease;
  transform: ${props => props.$isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};
  font-size: 14px;
  color: #666;
`;

const RuleSectionHeader = styled.div<{ $isClickable?: boolean }>`
  margin: 20px 0 12px 0;
  padding-bottom: 6px;
  border-bottom: 2px solid #e0e0e0;
  cursor: ${props => props.$isClickable ? 'pointer' : 'default'};
  
  &:hover {
    ${props => props.$isClickable && `
      background-color: #f8f9fa;
      border-radius: 4px;
      padding-left: 6px;
      padding-right: 6px;
    `}
  }
`;

const RuleSectionTitle = styled.h3<{ $isClickable?: boolean }>`
  margin: 0;
  color: #333;
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const RuleCount = styled.span`
  color: #666;
  font-size: 14px;
  font-weight: normal;
  margin-left: 8px;
`;

const CollapsibleContent = styled.div<{ $isExpanded: boolean }>`
  display: ${props => props.$isExpanded ? 'block' : 'none'};
`;

const RuleStatus = styled.span<{ $isActive: boolean }>`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background: ${props => props.$isActive ? '#e8f5e8' : '#f0f0f0'};
  color: ${props => props.$isActive ? '#2e7d32' : '#666'};
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

const StatsCard = styled(Card)`
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-align: center;

  h3 {
    margin: 0;
    font-size: 2rem;
    font-weight: 300;
  }

  p {
    margin: 8px 0 0 0;
    opacity: 0.9;
  }
`;

const Rules: React.FC = () => {
  const { showAlert, showConfirmation } = useNotification();
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['user-defined', 'auto-generated', 'system'])); // All sections expanded by default
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [stats, setStats] = useState({
    totalRules: 0,
    activeRules: 0,
    inactiveRules: 0
  });
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
    loadRules();
  }, []);

  // Helper function to categorize rules
  const categorizeRules = (allRules: CategoryRule[]) => {
    const userDefinedRules = allRules.filter(rule => 
      rule.name.startsWith('User:') || 
      (rule.description && rule.description.includes('Created from user manual categorization')) ||
      (rule.priority === 25)
    );
    
    const autoGeneratedRules = allRules.filter(rule => 
      rule.name.startsWith('Auto:') || 
      (rule.description && rule.description.includes('Auto-generated from AI classification')) ||
      (rule.priority === 50)
    );

    const systemRules = allRules.filter(rule =>
      rule.name.startsWith('Transfer Detection:') ||
      rule.name.includes('Bank Fee Protection') ||
      (rule.description && rule.description.includes('Auto-generated rule to detect transfer')) ||
      (rule.priority === 10 || rule.priority === 5) // Transfer rules have priority 10, bank fee rules have priority 5
    );
    
    const manualRules = allRules.filter(rule => 
      !userDefinedRules.includes(rule) && 
      !autoGeneratedRules.includes(rule) && 
      !systemRules.includes(rule)
    );
    
    // Manual rules should be treated as user-defined rules
    const sortedUserDefined = [...userDefinedRules, ...manualRules].sort((a, b) => a.name.localeCompare(b.name));
    const sortedAutoGenerated = autoGeneratedRules.sort((a, b) => a.name.localeCompare(b.name));
    const sortedSystemRules = systemRules.sort((a, b) => a.name.localeCompare(b.name));
    
    return {
      userDefinedRules: sortedUserDefined,
      autoGeneratedRules: sortedAutoGenerated,
      systemRules: sortedSystemRules,
    };
  };

  const toggleRuleExpansion = (ruleId: string) => {
    setExpandedRules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ruleId)) {
        newSet.delete(ruleId);
      } else {
        newSet.add(ruleId);
      }
      return newSet;
    });
  };

  const toggleSectionExpansion = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const loadRules = async () => {
    try {
      setIsLoading(true);
      
      // Initialize rules from existing transactions if no rules exist
      await rulesService.initializeRulesFromExistingTransactions();
      
      const allRules = await dataService.getAllCategoryRules();
      setRules(allRules);

      // Load stats
      const ruleStats = await rulesService.getStats();
      setStats(ruleStats);
    } catch (error) {
      console.error('Failed to load category rules:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.name || !newRule.value || !newRule.categoryName) {
      showAlert('error', 'Please fill in all required fields');
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
      showAlert('error', 'Failed to add rule');
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
    const confirmed = await showConfirmation('Are you sure you want to delete this rule?', {
      title: 'Delete Rule',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true
    });
    
    if (confirmed) {
      try {
        await dataService.deleteCategoryRule(ruleId);
        await loadRules();
      } catch (error) {
        console.error('Failed to delete rule:', error);
      }
    }
  };

  const handleDeleteAllRules = async () => {
    if (rules.length === 0) {
      showAlert('info', 'No rules to delete.');
      return;
    }

    // Show the advanced delete dialog
    setShowDeleteDialog(true);
  };

  const handleDeleteRulesConfirm = async (options: {
    system: boolean;
    autoGenerated: boolean;
    userDefined: boolean;
  }) => {
    try {
      setIsLoading(true);
      setShowDeleteDialog(false);
      
      await rulesService.clearAllRules(options);
      await loadRules();
      
      const deletedTypes = [];
      if (options.system) deletedTypes.push('system');
      if (options.autoGenerated) deletedTypes.push('auto-generated');
      if (options.userDefined) deletedTypes.push('user-defined');
      
      showAlert('success', `${deletedTypes.join(', ')} rules have been deleted successfully.`, 'Rules Deleted');
    } catch (error) {
      console.error('Failed to delete rules:', error);
      showAlert('error', 'Failed to delete rules. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateRulesFromTransactions = async () => {
    try {
      setIsLoading(true);
      const createdCount = await rulesService.initializeRulesFromExistingTransactions();
      await loadRules();
      
      if (createdCount > 0) {
        showAlert('success', `Successfully generated ${createdCount} new rule(s) from existing transactions.`, 'Rules Generated');
      } else {
        showAlert('info', 'No new rules were generated. This could be because rules already exist or there are no suitable transactions.');
      }
    } catch (error) {
      console.error('Failed to generate rules:', error);
      showAlert('error', 'Failed to generate rules from transactions.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <PageHeader>
        <h1>Category Rules</h1>
        <FlexBox gap="12px">
          <Button 
            onClick={() => setIsAddingRule(!isAddingRule)}
            disabled={isLoading}
          >
            {isAddingRule ? 'Cancel' : 'Add Rule'}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleGenerateRulesFromTransactions}
            disabled={isLoading}
          >
            {isLoading ? '🔄 Generating...' : '🤖 Generate from Transactions'}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleDeleteAllRules}
            disabled={isLoading || rules.length === 0}
            style={{ 
              color: '#f44336', 
              borderColor: '#f44336',
              ...(rules.length === 0 ? { opacity: 0.5 } : {})
            }}
          >
            🗑️ Delete All Rules
          </Button>
        </FlexBox>
      </PageHeader>

      {/* Stats Cards */}
      <FlexBox gap="20px" style={{ marginBottom: '20px' }}>
        <StatsCard>
          <h3>{stats.totalRules}</h3>
          <p>Total Rules</p>
        </StatsCard>
        <StatsCard>
          <h3>{stats.activeRules}</h3>
          <p>Active Rules</p>
        </StatsCard>
        <StatsCard>
          <h3>{stats.inactiveRules}</h3>
          <p>Inactive Rules</p>
        </StatsCard>
      </FlexBox>

      <RulesContainer>
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

        {(() => {
          const { userDefinedRules, autoGeneratedRules, systemRules } = categorizeRules(rules);
          const totalRules = userDefinedRules.length + autoGeneratedRules.length + systemRules.length;
          
          return (
            <>
              {/* System Rules Section */}
              {systemRules.length > 0 && (
                <>
                  <RuleSectionHeader $isClickable onClick={() => toggleSectionExpansion('system')}>
                    <RuleSectionTitle $isClickable>
                      <ExpandIcon $isExpanded={expandedSections.has('system')}>▶</ExpandIcon>
                      System
                      <RuleCount>({systemRules.length})</RuleCount>
                    </RuleSectionTitle>
                  </RuleSectionHeader>
                  {expandedSections.has('system') && systemRules.map(rule => (
                    <RuleCard key={rule.id}>
                      <RuleHeader onClick={() => toggleRuleExpansion(rule.id)}>
                        <RuleHeaderContent>
                          <ExpandIcon $isExpanded={expandedRules.has(rule.id)}>▶</ExpandIcon>
                          <RuleTitle>{rule.name}</RuleTitle>
                          <RuleStatus $isActive={rule.isActive}>
                            {rule.isActive ? 'Active' : 'Inactive'}
                          </RuleStatus>
                        </RuleHeaderContent>
                        <RuleControls onClick={(e) => e.stopPropagation()}>
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

                      <CollapsibleContent $isExpanded={expandedRules.has(rule.id)}>
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
                      </CollapsibleContent>
                    </RuleCard>
                  ))}
                </>
              )}

              {/* User Defined Rules Section */}
              {userDefinedRules.length > 0 && (
                <>
                  <RuleSectionHeader $isClickable onClick={() => toggleSectionExpansion('user-defined')}>
                    <RuleSectionTitle $isClickable>
                      <ExpandIcon $isExpanded={expandedSections.has('user-defined')}>▶</ExpandIcon>
                      User-defined
                      <RuleCount>({userDefinedRules.length})</RuleCount>
                    </RuleSectionTitle>
                  </RuleSectionHeader>
                  {expandedSections.has('user-defined') && userDefinedRules.map(rule => (
                    <RuleCard key={rule.id}>
                      <RuleHeader onClick={() => toggleRuleExpansion(rule.id)}>
                        <RuleHeaderContent>
                          <ExpandIcon $isExpanded={expandedRules.has(rule.id)}>▶</ExpandIcon>
                          <RuleTitle>{rule.name}</RuleTitle>
                          <RuleStatus $isActive={rule.isActive}>
                            {rule.isActive ? 'Active' : 'Inactive'}
                          </RuleStatus>
                        </RuleHeaderContent>
                        <RuleControls onClick={(e) => e.stopPropagation()}>
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

                      <CollapsibleContent $isExpanded={expandedRules.has(rule.id)}>
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
                      </CollapsibleContent>
                    </RuleCard>
                  ))}
                </>
              )}

              {/* Auto-generated Rules Section */}
              {autoGeneratedRules.length > 0 && (
                <>
                  <RuleSectionHeader $isClickable onClick={() => toggleSectionExpansion('auto-generated')}>
                    <RuleSectionTitle $isClickable>
                      <ExpandIcon $isExpanded={expandedSections.has('auto-generated')}>▶</ExpandIcon>
                      Auto-generated
                      <RuleCount>({autoGeneratedRules.length})</RuleCount>
                    </RuleSectionTitle>
                  </RuleSectionHeader>
                  {expandedSections.has('auto-generated') && autoGeneratedRules.map(rule => (
                    <RuleCard key={rule.id}>
                      <RuleHeader onClick={() => toggleRuleExpansion(rule.id)}>
                        <RuleHeaderContent>
                          <ExpandIcon $isExpanded={expandedRules.has(rule.id)}>▶</ExpandIcon>
                          <RuleTitle>{rule.name}</RuleTitle>
                          <RuleStatus $isActive={rule.isActive}>
                            {rule.isActive ? 'Active' : 'Inactive'}
                          </RuleStatus>
                        </RuleHeaderContent>
                        <RuleControls onClick={(e) => e.stopPropagation()}>
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

                      <CollapsibleContent $isExpanded={expandedRules.has(rule.id)}>
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
                      </CollapsibleContent>
                    </RuleCard>
                  ))}
                </>
              )}

              {/* Empty state */}
              {totalRules === 0 && !isAddingRule && !isLoading && (
                <Card style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  <h2>No Category Rules Yet</h2>
                  <p>Create rules to automatically categorize transactions before AI processing.</p>
                  <p>Rules help reduce AI costs and ensure consistent categorization for similar transactions.</p>
                  <div style={{ marginTop: '20px' }}>
                    <Button onClick={() => setIsAddingRule(true)} style={{ marginRight: '10px' }}>
                      Add Your First Rule
                    </Button>
                    <Button variant="outline" onClick={handleGenerateRulesFromTransactions}>
                      🤖 Generate from Transactions
                    </Button>
                  </div>
                </Card>
              )}

              {/* Loading state */}
              {isLoading && (
                <Card style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  <h3>🔄 Initializing Rules...</h3>
                  <p>Please wait while we check for existing rules and initialize the system.</p>
                </Card>
              )}
            </>
          );
        })()}
      </RulesContainer>

      {/* Advanced Delete Rules Dialog */}
      <DeleteRulesDialog
        isOpen={showDeleteDialog}
        totalRules={rules.length}
        systemRulesCount={categorizeRules(rules).systemRules.length}
        autoGeneratedRulesCount={categorizeRules(rules).autoGeneratedRules.length}
        userDefinedRulesCount={categorizeRules(rules).userDefinedRules.length}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeleteRulesConfirm}
      />
    </div>
  );
};

export default Rules;
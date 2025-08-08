import React, { useState, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import styled from 'styled-components';
import { Card, PageHeader, Button, FlexBox } from '../../styles/globalStyles';
import { Category, Subcategory } from '../../types';
import { defaultCategories } from '../../data/defaultCategories';
import { ActionsMenu, MenuAction } from '../shared/ActionsMenu';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

const CategoriesContainer = styled.div`
  .ag-theme-alpine {
    height: 500px;
    width: 100%;
  }

  .category-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .stats-bar {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
    
    .stat-item {
      background: #f8f9fa;
      padding: 12px 16px;
      border-radius: 8px;
      text-align: center;
      
      .label {
        font-size: 0.85rem;
        color: #666;
        margin-bottom: 4px;
      }
      
      .value {
        font-size: 1.2rem;
        font-weight: 600;
        color: #333;
      }
    }
  }
`;

const EditModalOverlay = styled.div`
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

const EditModalContent = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;

  h2 {
    margin: 0 0 20px 0;
    color: #333;
    font-size: 1.5rem;
  }

  .form-group {
    margin-bottom: 16px;
    
    label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: #555;
      font-size: 0.9rem;
    }
    
    input, select, textarea {
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
    }
  }

  .form-row {
    display: flex;
    gap: 16px;
    
    .form-group {
      flex: 1;
    }
  }

  .subcategories-section {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #eee;
    
    h3 {
      margin-bottom: 12px;
      color: #333;
    }
    
    .subcategory-item {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      align-items: center;
      
      input {
        flex: 1;
      }
      
      button {
        padding: 4px 8px;
        font-size: 0.8rem;
      }
    }
  }

  .form-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid #eee;
  }
`;

interface CategoriesManagementProps {}

export const CategoriesManagement: React.FC<CategoriesManagementProps> = () => {
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    color: '#2196F3',
    icon: '📁',
    subcategories: [] as Array<{ name: string; description: string }>
  });

  // Prepare data for grid - flatten categories and subcategories
  const [gridData, setGridData] = useState<any[]>([]);

  useEffect(() => {
    const flatData: any[] = [];
    
    categories.forEach(category => {
      // Add category row
      flatData.push({
        id: category.id,
        type: 'category',
        name: category.name,
        categoryType: category.type,
        color: category.color,
        icon: category.icon,
        subcategoryCount: category.subcategories.length,
        description: `${category.subcategories.length} subcategories`,
        category: null,
        subcategory: null
      });
      
      // Add subcategory rows
      category.subcategories.forEach(sub => {
        flatData.push({
          id: `${category.id}-${sub.id}`,
          type: 'subcategory',
          name: `  ↳ ${sub.name}`,
          categoryType: category.type,
          color: category.color,
          icon: '📝',
          subcategoryCount: null,
          description: sub.description,
          category: category,
          subcategory: sub
        });
      });
    });
    
    setGridData(flatData);
  }, [categories]);

  // Actions cell renderer component
  const ActionsCellRenderer = (params: any) => {
    if (params.data.type === 'category') {
      const actions: MenuAction[] = [
        {
          icon: '✏️',
          label: 'Edit Category',
          onClick: () => handleEditCategory(params.data.id)
        },
        {
          icon: '🗑️',
          label: 'Delete Category',
          onClick: () => handleDeleteCategory(params.data.id),
          variant: 'danger'
        }
      ];
      return <ActionsMenu menuId={`category-menu-${params.data.id}`} actions={actions} />;
    }
    return null;
  };

  const columnDefs: ColDef[] = [
    {
      headerName: 'Type',
      field: 'type',
      width: 100,
      cellRenderer: (params: any) => {
        return params.value === 'category' ? '📁' : '📝';
      }
    },
    {
      headerName: 'Name',
      field: 'name',
      flex: 1,
      cellRenderer: (params: any) => {
        const isCategory = params.data.type === 'category';
        return React.createElement('span', {
          style: { 
            fontWeight: isCategory ? '600' : '400', 
            color: isCategory ? '#333' : '#666' 
          }
        }, params.value);
      }
    },
    {
      headerName: 'Category Type',
      field: 'categoryType',
      width: 120,
      cellRenderer: (params: any) => {
        const isIncome = params.value === 'income';
        return React.createElement('span', {
          style: {
            background: isIncome ? '#e8f5e8' : '#fff3e0',
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '0.8rem',
            color: isIncome ? '#2e7d32' : '#ef6c00'
          }
        }, params.value);
      }
    },
    {
      headerName: 'Description',
      field: 'description',
      flex: 1
    },
    {
      headerName: 'Actions',
      width: 80,
      cellRenderer: ActionsCellRenderer
    }
  ];

  const handleEditCategory = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        type: category.type,
        color: category.color || '#2196F3',
        icon: category.icon || '📁',
        subcategories: category.subcategories.map(sub => ({
          name: sub.name,
          description: sub.description || ''
        }))
      });
      setShowEditModal(true);
    }
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setCategoryForm({
      name: '',
      type: 'expense',
      color: '#2196F3',
      icon: '📁',
      subcategories: []
    });
    setShowEditModal(true);
  };

  const handleSaveCategory = () => {
    // Implementation for saving category changes
    setShowEditModal(false);
    setEditingCategory(null);
  };

  const handleDeleteCategory = (categoryId: string) => {
    if (window.confirm('Are you sure you want to delete this category? This action cannot be undone.')) {
      const updatedCategories = categories.filter(c => c.id !== categoryId);
      setCategories(updatedCategories);
    }
  };

  const handleAddSubcategory = () => {
    setCategoryForm({
      ...categoryForm,
      subcategories: [...categoryForm.subcategories, { name: '', description: '' }]
    });
  };

  const handleRemoveSubcategory = (index: number) => {
    setCategoryForm({
      ...categoryForm,
      subcategories: categoryForm.subcategories.filter((_, i) => i !== index)
    });
  };

  const handleSubcategoryChange = (index: number, field: 'name' | 'description', value: string) => {
    const updated = [...categoryForm.subcategories];
    updated[index] = { ...updated[index], [field]: value };
    setCategoryForm({
      ...categoryForm,
      subcategories: updated
    });
  };

  const onGridReady = (params: any) => {
    params.api.addEventListener('cellClicked', (event: any) => {
      if (event.event.target.classList.contains('edit-category-btn')) {
        const categoryId = event.event.target.dataset.id;
        handleEditCategory(categoryId);
      }
    });
  };

  const stats = {
    totalCategories: categories.length,
    incomeCategories: categories.filter(c => c.type === 'income').length,
    expenseCategories: categories.filter(c => c.type === 'expense').length,
    totalSubcategories: categories.reduce((sum, c) => sum + c.subcategories.length, 0)
  };

  return (
    <div>
      <PageHeader>
        <h1>Categories Management</h1>
        <FlexBox gap="12px">
          <Button onClick={handleAddCategory}>Add Category</Button>
          <Button variant="outline">Import Categories</Button>
          <Button variant="outline">Export Categories</Button>
        </FlexBox>
      </PageHeader>

      <Card>
        <CategoriesContainer>
          <div className="ag-theme-alpine">
            <AgGridReact
              columnDefs={columnDefs}
              rowData={gridData}
              onGridReady={onGridReady}
              pagination={true}
              paginationPageSize={50}
              defaultColDef={{
                resizable: true,
                sortable: true
              }}
            />
          </div>
        </CategoriesContainer>
      </Card>

      {/* Edit Category Modal */}
      {showEditModal && (
        <EditModalOverlay onClick={() => setShowEditModal(false)}>
          <EditModalContent onClick={(e) => e.stopPropagation()}>
            <h2>{editingCategory ? 'Edit Category' : 'Add Category'}</h2>
            
            <div className="form-row">
              <div className="form-group">
                <label>Category Name *</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({...categoryForm, name: e.target.value})}
                  placeholder="e.g., Food & Dining"
                />
              </div>

              <div className="form-group">
                <label>Type *</label>
                <select
                  value={categoryForm.type}
                  onChange={(e) => setCategoryForm({...categoryForm, type: e.target.value as 'income' | 'expense' | 'transfer'})}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Color</label>
                <input
                  type="color"
                  value={categoryForm.color}
                  onChange={(e) => setCategoryForm({...categoryForm, color: e.target.value})}
                />
              </div>

              <div className="form-group">
                <label>Icon</label>
                <input
                  type="text"
                  value={categoryForm.icon}
                  onChange={(e) => setCategoryForm({...categoryForm, icon: e.target.value})}
                  placeholder="📁"
                />
              </div>
            </div>

            <div className="subcategories-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Subcategories</h3>
                <Button onClick={handleAddSubcategory}>Add Subcategory</Button>
              </div>
              
              {categoryForm.subcategories.map((sub, index) => (
                <div key={index} className="subcategory-item">
                  <input
                    type="text"
                    value={sub.name}
                    onChange={(e) => handleSubcategoryChange(index, 'name', e.target.value)}
                    placeholder="Subcategory name"
                  />
                  <input
                    type="text"
                    value={sub.description}
                    onChange={(e) => handleSubcategoryChange(index, 'description', e.target.value)}
                    placeholder="Description"
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => handleRemoveSubcategory(index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              
              {categoryForm.subcategories.length === 0 && (
                <p style={{ color: '#666', fontStyle: 'italic' }}>No subcategories added yet.</p>
              )}
            </div>

            <div className="form-actions">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveCategory}>
                {editingCategory ? 'Update' : 'Create'} Category
              </Button>
            </div>
          </EditModalContent>
        </EditModalOverlay>
      )}
    </div>
  );
};

export default CategoriesManagement;

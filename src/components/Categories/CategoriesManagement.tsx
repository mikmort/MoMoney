import React, { useState, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import styled from 'styled-components';
import { Card, PageHeader, Button, FlexBox } from '../../styles/globalStyles';
import { Category } from '../../types';
import { ActionsMenu } from '../shared/ActionsMenu';
import { useNotification } from '../../contexts/NotificationContext';
import { useCategoriesManager } from '../../hooks/useCategoriesManager';
import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';
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

  .filters-section {
    margin-bottom: 20px;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 8px;
    
    .filter-label {
      font-weight: 600;
      margin-bottom: 8px;
      color: #333;
    }
    
    .filter-buttons {
      display: flex;
      gap: 8px;
      
      .filter-btn {
        padding: 8px 16px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
        
        &:hover {
          background: #f5f5f5;
        }
        
        &.active {
          background: #2196F3;
          color: white;
          border-color: #2196F3;
        }
      }
    }
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

  /* Ensure Actions column cells are vertically centered */
  .ag-cell:last-child {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  /* Match the actions cell styling from transactions */
  .actions-cell button {
    outline: none !important;
    /* Make the button subtler inside the grid */
    border-color: #d0d7de !important; /* neutral border instead of theme blue */
    color: #444 !important;
    padding: 6px 10px !important; /* fit narrow column */
    border-width: 1px !important;
    background: #fff !important;
  }
  .actions-cell button:focus,
  .actions-cell button:focus-visible {
    outline: none !important;
    box-shadow: none !important;
  }
  .actions-cell button:hover {
    background: #f5f5f5 !important;
    border-color: #c7ced6 !important;
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
  pointer-events: auto;
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
    
    /* Add spacing after the header section with Add Subcategory button */
    > div:first-child {
      margin-bottom: 20px;
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
  const { showAlert, showConfirmation } = useNotification();
  const { 
    categories, 
    addCategory, 
    updateCategory, 
    deleteCategory,
    saveCategories 
  } = useCategoriesManager();
  
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    type: 'expense' as 'income' | 'expense' | 'transfer' | 'asset-allocation',
    color: '#2196F3',
    icon: '📁',
    subcategories: [] as Array<{ name: string; description: string }>
  });
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  // Apply category filter
  useEffect(() => {
    if (categoryFilter === 'all') {
      setFilteredCategories(categories);
    } else {
      setFilteredCategories(categories.filter(cat => cat.type === categoryFilter));
    }
  }, [categories, categoryFilter]);

  // Prepare data for grid - flatten categories and subcategories
  const [gridData, setGridData] = useState<any[]>([]);

  useEffect(() => {
    const flatData: any[] = [];
    
    filteredCategories.forEach(category => {
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
  }, [filteredCategories]);

  const ActionsCellRenderer = (params: any) => {
    if (params.data.type === 'category') {
      const isInternalTransfer = params.data.name === 'Internal Transfer';
      
      return (
        <div className="actions-cell" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => handleEditCategory(params.data.id)}
            style={{ 
              padding: '4px 8px', 
              border: '1px solid #2196F3', 
              borderRadius: '4px', 
              background: '#2196F3', 
              color: 'white',
              cursor: 'pointer',
              fontSize: '12px'
            }}
            title="Edit Category"
          >
            Edit
          </button>
          {!isInternalTransfer && (
            <button
              onClick={() => handleDeleteCategory(params.data.id)}
              style={{ 
                padding: '4px 8px', 
                border: '1px solid #f44336', 
                borderRadius: '4px', 
                background: '#f44336', 
                color: 'white',
                cursor: 'pointer',
                fontSize: '12px'
              }}
              title="Delete Category"
            >
              Delete
            </button>
          )}
          {isInternalTransfer && (
            <button
              disabled
              style={{ 
                padding: '4px 8px', 
                border: '1px solid #ccc', 
                borderRadius: '4px', 
                background: '#f5f5f5', 
                color: '#999',
                cursor: 'not-allowed',
                fontSize: '12px'
              }}
              title="Internal Transfer category cannot be deleted (protected system category)"
            >
              Protected
            </button>
          )}
        </div>
      );
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
        return React.createElement(isCategory ? 'button' : 'span', {
          style: { 
            fontWeight: isCategory ? '600' : '400', 
            color: isCategory ? '#333' : '#666',
            ...(isCategory ? {
              background: 'none',
              border: 'none',
              padding: '0',
              cursor: 'pointer',
              textDecoration: 'underline',
              textDecorationColor: 'transparent',
              transition: 'text-decoration-color 0.2s',
            } : {})
          },
          ...(isCategory ? {
            onMouseEnter: (e: any) => {
              e.target.style.textDecorationColor = '#333';
            },
            onMouseLeave: (e: any) => {
              e.target.style.textDecorationColor = 'transparent';
            },
            onClick: () => handleEditCategory(params.data.id)
          } : {})
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
      width: 140,
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
    // Validate required fields
    if (!categoryForm.name.trim()) {
      showAlert('error', 'Category name is required');
      return;
    }

    if (editingCategory) {
      // Update existing category
      const updatedCategory: Category = {
        ...editingCategory,
        name: categoryForm.name.trim(),
        type: categoryForm.type,
        color: categoryForm.color,
        icon: categoryForm.icon,
        subcategories: categoryForm.subcategories.map((sub, index) => ({
          id: sub.name ? `${categoryForm.name.toLowerCase().replace(/\s+/g, '-')}-${sub.name.toLowerCase().replace(/\s+/g, '-')}` : `subcategory-${index}`,
          name: sub.name.trim(),
          description: sub.description?.trim() || ''
        })).filter(sub => sub.name) // Remove empty subcategories
      };
      updateCategory(editingCategory.id, updatedCategory);
    } else {
      // Create new category
      const newCategory: Category = {
        id: categoryForm.name.toLowerCase().replace(/\s+/g, '-') + '-' + uuidv4().substring(0, 8),
        name: categoryForm.name.trim(),
        type: categoryForm.type,
        color: categoryForm.color,
        icon: categoryForm.icon,
        subcategories: categoryForm.subcategories.map((sub, index) => ({
          id: sub.name ? `${categoryForm.name.toLowerCase().replace(/\s+/g, '-')}-${sub.name.toLowerCase().replace(/\s+/g, '-')}` : `subcategory-${index}`,
          name: sub.name.trim(),
          description: sub.description?.trim() || ''
        })).filter(sub => sub.name) // Remove empty subcategories
      };
      
      addCategory(newCategory);
    }

    // Close modal and reset form
    setShowEditModal(false);
    setEditingCategory(null);
  };

  const handleExportCategories = () => {
    // Convert categories to CSV format
    const csvData: any[] = [];
    
    categories.forEach(category => {
      if (category.subcategories.length === 0) {
        // Category with no subcategories
        csvData.push({
          'Category Name': category.name,
          'Category Type': category.type,
          'Category Color': category.color || '',
          'Category Icon': category.icon || '',
          'Subcategory Name': '',
          'Subcategory Description': '',
          'Subcategory Keywords': ''
        });
      } else {
        // Add each subcategory as a separate row
        category.subcategories.forEach(subcategory => {
          csvData.push({
            'Category Name': category.name,
            'Category Type': category.type,
            'Category Color': category.color || '',
            'Category Icon': category.icon || '',
            'Subcategory Name': subcategory.name,
            'Subcategory Description': subcategory.description || '',
            'Subcategory Keywords': (subcategory.keywords || []).join(';')
          });
        });
      }
    });

    // Generate CSV content
    const csv = Papa.unparse(csvData);
    
    // Create and trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `mo-money-categories-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = () => {
    // Create empty template with headers
    const templateData = [{
      'Category Name': 'Food & Dining',
      'Category Type': 'expense',
      'Category Color': '#4CAF50',
      'Category Icon': '🍽️',
      'Subcategory Name': 'Restaurants',
      'Subcategory Description': 'Dining out',
      'Subcategory Keywords': 'restaurant;dining;food'
    }, {
      'Category Name': 'Food & Dining',
      'Category Type': 'expense',
      'Category Color': '#4CAF50',
      'Category Icon': '🍽️',
      'Subcategory Name': 'Groceries',
      'Subcategory Description': 'Food shopping',
      'Subcategory Keywords': 'grocery;supermarket;food'
    }];

    const csv = Papa.unparse(templateData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'mo-money-categories-template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportCategories = () => {
    setShowImportModal(true);
    setImportPreview([]);
    setImportErrors([]);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      parseImportFile(file);
    }
  };

  const parseImportFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errors: string[] = [];
        const preview: any[] = [];

        // Validate headers
        const requiredHeaders = ['Category Name', 'Category Type', 'Subcategory Name'];
        const headers = Object.keys(results.data[0] || {});
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
        
        if (missingHeaders.length > 0) {
          errors.push(`Missing required columns: ${missingHeaders.join(', ')}`);
        }

        // Validate data
        results.data.forEach((row: any, index: number) => {
          if (!row['Category Name']) {
            errors.push(`Row ${index + 1}: Category Name is required`);
          }
          if (!row['Category Type'] || !['income', 'expense'].includes(row['Category Type'])) {
            errors.push(`Row ${index + 1}: Category Type must be either 'income' or 'expense'`);
          }
          preview.push(row);
        });

        setImportErrors(errors);
        setImportPreview(preview);
      },
      error: (error) => {
        setImportErrors([`File parsing error: ${error.message}`]);
      }
    });
  };

  const processImport = () => {
    if (importErrors.length > 0) {
      showAlert('error', 'Please fix the errors before importing');
      return;
    }

    // Group preview data by category
    const importedCategories = new Map<string, any>();
    
    importPreview.forEach(row => {
      const categoryKey = `${row['Category Name']}-${row['Category Type']}`;
      
      if (!importedCategories.has(categoryKey)) {
        importedCategories.set(categoryKey, {
          name: row['Category Name'],
          type: row['Category Type'],
          color: row['Category Color'] || '#2196F3',
          icon: row['Category Icon'] || '📁',
          subcategories: []
        });
      }

      if (row['Subcategory Name']) {
        const category = importedCategories.get(categoryKey);
        category.subcategories.push({
          name: row['Subcategory Name'],
          description: row['Subcategory Description'] || '',
          keywords: row['Subcategory Keywords'] ? row['Subcategory Keywords'].split(';').map((k: string) => k.trim()).filter((k: string) => k) : []
        });
      }
    });

    // Merge with existing categories (avoiding duplicates)
    const newCategories = [...categories];
    let importCount = 0;

    importedCategories.forEach(importedCategory => {
      const existingIndex = newCategories.findIndex(c => 
        c.name.toLowerCase() === importedCategory.name.toLowerCase() && 
        c.type === importedCategory.type
      );

      if (existingIndex >= 0) {
        // Merge subcategories
        const existingCategory = newCategories[existingIndex];
        importedCategory.subcategories.forEach((newSub: any) => {
          const existingSubIndex = existingCategory.subcategories.findIndex(s => 
            s.name.toLowerCase() === newSub.name.toLowerCase()
          );
          
          if (existingSubIndex === -1) {
            existingCategory.subcategories.push({
              id: `${existingCategory.id}-${newSub.name.toLowerCase().replace(/\s+/g, '-')}`,
              ...newSub
            });
            importCount++;
          }
        });
      } else {
        // Add new category
        const newCategory: Category = {
          id: importedCategory.name.toLowerCase().replace(/\s+/g, '-'),
          name: importedCategory.name,
          type: importedCategory.type,
          color: importedCategory.color,
          icon: importedCategory.icon,
          subcategories: importedCategory.subcategories.map((sub: any, index: number) => ({
            id: `${importedCategory.name.toLowerCase().replace(/\s+/g, '-')}-${sub.name.toLowerCase().replace(/\s+/g, '-')}`,
            ...sub
          }))
        };
        newCategories.push(newCategory);
        importCount++;
      }
    });

    saveCategories(newCategories);
    setShowImportModal(false);
    showAlert('success', `Import completed! ${importCount} categories/subcategories imported.`, 'Import Successful');
  };

  const handleDeleteCategory = async (categoryId: string) => {
    // Prevent deletion of Internal Transfer category
    const category = categories.find(c => c.id === categoryId);
    if (category?.name === 'Internal Transfer') {
      showAlert('error', 'The "Internal Transfer" category cannot be deleted as it has special logic for handling transfers between accounts. You can edit its subcategories if needed.', 'Protected Category');
      return;
    }
    
    const shouldDelete = await showConfirmation(
      'Are you sure you want to delete this category? This action cannot be undone.',
      { 
        title: 'Delete Category',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true
      }
    );
    
    if (shouldDelete) {
      deleteCategory(categoryId);
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

  return (
    <div>
      <PageHeader>
        <h1>Categories Management</h1>
        <FlexBox gap="12px">
          <Button onClick={handleAddCategory}>Add Category</Button>
          <ActionsMenu
            menuId="category-management-menu"
            actions={[
              {
                icon: '📥',
                label: 'Import Categories',
                onClick: handleImportCategories
              },
              {
                icon: '📤',
                label: 'Export Categories', 
                onClick: handleExportCategories
              }
            ]}
          />
        </FlexBox>
      </PageHeader>

      <Card>
        <CategoriesContainer>
          {/* Category Type Filters */}
          <div className="filters-section">
            <div className="filter-label">Filter by Category Type:</div>
            <div className="filter-buttons">
              <button 
                className={`filter-btn ${categoryFilter === 'all' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('all')}
              >
                All Categories ({categories.length})
              </button>
              <button 
                className={`filter-btn ${categoryFilter === 'income' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('income')}
              >
                Income ({categories.filter(c => c.type === 'income').length})
              </button>
              <button 
                className={`filter-btn ${categoryFilter === 'expense' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('expense')}
              >
                Expenses ({categories.filter(c => c.type === 'expense').length})
              </button>
            </div>
          </div>

          <div className="ag-theme-alpine">
            <AgGridReact
              columnDefs={columnDefs}
              rowData={gridData}
              onGridReady={onGridReady}
              pagination={true}
              paginationPageSize={200}
              paginationPageSizeSelector={[50, 100, 200, 500]}
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
                  onChange={(e) => setCategoryForm({...categoryForm, type: e.target.value as 'income' | 'expense' | 'transfer' | 'asset-allocation'})}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                  <option value="asset-allocation">Asset Allocation</option>
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

      {/* Import Categories Modal */}
      {showImportModal && (
        <EditModalOverlay onClick={() => setShowImportModal(false)}>
          <EditModalContent onClick={(e) => e.stopPropagation()}>
            <h2>Import Categories</h2>
            
            <div className="form-group">
              <label>Step 1: Download Template (Optional)</label>
              <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '10px' }}>
                Download a template file to see the expected format, or use your own CSV file with the required columns.
              </p>
              <Button variant="outline" onClick={handleDownloadTemplate}>
                Download CSV Template
              </Button>
            </div>

            <div className="form-group">
              <label>Step 2: Upload CSV File</label>
              <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '10px' }}>
                Upload a CSV file with columns: Category Name, Category Type, Subcategory Name, etc.
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                style={{ width: '100%', padding: '8px' }}
              />
            </div>

            {importErrors.length > 0 && (
              <div className="form-group">
                <label style={{ color: '#F44336' }}>Errors Found:</label>
                <div style={{ 
                  background: '#ffebee', 
                  border: '1px solid #F44336', 
                  borderRadius: '4px', 
                  padding: '10px',
                  maxHeight: '150px',
                  overflowY: 'auto'
                }}>
                  {importErrors.map((error, index) => (
                    <div key={index} style={{ color: '#F44336', fontSize: '0.9rem', marginBottom: '4px' }}>
                      • {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {importPreview.length > 0 && importErrors.length === 0 && (
              <div className="form-group">
                <label>Preview ({importPreview.length} rows):</label>
                <div style={{ 
                  background: '#f8f9fa', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px', 
                  padding: '10px',
                  maxHeight: '300px',
                  overflowY: 'auto'
                }}>
                  <table style={{ width: '100%', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #ddd' }}>
                        <th style={{ padding: '4px', textAlign: 'left' }}>Category</th>
                        <th style={{ padding: '4px', textAlign: 'left' }}>Type</th>
                        <th style={{ padding: '4px', textAlign: 'left' }}>Subcategory</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.slice(0, 10).map((row, index) => (
                        <tr key={index}>
                          <td style={{ padding: '4px' }}>{row['Category Name']}</td>
                          <td style={{ padding: '4px' }}>{row['Category Type']}</td>
                          <td style={{ padding: '4px' }}>{row['Subcategory Name']}</td>
                        </tr>
                      ))}
                      {importPreview.length > 10 && (
                        <tr>
                          <td colSpan={3} style={{ padding: '4px', fontStyle: 'italic' }}>
                            ... and {importPreview.length - 10} more rows
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="form-actions">
              <Button variant="outline" onClick={() => setShowImportModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={processImport}
                disabled={importPreview.length === 0 || importErrors.length > 0}
              >
                Import Categories
              </Button>
            </div>
          </EditModalContent>
        </EditModalOverlay>
      )}
    </div>
  );
};

export default CategoriesManagement;

import { useERPStore } from '../store/useERPStore';
import { MaterialCategory } from '../types/erp';

export class CategoryService {
  static create(data: Omit<MaterialCategory, 'id'>) {
    const state = useERPStore.getState();
    return state.addCategory(data);
  }

  static update(id: string, data: Partial<MaterialCategory>) {
    const state = useERPStore.getState();
    state.updateCategory(id, data);
  }

  static delete(id: string) {
    const state = useERPStore.getState();
    state.removeModuleItem('categories', id);
  }
}

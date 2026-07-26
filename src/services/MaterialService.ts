import { useERPStore } from '../store/useERPStore';
import { RawMaterial } from '../types/erp';

export class MaterialService {
  static create(data: Omit<RawMaterial, 'id' | 'stockPcs' | 'processedStockPcs'>) {
    const state = useERPStore.getState();
    return state.addRawMaterial(data);
  }

  static update(id: string, data: Partial<RawMaterial>) {
    const state = useERPStore.getState();
    state.updateModuleItem('materials', id, data);
  }

  static delete(id: string) {
    const state = useERPStore.getState();
    state.removeModuleItem('materials', id);
  }
}

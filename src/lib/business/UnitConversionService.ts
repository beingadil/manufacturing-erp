export class UnitConversionService {
  /**
   * Centralized KG to Tons conversion.
   */
  static kgToTons(kg: number): number {
    return kg / 1000;
  }

  /**
   * Centralized Tons to KG conversion.
   */
  static tonsToKg(tons: number): number {
    return tons * 1000;
  }

  /**
   * Converts weight based on provided unit to KGs.
   */
  static convertToKg(weight: number, unit: 'KGs' | 'Tons'): number {
    return unit === 'KGs' ? weight : this.tonsToKg(weight);
  }

  /**
   * Centralized PCS Calculation logic.
   * e.g., 500 KG with 0.570 KG/Piece => 877 PCS.
   */
  static calculatePcsFromWeight(weight: number, unit: 'KGs' | 'Tons', weightPerPiece: number): number {
    if (!weightPerPiece || weightPerPiece <= 0) return 0;
    const weightInKg = this.convertToKg(weight, unit);
    return Math.floor(weightInKg / weightPerPiece);
  }
}

export const PERSONAL_CATEGORY_COLORS: Record<string, string> = {
  Alimentación: '#f43f5e',
  Transporte: '#3b82f6',
  Vivienda: '#10b981',
  Salud: '#a855f7',
  Educación: '#f59e0b',
  Entretenimiento: '#ec4899',
  Viajes: '#06b6d4',
  Otros: '#64748b'
};

export const PERSONAL_CATEGORY_ICONS: Record<string, string> = {
  Alimentación: '🍔',
  Transporte: '🚗',
  Vivienda: '🏠',
  Salud: '🩺',
  Educación: '📚',
  Entretenimiento: '🍿',
  Viajes: '✈️',
  Otros: '💰'
};

export interface DonutSegment {
  cat: string;
  val: number;
  pct: number;
  startAngle: number;
  angle: number;
  color: string;
}

// Construye segmentos para el gráfico donut a partir de totales por categoría
export function buildDonutSegments(
  categoryData: Record<string, number>,
  colors: Record<string, string> = PERSONAL_CATEGORY_COLORS
): DonutSegment[] {
  const categoryKeys = Object.keys(categoryData);
  const total = Object.values(categoryData).reduce((acc, value) => acc + value, 0);
  let accumulatedAngle = 0;

  return categoryKeys.map((cat) => {
    const val = categoryData[cat];
    const pct = total > 0 ? val / total : 0;
    const angle = pct * 360;
    const color = colors[cat] || '#64748b';
    const startAngle = accumulatedAngle;
    accumulatedAngle += angle;
    return { cat, val, pct, startAngle, angle, color };
  });
}

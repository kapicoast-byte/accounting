export const INVENTORY_CATEGORIES = [
  'Raw Materials',
  'Semi-Processed',
  'Finished Dishes',
  'Beverages',
  'Packaging Material',
];

export const INVENTORY_UNITS = [
  'kg',
  'gram',
  'litre',
  'ml',
  'piece',
  'portion',
  'plate',
  'bottle',
  'pack',
  'box',
  'dozen',
];

export const STOCK_ADJUSTMENT_TYPES = {
  IN: 'in',
  OUT: 'out',
};

export const STOCK_ADJUSTMENT_REASONS = {
  in: ['Purchase', 'Production', 'Stock count correction', 'Returned by customer', 'Other'],
  out: ['Sale', 'Wastage / spoilage', 'Internal use', 'Damaged', 'Stock count correction', 'Other'],
};

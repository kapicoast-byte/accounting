export {
  MENU_CATEGORIES,
  MENU_GST_RATES,
  MENU_PORTION_UNITS,
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
} from './menuItemService';

import { getDoc, doc } from 'firebase/firestore';
import { db } from './firebase';

export async function getMenuItem(companyId, menuItemId) {
  const snap = await getDoc(doc(db, 'companies', companyId, 'menuItems', menuItemId));
  return snap.exists() ? { menuItemId: snap.id, ...snap.data() } : null;
}

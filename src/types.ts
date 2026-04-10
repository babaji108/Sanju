export interface Vegetable {
  id: string;
  name: string;
  price: number;
  available: boolean;
  image?: string;
}

export interface OrderItem {
  name: string;
  qty: number;
  unit: 'kg' | 'g';
  price: number;
}

export interface Order {
  id?: string;
  customerName: string;
  mobile: string;
  address: string;
  items: string;
  total: number;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: any;
  distance?: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'user';
}

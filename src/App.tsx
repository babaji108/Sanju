import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingCart, 
  MapPin, 
  User, 
  Phone, 
  Home, 
  Leaf, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  LogOut, 
  Trash2, 
  Plus, 
  Minus,
  MessageCircle,
  ChevronRight,
  Clock,
  PackageCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  updateDoc,
  doc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';

import { db, auth, OperationType, handleFirestoreError } from './firebase';
import { VEGGIES, SHOP_LOCATION, WHATSAPP_NUMBER, ADMIN_CODE } from './constants';
import { Vegetable, OrderItem, Order } from './types';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Badge } from './components/ui/badge';
import { Label } from './components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Separator } from './components/ui/separator';
import { ScrollArea } from './components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from './components/ui/dialog';

// Helper for distance calculation
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function App() {
  const [cart, setCart] = useState<Record<string, { qty: number, unit: 'kg' | 'g' }>>({});
  const [customer, setCustomer] = useState({ name: '', mobile: '', address: '' });
  const [distance, setDistance] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      // Check if user is the designated admin
      if (u?.email === "sriswamiji108@gmail.com") {
        setIsAdmin(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Real-time Orders for Admin
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(fetchedOrders);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'orders');
    });
    return () => unsubscribe();
  }, [isAdmin]);

  const handleAddToCart = (id: string, qty: number, unit: 'kg' | 'g') => {
    if (qty <= 0) {
      const newCart = { ...cart };
      delete newCart[id];
      setCart(newCart);
      return;
    }
    setCart(prev => ({
      ...prev,
      [id]: { qty, unit }
    }));
  };

  const total = useMemo(() => {
    return Object.entries(cart).reduce((acc, [id, item]) => {
      const veggie = VEGGIES.find(v => v.id === id);
      if (!veggie) return acc;
      const cartItem = item as { qty: number, unit: 'kg' | 'g' };
      const qtyInKg = cartItem.unit === 'kg' ? cartItem.qty : cartItem.qty / 1000;
      return acc + (qtyInKg * veggie.price);
    }, 0);
  }, [cart]);

  const cartSummary = useMemo(() => {
    return Object.entries(cart).map(([id, item]) => {
      const veggie = VEGGIES.find(v => v.id === id);
      if (!veggie) return '';
      const cartItem = item as { qty: number, unit: 'kg' | 'g' };
      const qtyInKg = cartItem.unit === 'kg' ? cartItem.qty : cartItem.qty / 1000;
      return `${veggie.name}: ${cartItem.qty}${cartItem.unit} = ₹${(qtyInKg * veggie.price).toFixed(2)}`;
    }).join('\n');
  }, [cart]);

  const checkLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation आपके ब्राउज़र द्वारा समर्थित नहीं है।");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const d = getDistance(SHOP_LOCATION.lat, SHOP_LOCATION.lng, pos.coords.latitude, pos.coords.longitude);
        setDistance(d);
        if (d > 40) {
          toast.warning(`दूरी ${d.toFixed(2)} KM है। हम केवल 40 KM तक डिलीवरी करते हैं।`);
        } else {
          toast.success(`दूरी ${d.toFixed(2)} KM है। आप ऑर्डर कर सकते हैं!`);
        }
      },
      (err) => {
        toast.error("लोकेशन एक्सेस करने में समस्या हुई।");
      }
    );
  };

  const validateOrder = () => {
    if (total < 300) {
      toast.error("न्यूनतम ऑर्डर ₹300 होना चाहिए।");
      return false;
    }
    if (distance !== null && distance > 40) {
      toast.error("क्षमा करें, हम 40 KM से अधिक दूरी पर डिलीवरी नहीं करते हैं।");
      return false;
    }
    if (!customer.name || !customer.mobile || !customer.address) {
      toast.error("कृपया सभी ग्राहक जानकारी भरें।");
      return false;
    }
    if (customer.mobile.length !== 10) {
      toast.error("कृपया सही 10 अंकों का मोबाइल नंबर डालें।");
      return false;
    }
    return true;
  };

  const placeOrder = async () => {
    if (!validateOrder()) return;
    setIsSubmitting(true);

    try {
      const orderData: Order = {
        customerName: customer.name,
        mobile: customer.mobile,
        address: customer.address,
        items: cartSummary,
        total: total,
        status: 'pending',
        createdAt: serverTimestamp(),
        distance: distance || undefined
      };

      await addDoc(collection(db, 'orders'), orderData);
      toast.success("ऑर्डर सफलतापूर्वक प्लेस हो गया है!");
      setCart({});
      setCustomer({ name: '', mobile: '', address: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendWhatsApp = () => {
    if (!validateOrder()) return;
    const msg = `*नया ऑर्डर:*\n\n${cartSummary}\n\n*कुल:* ₹${total.toFixed(2)}\n\n*ग्राहक:* ${customer.name}\n*मोबाइल:* ${customer.mobile}\n*पता:* ${customer.address}`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`);
  };

  const handleAdminLogin = () => {
    if (adminCodeInput === ADMIN_CODE) {
      setIsAdmin(true);
      setShowAdminLogin(false);
      toast.success("एडमिन लॉगिन सफल!");
    } else {
      toast.error("गलत कोड!");
    }
  };

  const updateOrderStatus = async (id: string, status: 'completed' | 'cancelled') => {
    try {
      await updateDoc(doc(db, 'orders', id), { status });
      toast.success(`ऑर्डर ${status === 'completed' ? 'पूरा' : 'रद्द'} कर दिया गया है।`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${id}`);
    }
  };

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success("लॉगिन सफल!");
    } catch (error) {
      toast.error("लॉगिन में समस्या हुई।");
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCF8] text-[#2D2D2D] font-sans selection:bg-green-100">
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-green-100 px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-green-600 p-2 rounded-xl shadow-lg shadow-green-200">
              <Leaf className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-green-900">ताज़ी सब्जी स्टोर</h1>
              <p className="text-[10px] uppercase tracking-widest text-green-600 font-semibold">Fresh & Organic</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {isAdmin ? (
              <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">Admin Mode</Badge>
            ) : (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowAdminLogin(true)}
                className="text-gray-500 hover:text-green-600"
              >
                <Lock className="w-4 h-4 mr-2" />
                एडमिन
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Veggie List */}
        <div className="lg:col-span-7 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-serif font-medium text-gray-900">ताज़ी सब्जियाँ</h2>
              <Badge variant="outline" className="border-green-200 text-green-700">
                {VEGGIES.filter(v => v.available).length} उपलब्ध
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {VEGGIES.map((v) => (
                <Card key={v.id} className={`overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-300 ${!v.available ? 'opacity-60 grayscale' : 'bg-white'}`}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center text-green-600 font-bold text-lg">
                        {v.name[0]}
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{v.name}</h3>
                        <p className="text-sm text-green-600 font-semibold">₹{v.price}/kg</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {!v.available ? (
                        <Badge variant="destructive" className="text-[10px]">स्टॉक में नहीं</Badge>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-100">
                            <Input 
                              type="number" 
                              className="w-16 h-8 border-none bg-transparent text-center focus-visible:ring-0"
                              placeholder="0"
                              value={cart[v.id]?.qty || ''}
                              onChange={(e) => handleAddToCart(v.id, parseFloat(e.target.value) || 0, cart[v.id]?.unit || 'kg')}
                            />
                            <Select 
                              value={cart[v.id]?.unit || 'kg'} 
                              onValueChange={(val: 'kg' | 'g') => handleAddToCart(v.id, cart[v.id]?.qty || 0, val)}
                            >
                              <SelectTrigger className="w-16 h-8 border-none bg-transparent focus:ring-0 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="kg">kg</SelectItem>
                                <SelectItem value="g">g</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Cart & Checkout */}
        <div className="lg:col-span-5 space-y-6">
          <ErrorBoundary>
            <Card className="border-none shadow-xl shadow-green-900/5 bg-white sticky top-24">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-green-600" />
                    आपका कार्ट
                  </CardTitle>
                  <Badge className="bg-green-600">₹{total.toFixed(2)}</Badge>
                </div>
                <CardDescription>न्यूनतम ऑर्डर ₹300 होना चाहिए</CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6">
                {/* Cart Items Summary */}
                <ScrollArea className="h-auto max-h-[200px] pr-4">
                  {Object.keys(cart).length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p>कार्ट खाली है</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(cart).map(([id, item]) => {
                        const veggie = VEGGIES.find(v => v.id === id);
                        if (!veggie) return null;
                        const cartItem = item as { qty: number, unit: 'kg' | 'g' };
                        const qtyInKg = cartItem.unit === 'kg' ? cartItem.qty : cartItem.qty / 1000;
                        return (
                          <div key={id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{veggie.name} ({cartItem.qty}{cartItem.unit})</span>
                            <span className="font-medium">₹{(qtyInKg * veggie.price).toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>

                <Separator className="bg-gray-100" />

                {/* Customer Info */}
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name" className="text-xs uppercase tracking-wider text-gray-500 font-bold">नाम</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input 
                        id="name" 
                        placeholder="आपका नाम" 
                        className="pl-10 bg-gray-50 border-gray-100 focus:bg-white transition-all"
                        value={customer.name}
                        onChange={(e) => setCustomer(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="mobile" className="text-xs uppercase tracking-wider text-gray-500 font-bold">मोबाइल</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input 
                        id="mobile" 
                        placeholder="10 अंकों का नंबर" 
                        className="pl-10 bg-gray-50 border-gray-100 focus:bg-white transition-all"
                        value={customer.mobile}
                        onChange={(e) => setCustomer(prev => ({ ...prev, mobile: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="address" className="text-xs uppercase tracking-wider text-gray-500 font-bold">पता</Label>
                    <div className="relative">
                      <Home className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <textarea 
                        id="address" 
                        placeholder="पूरा पता" 
                        className="w-full min-h-[80px] pl-10 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-md text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all"
                        value={customer.address}
                        onChange={(e) => setCustomer(prev => ({ ...prev, address: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Location Check */}
                <div className="bg-green-50/50 p-4 rounded-xl border border-green-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-green-800 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      डिलीवरी लोकेशन
                    </span>
                    <Button variant="ghost" size="sm" onClick={checkLocation} className="h-7 text-[10px] uppercase font-bold text-green-700 hover:bg-green-100">
                      चेक करें
                    </Button>
                  </div>
                  {distance !== null ? (
                    <p className={`text-xs ${distance > 40 ? 'text-red-600' : 'text-green-600'} font-medium`}>
                      दूरी: {distance.toFixed(2)} KM {distance > 40 ? '(डिलीवरी संभव नहीं)' : '(डिलीवरी संभव)'}
                    </p>
                  ) : (
                    <p className="text-[10px] text-gray-400 italic">लोकेशन चेक करने के लिए बटन दबाएं</p>
                  )}
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3">
                <Button 
                  className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 h-12 text-lg font-bold"
                  onClick={placeOrder}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "ऑर्डर हो रहा है..." : "ऑर्डर करें"}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full border-green-200 text-green-700 hover:bg-green-50 h-12"
                  onClick={sendWhatsApp}
                >
                  <MessageCircle className="w-5 h-5 mr-2" />
                  WhatsApp पर भेजें
                </Button>
              </CardFooter>
            </Card>
          </ErrorBoundary>
        </div>
      </main>

      {/* Admin Panel (Conditional) */}
      <AnimatePresence>
        {isAdmin && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white border-t border-gray-200 shadow-2xl"
          >
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <PackageCheck className="text-green-600" />
                  एडमिन पैनल - ऑर्डर लिस्ट
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setIsAdmin(false)}>
                  <LogOut className="w-4 h-4 mr-2" />
                  लॉगआउट
                </Button>
              </div>
              
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>समय</TableHead>
                      <TableHead>ग्राहक</TableHead>
                      <TableHead>आइटम्स</TableHead>
                      <TableHead>कुल</TableHead>
                      <TableHead>स्टेटस</TableHead>
                      <TableHead>एक्शन</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-400">कोई ऑर्डर नहीं मिला</TableCell>
                      </TableRow>
                    ) : (
                      orders.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="text-xs text-gray-500">
                            {o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString('hi-IN') : 'अभी'}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{o.customerName}</div>
                            <div className="text-xs text-gray-500">{o.mobile}</div>
                            <div className="text-[10px] text-gray-400 truncate max-w-[150px]">{o.address}</div>
                          </TableCell>
                          <TableCell className="text-xs whitespace-pre-line">{o.items}</TableCell>
                          <TableCell className="font-bold">₹{o.total.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge className={
                              o.status === 'pending' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                              o.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
                              'bg-red-100 text-red-700 border-red-200'
                            }>
                              {o.status === 'pending' ? 'पेंडिंग' : o.status === 'completed' ? 'पूरा' : 'रद्द'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 px-2 text-green-600 border-green-200"
                                onClick={() => updateOrderStatus(o.id!, 'completed')}
                                disabled={o.status !== 'pending'}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 px-2 text-red-600 border-red-200"
                                onClick={() => updateOrderStatus(o.id!, 'cancelled')}
                                disabled={o.status !== 'pending'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 px-2 text-blue-600 border-blue-200"
                                onClick={() => {
                                  const msg = `*ऑर्डर अपडेट:*\n\n${o.items}\n\n*कुल:* ₹${o.total.toFixed(2)}\n*स्टेटस:* ${o.status}\n*ग्राहक:* ${o.customerName}`;
                                  window.open(`https://wa.me/${o.mobile}?text=${encodeURIComponent(msg)}`);
                                }}
                              >
                                <MessageCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Login Dialog */}
      <Dialog open={showAdminLogin} onOpenChange={setShowAdminLogin}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>एडमिन लॉगिन</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="code">एडमिन कोड डालें</Label>
              <Input 
                id="code" 
                type="password" 
                placeholder="****" 
                value={adminCodeInput}
                onChange={(e) => setAdminCodeInput(e.target.value)}
              />
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">या</span>
              </div>
            </div>
            <Button variant="outline" onClick={loginWithGoogle} className="w-full">
              Google के साथ लॉगिन करें
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={handleAdminLogin} className="bg-green-600 hover:bg-green-700">लॉगिन</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-12 px-4 mt-12">
        <div className="max-w-6xl mx-auto text-center space-y-4">
          <div className="flex items-center justify-center gap-2 opacity-50">
            <Leaf className="w-5 h-5 text-green-600" />
            <span className="font-bold tracking-tight">ताज़ी सब्जी स्टोर</span>
          </div>
          <p className="text-sm text-gray-400">© 2026 ताज़ी सब्जी स्टोर। सभी अधिकार सुरक्षित।</p>
          <div className="flex items-center justify-center gap-6 text-xs text-gray-500 font-medium uppercase tracking-widest">
            <span>Organic</span>
            <span>•</span>
            <span>Fresh</span>
            <span>•</span>
            <span>Local</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

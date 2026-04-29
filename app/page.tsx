"use client";
import React, { useState, useEffect, useRef } from "react";
import dynamic from 'next/dynamic';
import { collection, onSnapshot, query, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useRouter } from 'next/navigation';
import {
  MapPin, Bike, ShoppingBag, Plus, Minus, X,
  ChevronRight, Clock, Star, Navigation, 
  Loader2, Lock, Store, Search, Flame, Copy, AlertTriangle, Crosshair, CheckCircle
} from "lucide-react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";

// ─── DYNAMIC MAP IMPORTS ────────────────────────────────────────────────────
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });

// ─── Types & Constants ───────────────────────────────────────────────────────
// 🚀 NEW: Added inStock to the MenuItem interface
interface MenuItem { id: string; name: string; price: number; category: string; image_url?: string; description?: string; inStock?: boolean; }
interface CartItem extends MenuItem { qty: number; }
interface UserLocation { lat: number; lng: number; address: string; }

const CATEGORIES = ["All", "Bundles", "Burgers", "Sides", "Drinks"];
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "burnt";
const TODAY = new Date().getDay();
const IS_SATURDAY = TODAY === 6;

const BRANCHES = {
  malate: { id: "malate", name: "Malate Branch", address: "909 Captain Ticong St., Malate", coords: { lat: 14.5683, lng: 120.9934 } },
  salcedo: { id: "salcedo", name: "Salcedo Saturday Market", address: "Salcedo Village, Makati", coords: { lat: 14.5605, lng: 121.0226 } }
};

export default function Home() {
  const router = useRouter();
  
  // Theme & Order State
  const [isRedMode, setIsRedMode] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [justOrdered, setJustOrdered] = useState(false);

  // App States
  const [activeBranchId, setActiveBranchId] = useState<"malate" | "salcedo">("malate");
  const [orderType, setOrderType] = useState("Delivery");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");

  // Location UI State
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showMapConfirm, setShowMapConfirm] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  
  // Admin State
  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  
  // Map Search & Drag State
  const [isMapReady, setIsMapReady] = useState(false); 
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [mapCoords, setMapCoords] = useState<[number, number]>([14.5683, 120.9934]);
  const [flyToCoords, setFlyToCoords] = useState<[number, number] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [leafletMap, setLeafletMap] = useState<any>(null); 
  
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Lalamove State
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [isQuoting, setIsQuoting] = useState(false);
  const [quotationId, setQuotationId] = useState<string | null>(null);

  // Checkout & Payment State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"gcash" | "cash">("gcash");
  const [gcashRef, setGcashRef] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const savedLoc = localStorage.getItem("burnt_diner_location");
    const savedOrder = localStorage.getItem("burnt_diner_last_order");
    
    if (savedOrder) setLastOrderId(savedOrder);

    if (savedLoc) {
      const parsed = JSON.parse(savedLoc);
      setUserLocation(parsed);
      setMapCoords([parsed.lat, parsed.lng]);
      setSearchQuery(parsed.address);
    } else {
      setTimeout(() => setShowLocationModal(true), 800);
    }

    const unsubscribe = onSnapshot(query(collection(db, "menu_items")), (snap) => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem)));
    });
    return () => unsubscribe();
  }, []);

  const handleAdminLogin = () => {
    if (adminPasswordInput === ADMIN_PASSWORD) {
      router.push('/admin');
    } else {
      alert("Incorrect password");
    }
  };

  useEffect(() => {
    if (leafletMap && flyToCoords) {
      try { leafletMap.flyTo(flyToCoords, 17, { animate: true, duration: 0.8 }); } 
      catch (e) { console.error("Map flyTo error safely caught"); }
      setFlyToCoords(null);
    }
  }, [leafletMap, flyToCoords]);

  useEffect(() => {
    if (!leafletMap) return;

    setTimeout(() => {
      try { if (leafletMap) leafletMap.invalidateSize(); } 
      catch (e) { console.warn("Map not fully rendered yet, skipping resize."); }
    }, 300);

    const handleDragEnd = async () => {
      try {
        const center = leafletMap.getCenter();
        setMapCoords([center.lat, center.lng]);
        setIsSearching(true);
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${center.lat}&lon=${center.lng}`);
        const data = await res.json();
        setSearchQuery(data.display_name || "");
      } catch (e) { console.error(e); } 
      finally { setIsSearching(false); }
    };

    leafletMap.on('dragend', handleDragEnd);
    return () => { leafletMap.off('dragend', handleDragEnd); };
  }, [leafletMap]);


  const handleTrackOrderClick = () => {
    if (lastOrderId) {
      router.push(`/track/${lastOrderId}`);
    } else {
      const id = prompt("Please enter your Order ID:");
      if (id && id.trim() !== "") router.push(`/track/${id.trim()}`);
    }
  };

  const processCheckout = async (method: "gcash" | "cash") => {
    if (!customerName.trim()) return alert("Please enter your Full Name.");
    const phoneRegex = /^09\d{9}$/;
    if (!phoneRegex.test(customerPhone.replace(/\s+/g, ''))) return alert("Please enter a valid 11-digit mobile number (e.g., 09171234567).");
    if (method === "gcash") {
      const refRegex = /^\d{6}$/;
      if (!refRegex.test(gcashRef)) return alert("Please enter exactly the LAST 6 DIGITS of your GCash Reference.");
    }

    setIsSubmitting(true);

    try {
      const orderData = {
        items: cart,
        subtotal,
        deliveryFee: orderType === "Delivery" ? deliveryFee : 0,
        total: subtotal + (orderType === "Delivery" ? deliveryFee : 0),
        orderType,
        branchId: activeBranchId,
        customerLocation: userLocation,
        lalamoveQuotationId: quotationId,
        customerName,
        customerPhone,
        paymentMethod: method,
        paymentRef: method === "gcash" ? gcashRef : "CASH",
        status: "pending", 
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "orders"), orderData);
      
      localStorage.setItem("burnt_diner_last_order", docRef.id);
      setLastOrderId(docRef.id);
      
      setCart([]);
      setShowCheckoutModal(false);
      setIsSubmitting(false);
      setJustOrdered(true); 

    } catch (error) {
      console.error("Checkout failed:", error);
      alert("Failed to place order. Please check your Firebase permissions.");
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (showMapConfirm) {
      const timer = setTimeout(() => setIsMapReady(true), 150);
      return () => clearTimeout(timer);
    } else {
      setIsMapReady(false);
    }
  }, [showMapConfirm]);

  const handleGPS = () => {
    if (!navigator.geolocation) return alert("GPS not supported.");
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setMapCoords([latitude, longitude]);
        setFlyToCoords([latitude, longitude]);
        setShowLocationModal(false);
        setShowMapConfirm(true);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          setSearchQuery(data.display_name);
        } catch (e) { console.error(e); }
        setLocationLoading(false);
      }, 
      (error) => {
        setLocationLoading(false);
        alert(`GPS Failed. Please type manually.`);
      }, { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSearch = (val: string) => {
    setSearchQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (val.length < 2) return setSuggestions([]);
    
    setIsSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&countrycodes=ph&limit=5`);
        let data = await res.json();
        const lowerVal = val.toLowerCase();
        if (lowerVal.startsWith("wh") || lowerVal.includes("taft")) {
            data.unshift({ display_name: "W.H. Taft Residences, Taft Avenue, Malate, Manila", lat: "14.5648", lon: "120.9942" });
        }
        setSuggestions(Array.isArray(data) ? data : []);
      } catch (e) { console.error("Search failed:", e); } 
      finally { setIsSearching(false); }
    }, 600);
  };

  const selectSuggestion = (s: any) => {
    const lat = parseFloat(s.lat);
    const lon = parseFloat(s.lon);
    setMapCoords([lat, lon]);
    setFlyToCoords([lat, lon]); 
    setSearchQuery(s.display_name);
    setSuggestions([]);
  };

  const confirmLocation = () => {
    const loc = { lat: mapCoords[0], lng: mapCoords[1], address: searchQuery };
    setUserLocation(loc);
    localStorage.setItem("burnt_diner_location", JSON.stringify(loc));
    setShowMapConfirm(false);
    setQuotationId(null); 
  };

  const fetchLalamoveQuote = async () => {
    if (!userLocation) return;
    setIsQuoting(true);
    const origin = BRANCHES[activeBranchId];
    try {
      const res = await fetch('/api/lalamove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stops: [
            { lat: parseFloat(origin.coords.lat.toString()), lng: parseFloat(origin.coords.lng.toString()), address: origin.address },
            { lat: userLocation.lat, lng: userLocation.lng, address: userLocation.address },
          ],
        }),
      });
      const data = await res.json();
      if (data?.data?.priceBreakdown?.total) {
        setDeliveryFee(parseFloat(data.data.priceBreakdown.total));
        setQuotationId(data.data.quotationId);
      } else throw new Error('Invalid quote');
    } catch (e) {
      let fallbackFee = 149;
      if (searchQuery.toLowerCase().includes("santa rosa")) fallbackFee = 750;
      else if (userLocation.lat !== 0) fallbackFee = 49 + Math.round(Math.random() * 100 + 50);
      setDeliveryFee(fallbackFee);
      setQuotationId(`DEMO-${Math.floor(Math.random() * 9999)}`);
    } finally { setIsQuoting(false); }
  };

  const addToCart = (item: MenuItem) => { 
    setJustOrdered(false); 
    setCart(prev => { const ex = prev.find(c => c.id === item.id); return ex ? prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c) : [...prev, { ...item, qty: 1 }]; }); 
  };
  const removeFromCart = (item: MenuItem) => { setCart(prev => { const ex = prev.find(c => c.id === item.id); if (!ex) return prev; return ex.qty === 1 ? prev.filter(c => c.id !== item.id) : prev.map(c => c.id === item.id ? { ...c, qty: c.qty - 1 } : c); }); };

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal + (orderType === "Delivery" ? deliveryFee : 0);
  const filtered = menuItems.filter(i => activeCategory === "All" || i.category?.toLowerCase() === activeCategory.toLowerCase());

  // 🎨 THEME CLASSES
  const themeBg = isRedMode ? "bg-[#B71C1C]" : "bg-white";
  const themeTextMain = isRedMode ? "text-white" : "text-gray-900";
  const themeTextMuted = isRedMode ? "text-red-200" : "text-gray-500";
  const themeBorder = isRedMode ? "border-red-900" : "border-gray-200";
  const themeCardBg = isRedMode ? "bg-red-950/50" : "bg-white";

  return (
    <div className={`flex flex-col md:flex-row h-screen font-sans overflow-hidden transition-colors duration-500 ${themeBg}`}>
      
      {/* ─── NEW DARK CHECKOUT MODAL ─── */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-black/80 z-[600] flex items-center justify-center p-0 md:p-6 backdrop-blur-sm">
          <div className="bg-[#1A1A1A] w-full max-w-lg h-full md:h-auto md:max-h-[90vh] md:rounded-3xl overflow-y-auto shadow-2xl flex flex-col custom-scrollbar text-white relative">
            
            <div className="sticky top-0 bg-[#1A1A1A]/95 backdrop-blur-md z-10 p-6 flex justify-between items-center border-b border-white/10">
              <div>
                <h2 className="text-2xl font-black italic uppercase tracking-wider">Checkout</h2>
                <p className="text-sm text-gray-400">Confirm details to order</p>
              </div>
              <button onClick={() => setShowCheckoutModal(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"><X size={20} className="text-gray-300"/></button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center pb-6 border-b border-white/10">
                <span className="text-lg font-bold uppercase tracking-widest text-gray-300">Total Due Now</span>
                <span className="text-4xl font-black text-[#B71C1C]">₱{total.toFixed(2)}</span>
              </div>

              {orderType === "Delivery" && (
                <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Delivery Address</h3>
                    <button onClick={() => {setShowCheckoutModal(false); setShowMapConfirm(true);}} className="text-[#B71C1C] text-xs font-bold uppercase tracking-wider hover:text-red-400">Edit Map</button>
                  </div>
                  <div className="flex gap-3 items-start">
                    <MapPin size={18} className="text-[#B71C1C] shrink-0 mt-0.5" />
                    <p className="text-sm font-medium text-gray-200 leading-snug">{userLocation?.address}</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <input 
                  type="text" placeholder="Full Name" value={customerName} onChange={e => setCustomerName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white outline-none focus:border-[#B71C1C] focus:ring-1 focus:ring-[#B71C1C] transition-all"
                />
                <input 
                  type="tel" maxLength={11} placeholder="Mobile Number (e.g., 09171234567)" 
                  value={customerPhone} 
                  onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, ''))} 
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white outline-none focus:border-[#B71C1C] focus:ring-1 focus:ring-[#B71C1C] transition-all"
                />
              </div>

              <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                <div className="flex border-b border-white/10">
                  <button onClick={() => setPaymentMethod("gcash")} className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${paymentMethod === "gcash" ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>GCash</button>
                  <button onClick={() => setPaymentMethod("cash")} className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors border-l border-white/10 ${paymentMethod === "cash" ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>Cash</button>
                </div>
                
                {paymentMethod === "gcash" && (
                  <div className="p-5 flex flex-col items-center">
                    <div className="w-48 h-48 bg-white rounded-xl mb-4 p-2 flex items-center justify-center">
                       <img src="https://upload.wikimedia.org/wikipedia/commons/d/d0/QR_code_for_mobile_English_Wikipedia.svg" alt="GCash QR" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex items-center gap-3 bg-white/10 rounded-full px-4 py-2 mb-4 cursor-pointer hover:bg-white/20 transition-colors" onClick={() => alert("Copied 09171234567")}>
                      <span className="text-gray-400 text-xs uppercase font-bold">Copy Number</span>
                      <span className="font-black tracking-widest">0917 123 4567</span>
                      <Copy size={14} className="text-gray-400"/>
                    </div>
                    <input 
                      type="text" maxLength={6} placeholder="GCash Ref No. (LAST 6 DIGITS)" 
                      value={gcashRef} 
                      onChange={e => setGcashRef(e.target.value.replace(/\D/g, ''))} 
                      className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-4 text-center font-black tracking-widest text-white outline-none focus:border-[#B71C1C]"
                    />
                  </div>
                )}
                {paymentMethod === "cash" && (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    Please prepare exact amount if possible. <br/>Lalamove rider will collect payment upon arrival.
                  </div>
                )}
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-xs text-gray-400 h-32 overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-2 text-yellow-500 font-bold uppercase mb-2 tracking-widest">
                  <AlertTriangle size={14}/> Ordering Policy
                </div>
                <ul className="space-y-2 pl-4 list-disc marker:text-gray-600">
                  <li><strong className="text-gray-300">Preparation:</strong> Orders are prepared immediately upon confirmation.</li>
                  <li><strong className="text-gray-300">Lalamove:</strong> Delivery fee is estimated. Rider handles actual collection unless GCash is selected.</li>
                  <li><strong className="text-gray-300">No Cancellations:</strong> Once the kitchen begins preparation, orders cannot be cancelled.</li>
                </ul>
              </div>

            </div>

            <div className="p-6 pt-0 flex gap-3 mt-auto">
              <button 
                onClick={() => processCheckout(paymentMethod)}
                disabled={isSubmitting}
                className="flex-1 py-5 bg-[#B71C1C] hover:bg-red-800 text-white rounded-xl font-black text-sm md:text-base uppercase tracking-widest transition-colors shadow-xl shadow-red-900/20 disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isSubmitting ? <><Loader2 size={18} className="animate-spin"/> Processing...</> : (paymentMethod === "gcash" ? "Confirm GCash Payment" : "Confirm Cash Order")}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ─── LOCATION MODALS ─── */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/70 z-[300] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl p-8 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
            <h2 className="text-2xl font-black text-gray-900 italic uppercase mb-2 text-center">Delivery Location</h2>
            <p className="text-sm text-gray-500 mb-8 text-center leading-relaxed">Help us find you for a smooth Lalamove delivery.</p>
            <button onClick={handleGPS} disabled={locationLoading} className="w-full py-4 bg-[#B71C1C] text-white rounded-xl font-black text-sm mb-3 flex items-center justify-center gap-2 hover:bg-red-800 transition-colors disabled:opacity-60">
              {locationLoading ? <><Loader2 size={18} className="animate-spin" /> Locating...</> : <><Navigation size={18} /> Use My GPS</>}
            </button>
            <button onClick={() => {setShowLocationModal(false); setShowMapConfirm(true);}} className="w-full py-4 text-gray-700 font-bold text-sm bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
              Type address manually
            </button>
          </div>
        </div>
      )}

      {showMapConfirm && (
        <div className="fixed inset-0 bg-black/70 z-[400] flex items-center justify-center p-0 md:p-6 backdrop-blur-md">
          <div className="bg-white w-full max-w-2xl flex flex-col h-full md:h-auto max-h-full md:rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white z-10 shrink-0">
              <h2 className="font-black italic uppercase text-gray-900">Confirm Pin Location</h2>
              <button onClick={() => setShowMapConfirm(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"><X size={18}/></button>
            </div>
            
            <div className="p-4 relative z-[500] bg-white shrink-0">
              <div className="relative">
                {isSearching ? <Loader2 className="absolute left-4 top-3.5 text-gray-400 animate-spin" size={20} /> : <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />}
                <input 
                  type="text" value={searchQuery} onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search Building, Street, or Area..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-[#B71C1C] text-gray-900 placeholder:text-gray-400 font-medium shadow-inner"
                />
              </div>
              
              {suggestions.length > 0 && (
                <div className="absolute top-full left-4 right-4 bg-white border border-gray-100 shadow-2xl rounded-b-xl overflow-hidden mt-2 z-[600]">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => selectSuggestion(s)} className="w-full text-left p-4 hover:bg-gray-50 border-b border-gray-100 flex items-start gap-3 transition-colors">
                      <MapPin size={16} className="text-[#B71C1C] mt-1 shrink-0" />
                      <span className="text-sm font-bold text-gray-900 line-clamp-2">{s.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="w-full h-[400px] md:h-[500px] relative bg-gray-200 z-0 shrink-0">
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[450] bg-gray-900/80 backdrop-blur-sm text-white px-5 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-widest uppercase pointer-events-none shadow-lg whitespace-nowrap">
                Drag Map to Exact Spot
              </div>

              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-[450] pointer-events-none pb-2">
                 <div className="relative flex flex-col items-center animate-bounce">
                    <MapPin size={46} className="text-[#B71C1C] drop-shadow-xl" fill="#B71C1C" stroke="white" strokeWidth={1.5} />
                    <div className="w-2 h-1.5 bg-black/30 rounded-full blur-[2px] absolute -bottom-1"></div>
                 </div>
              </div>

              {isMapReady ? (
                <MapContainer center={mapCoords} zoom={17} style={{ height: '100%', width: '100%', zIndex: 0 }} zoomControl={false} ref={setLeafletMap}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                </MapContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-3">
                  <Loader2 className="animate-spin" size={32} />
                  <p className="text-xs font-bold uppercase tracking-widest">Loading Map Engine...</p>
                </div>
              )}

              <div className="absolute bottom-6 left-6 right-6 z-[450]">
                <button onClick={confirmLocation} disabled={isSearching || !searchQuery || !isMapReady} className="w-full py-4 bg-[#B71C1C] text-white rounded-xl font-black uppercase tracking-widest shadow-xl shadow-red-900/40 hover:bg-red-800 active:scale-95 transition-all disabled:opacity-50">
                  Confirm Pin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADMIN AUTH MODAL ─── */}
      {showAdminAuth && (
         <div className="fixed inset-0 bg-black/70 z-[600] flex items-center justify-center p-4 backdrop-blur-sm">
           <div className="bg-[#1A1A1A] w-full max-w-sm rounded-3xl p-8 shadow-2xl border border-white/10 text-white">
             <div className="flex justify-between items-center mb-6">
               <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                 <Lock size={24} className="text-[#B71C1C]" />
               </div>
               <button onClick={() => setShowAdminAuth(false)} className="p-2 text-gray-500 hover:bg-white/10 rounded-full transition-colors"><X size={18} /></button>
             </div>
             <h2 className="text-2xl font-black italic uppercase mb-2 tracking-wider">Kitchen Grill</h2>
             <p className="text-sm text-gray-400 mb-6 tracking-wide">Enter access code</p>
             <input 
               type="password" 
               placeholder="Password" 
               value={adminPasswordInput}
               onChange={(e) => setAdminPasswordInput(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
               className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-4 text-center font-black tracking-[0.2em] outline-none mb-4 focus:border-[#B71C1C] transition-colors" 
               autoFocus 
             />
             <button onClick={handleAdminLogin} className="w-full py-4 bg-[#B71C1C] hover:bg-red-800 text-white rounded-xl font-black uppercase tracking-widest transition-colors shadow-lg shadow-red-900/20">
               Access Dashboard
             </button>
           </div>
         </div>
      )}

      {/* ─── MAIN CONTENT ─── */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto relative no-scrollbar">
        
        <header className={`sticky top-0 z-40 backdrop-blur-md border-b px-4 py-3 md:px-8 md:py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between shadow-sm transition-colors ${isRedMode ? 'bg-[#B71C1C]/95 border-red-900' : 'bg-white/95 border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <Link href="/">
              <h1 className={`text-2xl md:text-3xl font-black tracking-tighter italic leading-none hover:opacity-80 transition-opacity ${isRedMode ? 'text-white' : 'text-[#B71C1C]'}`}>
                BURNT DINER
              </h1>
            </Link>
            
            <div className="flex items-center gap-2 md:hidden">
              <button onClick={() => setShowAdminAuth(true)} className={`p-2 rounded-full border transition-colors ${isRedMode ? 'bg-red-900 border-red-800 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'}`}>
                <Lock size={18} />
              </button>
              <button onClick={handleTrackOrderClick} className={`p-2 rounded-full border transition-colors ${isRedMode ? 'bg-red-900 border-red-800 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'}`}>
                <Crosshair size={18} />
              </button>
              <button onClick={() => setIsRedMode(!isRedMode)} className={`p-2 rounded-full border transition-colors ${isRedMode ? 'bg-red-900 border-red-800 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'}`}>
                <Flame size={18} />
              </button>
              <button onClick={() => setIsCartOpen(true)} className={`relative p-2 rounded-full border transition-colors ${isRedMode ? 'bg-red-900 border-red-800' : 'bg-gray-50 border-gray-200'}`}>
                <ShoppingBag size={20} className={isRedMode ? 'text-white' : 'text-gray-800'} />
                {cartCount > 0 && <span className={`absolute -top-1 -right-1 w-5 h-5 text-[10px] font-black rounded-full flex items-center justify-center shadow-md ${isRedMode ? 'bg-white text-[#B71C1C]' : 'bg-[#B71C1C] text-white'}`}>{cartCount}</span>}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            
            <button onClick={() => setShowAdminAuth(true)} className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold uppercase transition-colors ${isRedMode ? 'bg-red-900 border-red-800 text-white hover:bg-red-950' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
              <Lock size={14} /> Admin
            </button>

            <button onClick={handleTrackOrderClick} className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold uppercase transition-colors ${isRedMode ? 'bg-red-900 border-red-800 text-white hover:bg-red-950' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
              <Crosshair size={14} /> Track Order
            </button>

            <button onClick={() => setIsRedMode(!isRedMode)} className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold uppercase transition-colors ${isRedMode ? 'bg-red-900 border-red-800 text-white hover:bg-red-950' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
              <Flame size={14} /> {isRedMode ? "Red Mode" : "Light Mode"}
            </button>

            <div className={`flex items-center gap-1.5 border rounded-xl p-1.5 pl-2 shrink-0 ${isRedMode ? 'bg-red-900 border-red-800 text-white' : 'bg-gray-50 border-gray-200'}`}>
              <Store size={14} className={isRedMode ? "text-red-200" : "text-gray-500"} />
              <select value={activeBranchId} onChange={(e) => setActiveBranchId(e.target.value as any)} className="bg-transparent text-[10px] md:text-xs font-bold outline-none cursor-pointer uppercase tracking-wider pr-1">
                <option value="malate" className="text-gray-900">Malate (Mon-Sat)</option>
                {IS_SATURDAY && <option value="salcedo" className="text-gray-900">Salcedo (Sat Only)</option>}
              </select>
            </div>
            <button onClick={() => { setFlyToCoords(mapCoords); setShowMapConfirm(true); }} className={`flex items-center flex-1 gap-2 border rounded-xl px-2.5 py-1.5 transition-colors text-left min-w-0 max-w-xs ${isRedMode ? 'bg-red-900 border-red-800 hover:bg-red-950' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
              <Navigation size={14} className={isRedMode ? "text-white shrink-0" : "text-[#B71C1C] shrink-0"} />
              <div className="min-w-0">
                <p className={`text-[8px] md:text-[9px] font-bold uppercase tracking-wider leading-none ${themeTextMuted}`}>Delivering to</p>
                <p className={`text-[10px] md:text-xs font-bold leading-tight truncate mt-0.5 ${themeTextMain}`}>{userLocation ? userLocation.address : "Set location"}</p>
              </div>
            </button>
          </div>
        </header>

        <div className={`px-5 md:px-12 py-8 md:py-16 flex flex-col-reverse md:flex-row items-center justify-between border-b gap-6 md:gap-8 transition-colors ${isRedMode ? 'bg-[#A01818] border-red-900' : 'bg-gradient-to-b from-white to-gray-50/50 border-gray-100'}`}>
          <div className="flex-1 w-full flex flex-col items-center md:items-start text-center md:text-left">
            <h2 className={`text-4xl md:text-7xl font-black uppercase italic tracking-tighter leading-tight md:leading-none mb-6 ${themeTextMain}`}>
              The Good Sh*t.<br className="hidden md:block"/>
              <span className={isRedMode ? "text-red-200" : "text-[#B71C1C]"}>Seriously.</span>
            </h2>
            <div className={`flex w-full rounded-2xl p-1.5 max-w-sm border shadow-inner ${isRedMode ? 'bg-red-900/50 border-red-800' : 'bg-gray-200/50 border-gray-200'}`}>
              {["Delivery", "Pick-up"].map((type) => (
                <button key={type} onClick={() => setOrderType(type)} className={`flex-1 py-3 rounded-xl text-xs md:text-sm font-bold transition-all ${orderType === type ? (isRedMode ? 'bg-white text-[#B71C1C] shadow-md' : 'bg-white text-gray-900 shadow-sm border border-gray-200') : (isRedMode ? 'text-red-200 hover:text-white' : 'text-gray-500 hover:text-gray-900')}`}>
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div className={`w-40 h-40 md:w-80 md:h-80 shrink-0 shadow-2xl rounded-full overflow-hidden border-[8px] md:border-[12px] md:rotate-3 transition-colors ${isRedMode ? 'border-red-900' : 'border-white'}`}>
            <img src={isRedMode ? "/burnt-alt.jpg" : "/burnt.jpg"} alt="Burnt Diner" className="w-full h-full object-cover" />
          </div>
        </div>

        {!IS_SATURDAY && (
           <div className="px-5 md:px-12 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2.5">
             <Store size={14} className="text-gray-400 shrink-0" />
             <p className="text-[10px] md:text-xs text-gray-500 font-medium leading-tight">Looking for the Salcedo Branch? We are at the Salcedo Saturday Market every Sat 7am-2pm.</p>
           </div>
        )}

        <div className={`px-5 md:px-12 py-6 pb-32 transition-colors ${isRedMode ? 'bg-[#B71C1C]' : 'bg-gray-50/30'}`}>
          <div className={`flex gap-2 overflow-x-auto mb-10 no-scrollbar sticky top-[95px] md:top-[80px] z-30 backdrop-blur-md py-4 -mx-5 px-5 md:-mx-12 md:px-12 border-b shadow-sm transition-colors ${isRedMode ? 'bg-[#B71C1C]/95 border-red-900' : 'bg-white/95 border-gray-100'}`}>
            {CATEGORIES.map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeCategory === cat ? (isRedMode ? 'bg-white text-[#B71C1C] shadow-lg' : 'bg-black text-white shadow-lg') : (isRedMode ? 'bg-red-900 text-red-200 hover:bg-red-800 hover:text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}`}>
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 md:gap-8">
            {filtered.map((item) => {
              // 🚀 NEW: Check if the item is out of stock
              const isOutOfStock = item.inStock === false;

              return (
                <div key={item.id} className={`rounded-3xl border overflow-hidden transition-all flex flex-col group shadow-sm ${isOutOfStock ? 'opacity-50 grayscale' : 'hover:shadow-2xl cursor-pointer'} ${themeCardBg} ${themeBorder}`}>
                  <div className="w-full aspect-square md:aspect-video overflow-hidden bg-gray-100">
                    <img src={item.image_url || "https://images.unsplash.com/photo-1568901346375-23c9450c58cd"} alt={item.name} className={`w-full h-full object-cover transition-transform duration-700 ${!isOutOfStock && 'group-hover:scale-105'}`} />
                  </div>
                  <div className="p-4 md:p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className={`font-black text-sm md:text-base uppercase italic leading-tight line-clamp-1 ${themeTextMain}`}>{item.name}</h3>
                      <p className={`text-[9px] md:text-[10px] mt-1 uppercase tracking-widest font-bold ${themeTextMuted}`}>{item.category}</p>
                      <p className={`hidden md:block text-sm mt-2 line-clamp-2 leading-snug ${themeTextMuted}`}>{item.description}</p>
                    </div>
                    <div className="flex items-center justify-between mt-4 md:mt-6">
                      
                      {/* 🚀 NEW: Change Price text if sold out */}
                      {isOutOfStock ? (
                        <span className="font-black text-lg md:text-xl text-gray-500 uppercase tracking-widest">Sold Out</span>
                      ) : (
                        <span className={`font-black text-lg md:text-2xl ${isRedMode ? 'text-white' : 'text-[#B71C1C]'}`}>₱{item.price}</span>
                      )}

                      {/* 🚀 NEW: Disable Add button if sold out */}
                      <button 
                        onClick={() => !isOutOfStock && addToCart(item)} 
                        disabled={isOutOfStock}
                        className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all shadow-sm ${isOutOfStock ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : isRedMode ? 'bg-white text-[#B71C1C] hover:bg-red-100' : 'bg-gray-100 text-gray-900 hover:bg-[#B71C1C] hover:text-white'}`}
                      >
                        <Plus size={20} />
                      </button>

                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── DOCKED CART (Desktop Only) ─── */}
      <div className={`hidden md:flex flex-col w-[420px] border-l shadow-[-10px_0_30px_rgba(0,0,0,0.02)] z-50 h-full shrink-0 transition-colors ${isRedMode ? 'bg-[#A01818] border-red-900' : 'bg-gray-50 border-gray-200'}`}>
        <div className={`p-8 border-b transition-colors ${isRedMode ? 'bg-[#B71C1C] border-red-900' : 'bg-white border-gray-200'}`}>
          <h2 className={`text-3xl font-black italic uppercase ${themeTextMain}`}>Your Order</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {justOrdered && lastOrderId ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
              <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mb-2">
                <CheckCircle size={48} className="text-green-500" />
              </div>
              <div>
                <h3 className={`text-2xl font-black italic uppercase tracking-widest ${themeTextMain}`}>Order Placed!</h3>
                <p className={`text-sm mt-2 font-bold ${themeTextMuted}`}>The kitchen has received your order.</p>
              </div>
              <div className="w-full space-y-3 mt-4">
                <button onClick={() => router.push(`/track/${lastOrderId}`)} className="w-full py-4 bg-[#B71C1C] text-white rounded-xl font-black uppercase tracking-widest shadow-xl shadow-red-900/20 hover:bg-red-800 transition-colors">
                  Track Order Live
                </button>
                <button onClick={() => setJustOrdered(false)} className={`w-full py-4 rounded-xl font-bold uppercase tracking-widest text-xs border transition-colors ${isRedMode ? 'bg-black/20 border-white/10 text-gray-300 hover:bg-white/10' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  Create New Order
                </button>
              </div>
            </div>
          ) : cart.length === 0 ? (
             <div className={`flex flex-col items-center justify-center h-full ${themeTextMuted}`}>
                <ShoppingBag size={48} className="mb-4 opacity-40" />
                <p className="font-medium text-sm">Your cart is empty.</p>
             </div>
          ) : (
            cart.map((item: any) => (
              <div key={item.id} className={`p-5 rounded-3xl border shadow-sm flex items-center gap-4 transition-all ${themeCardBg} ${themeBorder} ${isRedMode ? 'hover:border-red-400' : 'hover:border-[#B71C1C]/20'}`}>
                <img src={item.image_url || "https://images.unsplash.com/photo-1568901346375-23c9450c58cd"} alt={item.name} className="w-16 h-16 rounded-2xl object-cover bg-gray-100 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className={`font-black text-sm uppercase italic truncate ${themeTextMain}`}>{item.name}</p>
                  <p className={`font-bold text-xs mt-1 ${themeTextMuted}`}>₱{item.price}</p>
                </div>
                <div className={`flex items-center gap-3 rounded-2xl p-1 border shrink-0 ${isRedMode ? 'bg-red-900 border-red-800' : 'bg-gray-50 border-gray-200'}`}>
                  <button onClick={() => removeFromCart(item)} className={`p-1.5 rounded-xl transition-colors ${isRedMode ? 'text-white hover:bg-red-800' : 'text-gray-600 hover:bg-white'}`}><Minus size={14} /></button>
                  <span className={`font-black text-sm w-4 text-center ${themeTextMain}`}>{item.qty}</span>
                  <button onClick={() => addToCart(item)} className={`p-1.5 rounded-xl transition-colors ${isRedMode ? 'text-white hover:bg-red-800' : 'text-gray-600 hover:bg-white'}`}><Plus size={14} /></button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Hide checkout footer if they just ordered */}
        {!justOrdered && (
          <div className={`p-8 border-t space-y-6 shadow-[0_-10px_40px_rgba(0,0,0,0.02)] transition-colors ${isRedMode ? 'bg-[#B71C1C] border-red-900' : 'bg-white border-gray-200'}`}>
            {orderType === "Delivery" && cart.length > 0 && (
              <div className={`p-5 border rounded-2xl ${isRedMode ? 'bg-red-900/50 border-red-800' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex justify-between items-center mb-3">
                   <p className={`text-[10px] font-black uppercase tracking-widest ${themeTextMuted}`}>Lalamove Delivery</p>
                   <Navigation size={12} className={isRedMode ? "text-white" : "text-[#B71C1C]"} />
                </div>
                <p className={`text-xs font-bold line-clamp-1 mb-4 ${themeTextMain}`}>{userLocation?.address || "No location set"}</p>
                
                {!quotationId && userLocation && (
                   <button onClick={fetchLalamoveQuote} disabled={isQuoting} className={`w-full py-3 text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-colors rounded-xl disabled:opacity-50 ${isRedMode ? 'bg-white text-[#B71C1C] hover:bg-gray-100' : 'bg-black text-white hover:bg-gray-800'}`}>
                     {isQuoting ? <><Loader2 size={16} className="animate-spin" /> Calculating...</> : "Calculate Delivery"}
                   </button>
                )}

                {quotationId && (
                  <div className={`px-4 py-3 flex items-center gap-3 border rounded-xl ${isRedMode ? 'bg-white/10 border-white/20' : 'bg-green-50 border-green-200'}`}>
                    <Bike size={16} className={isRedMode ? "text-white" : "text-green-600 shrink-0"} />
                    <div>
                      <p className={`text-[10px] font-black uppercase tracking-widest ${isRedMode ? 'text-white' : 'text-green-700'}`}>Lalamove Active</p>
                      <p className={`text-[10px] font-bold mt-0.5 ${isRedMode ? 'text-red-200' : 'text-green-600'}`}>Rider dispatched when ready</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className={`flex justify-between text-sm font-medium ${themeTextMuted}`}>
                <span>Subtotal</span><span>₱{subtotal.toFixed(2)}</span>
              </div>
              {orderType === "Delivery" && (
                <div className={`flex justify-between text-sm font-medium ${themeTextMuted}`}>
                  <span>Delivery Fee</span><span>₱{deliveryFee.toFixed(2)}</span>
                </div>
              )}
              <div className={`flex justify-between items-end pt-4 border-t ${isRedMode ? 'border-red-900' : 'border-gray-100'}`}>
                <span className={`font-bold uppercase text-xs tracking-widest ${themeTextMuted}`}>Total Amount</span>
                <span className={`text-3xl font-black ${isRedMode ? 'text-white' : 'text-[#B71C1C]'}`}>₱{total.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={() => setShowCheckoutModal(true)}
              disabled={(orderType === "Delivery" && !userLocation) || cart.length === 0}
              className={`w-full py-6 rounded-2xl font-black text-base uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-2xl active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${isRedMode ? 'bg-white text-[#B71C1C] shadow-black/20 hover:bg-gray-100' : 'bg-[#B71C1C] text-white shadow-red-900/40 hover:bg-red-800'}`}
            >
              Checkout Now <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>

      {/* ─── MOBILE DRAWER (Hidden on Desktop) ─── */}
      {isCartOpen && (
        <div className="md:hidden fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="fixed inset-0 bg-black/60 transition-opacity backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
          <div className="relative bg-gray-50 rounded-t-[2rem] h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-white">
              <h2 className="text-xl font-black text-gray-900 italic uppercase">Your Order</h2>
              <button onClick={() => setIsCartOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4">
               {justOrdered && lastOrderId ? (
                 <div className="flex flex-col items-center justify-center h-full text-center space-y-6 pt-10">
                   <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-2">
                     <CheckCircle size={40} className="text-green-500" />
                   </div>
                   <div>
                     <h3 className="text-2xl font-black italic uppercase tracking-widest text-gray-900">Order Placed!</h3>
                     <p className="text-sm mt-2 font-bold text-gray-500">The kitchen has received your order.</p>
                   </div>
                   <div className="w-full space-y-3 mt-4">
                     <button onClick={() => router.push(`/track/${lastOrderId}`)} className="w-full py-4 bg-[#B71C1C] text-white rounded-xl font-black uppercase tracking-widest shadow-xl shadow-red-900/20 hover:bg-red-800">
                       Track Order Live
                     </button>
                     <button onClick={() => setJustOrdered(false)} className="w-full py-4 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold uppercase tracking-widest text-xs">
                       Create New Order
                     </button>
                   </div>
                 </div>
               ) : cart.length === 0 ? (
                 <p className="text-center text-gray-400 mt-10 font-medium">Cart is empty.</p>
               ) : (
                 cart.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                      <img src={item.image_url || "https://images.unsplash.com/photo-1568901346375-23c9450c58cd"} alt={item.name} className="w-16 h-16 rounded-xl object-cover bg-gray-50 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm uppercase italic truncate">{item.name}</p>
                        <p className="text-gray-500 text-xs font-bold mt-0.5">₱{(item.price * item.qty).toFixed(2)}</p>
                      </div>
                      <div className="flex flex-col items-center gap-1.5 bg-gray-50 rounded-xl px-1.5 py-1 border border-gray-200">
                        <button onClick={() => addToCart(item)} className="p-1"><Plus size={14} /></button>
                        <span className="font-black text-xs text-gray-900">{item.qty}</span>
                        <button onClick={() => removeFromCart(item)} className="p-1"><Minus size={14} /></button>
                      </div>
                    </div>
                 ))
               )}
            </div>

            {!justOrdered && (
              <div className="bg-white border-t border-gray-200 p-5 pb-8 space-y-4">
                 {orderType === "Delivery" && cart.length > 0 && (
                    <div className="mb-2">
                      {!quotationId && userLocation && (
                         <button onClick={fetchLalamoveQuote} disabled={isQuoting} className="w-full bg-black text-white rounded-xl px-4 py-3.5 text-xs font-black uppercase tracking-widest flex justify-center gap-2">
                           {isQuoting ? <><Loader2 size={14} className="animate-spin" /> Calculating...</> : "Calculate Delivery"}
                         </button>
                      )}
                      {quotationId && (
                        <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
                          <Bike size={14} className="text-green-600" />
                          <div>
                            <p className="text-[9px] font-black text-green-700 uppercase tracking-widest">Lalamove Active</p>
                            <p className="text-[10px] font-bold text-green-600">Rider dispatched when ready</p>
                          </div>
                        </div>
                      )}
                    </div>
                 )}
                 <div className="flex justify-between text-sm text-gray-500">
                   <span>Subtotal</span><span>₱{subtotal.toFixed(2)}</span>
                 </div>
                 {orderType === "Delivery" && (
                   <div className="flex justify-between text-sm text-gray-500">
                     <span>Delivery fee</span><span>₱{deliveryFee.toFixed(2)}</span>
                   </div>
                 )}
                 <div className="flex justify-between font-black text-xl text-gray-900 pt-3 border-t border-gray-100">
                   <span>Total</span><span className="text-[#B71C1C]">₱{total.toFixed(2)}</span>
                 </div>
                 <button 
                  onClick={() => { setIsCartOpen(false); setShowCheckoutModal(true); }} 
                  disabled={(orderType === "Delivery" && !userLocation) || cart.length === 0}
                  className="w-full py-4 mt-2 bg-[#B71C1C] text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-red-900/20 active:scale-95 transition-transform disabled:opacity-50"
                 >
                    Checkout
                 </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
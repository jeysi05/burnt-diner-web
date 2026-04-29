"use client";
import React, { useEffect, useState } from "react";
import dynamic from 'next/dynamic';
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase"; 
import { useParams } from "next/navigation";
import { CheckCircle, ChefHat, Bike, XCircle, Loader2, Clock, ArrowLeft, PhoneCall, Star, MapPin } from "lucide-react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";

// ─── DYNAMIC MAP IMPORTS ───
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });

export default function TrackingPage() {
  const params = useParams();
  const orderId = (params?.orderId || params?.id) as string;

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Custom Map Icons (loaded only on client side to prevent Next.js errors)
  const [mapIcons, setMapIcons] = useState<any>(null);

  useEffect(() => {
    // Dynamically load Leaflet for custom icons
    import('leaflet').then((L) => {
      const riderIcon = L.divIcon({
        className: 'bg-transparent',
        html: `<div style="background-color: #B71C1C; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); font-size: 18px;">🏍️</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      const homeIcon = L.divIcon({
        className: 'bg-transparent',
        html: `<div style="background-color: #10B981; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); font-size: 18px;">📍</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36]
      });
      setMapIcons({ riderIcon, homeIcon });
    });
  }, []);

  useEffect(() => {
    if (!orderId) {
      setErrorMsg("Could not find an Order ID in the URL.");
      setLoading(false);
      return;
    }

    const failSafeTimer = setTimeout(() => {
      setErrorMsg("Firebase is taking too long to respond. Please check your internet, or your Firebase Database Rules.");
      setLoading(false);
    }, 5000);

    try {
      const unsubscribe = onSnapshot(
        doc(db, "orders", orderId),
        (docSnap) => {
          clearTimeout(failSafeTimer); 
          if (docSnap.exists()) {
            setOrder({ id: docSnap.id, ...docSnap.data() });
          } else {
            setOrder(null);
          }
          setLoading(false);
        },
        (error) => {
          clearTimeout(failSafeTimer);
          console.error("Firebase Error:", error);
          setErrorMsg(error.message);
          setLoading(false);
        }
      );

      return () => {
        clearTimeout(failSafeTimer);
        unsubscribe();
      };
    } catch (err: any) {
      clearTimeout(failSafeTimer);
      console.error("Sync Error:", err);
      setErrorMsg(err.message || "Failed to initialize tracking.");
      setLoading(false);
    }
  }, [orderId]);

  // ─── Loading & Error UI ───
  if (loading) return (
    <div className="h-screen bg-[#1A1A1A] flex flex-col items-center justify-center gap-4">
      <Loader2 className="animate-spin text-[#B71C1C]" size={48}/>
      <p className="text-gray-400 font-bold tracking-widest uppercase text-xs">Locating Order {orderId}...</p>
    </div>
  );

  if (errorMsg) return (
    <div className="h-screen bg-[#1A1A1A] flex flex-col items-center justify-center p-6 text-center">
      <XCircle className="text-red-500 mb-4" size={48} />
      <h2 className="text-white font-black uppercase tracking-widest text-xl mb-2">Connection Error</h2>
      <p className="text-gray-400 text-sm mb-6 max-w-md">{errorMsg}</p>
      <Link href="/" className="px-6 py-3 bg-[#B71C1C] text-white rounded-xl font-bold uppercase tracking-widest text-xs">Return Home</Link>
    </div>
  );

  if (!order) return (
    <div className="h-screen bg-[#1A1A1A] flex flex-col items-center justify-center text-center p-6">
      <XCircle className="text-gray-600 mb-4" size={48} />
      <h2 className="text-white font-black uppercase tracking-widest text-xl mb-2">Order Not Found</h2>
      <p className="text-gray-400 text-sm mb-6">This order ID ({orderId}) does not exist in the database.</p>
      <Link href="/" className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors">Return Home</Link>
    </div>
  );

  // ─── Step Calculations ───
  const steps = [
    { key: "pending", icon: Clock, label: "Verifying", desc: "Waiting for kitchen to confirm GCash/Order." },
    { key: "preparing", icon: ChefHat, label: "Cooking", desc: "Your burgers are on the grill." },
    { key: "delivering", icon: Bike, label: "On The Way", desc: "Lalamove rider has been dispatched." }
  ];

  let currentStepIndex = steps.findIndex(s => s.key === order.status);
  if (currentStepIndex === -1) currentStepIndex = 0;

  // ─── Simulated Rider Coordinates (Offset slightly from customer for demo) ───
  const customerLat = order.customerLocation?.lat || 14.5683;
  const customerLng = order.customerLocation?.lng || 120.9934;
  const simulatedRiderLat = customerLat - 0.003;
  const simulatedRiderLng = customerLng - 0.003;

  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white font-sans flex flex-col items-center py-8 px-6 pb-20">
      
      {/* 🚀 BACK BUTTON */}
      <div className="w-full max-w-md mb-6">
        <Link href="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">
          <ArrowLeft size={16} /> Back to Diner
        </Link>
      </div>

      <Link href="/">
        <h1 className="text-3xl font-black italic uppercase text-[#B71C1C] mb-8 hover:opacity-80 transition-opacity">BURNT DINER</h1>
      </Link>

      <div className="w-full max-w-md">
        
        {/* 🚀 NEW LIVE TRACKING UI (Only shows when delivering & orderType is Delivery) */}
        {order.status === 'delivering' && order.orderType === 'Delivery' && mapIcons && (
          <div className="bg-white/5 border border-white/10 rounded-3xl p-5 mb-8 shadow-2xl animate-in slide-in-from-bottom-4 duration-700">
            <div className="flex justify-between items-center mb-4">
               <div>
                 <p className="text-[#B71C1C] font-black uppercase tracking-widest text-xs animate-pulse">Live Tracking</p>
                 <h2 className="text-xl font-black">Arriving in ~12 mins</h2>
               </div>
               <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                 <MapPin size={20} className="text-white"/>
               </div>
            </div>

            {/* Simulated Map */}
            <div className="w-full h-48 bg-gray-900 rounded-2xl overflow-hidden mb-5 relative z-0 border border-white/10 shadow-inner">
               <MapContainer center={[customerLat - 0.0015, customerLng - 0.0015]} zoom={15} style={{ height: '100%', width: '100%', zIndex: 0 }} zoomControl={false}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[simulatedRiderLat, simulatedRiderLng]} icon={mapIcons.riderIcon} />
                  <Marker position={[customerLat, customerLng]} icon={mapIcons.homeIcon} />
               </MapContainer>
            </div>

            {/* Driver Profile Card */}
            <div className="flex items-center justify-between bg-black/40 rounded-2xl p-4 border border-white/5">
               <div className="flex items-center gap-3">
                 <div className="w-12 h-12 bg-gray-800 rounded-full border-2 border-white/10 overflow-hidden shrink-0">
                   <img src="https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=100&h=100&fit=crop" alt="Rider" className="w-full h-full object-cover"/>
                 </div>
                 <div>
                   <h3 className="font-black text-sm uppercase tracking-wide">Arjay Reyes</h3>
                   <p className="text-xs text-gray-400 font-mono">HONDA CLICK • NMX-4821</p>
                   <div className="flex items-center gap-1 mt-0.5">
                     <Star size={10} className="text-yellow-500 fill-yellow-500" />
                     <span className="text-[10px] font-bold text-yellow-500">4.9 (1,204 Deliveries)</span>
                   </div>
                 </div>
               </div>
               <button onClick={() => alert("Simulating call to rider...")} className="w-10 h-10 bg-green-600 hover:bg-green-500 rounded-full flex items-center justify-center shadow-lg transition-colors shrink-0">
                 <PhoneCall size={18} className="text-white" />
               </button>
            </div>
          </div>
        )}

        {/* ─── STATUS TIMELINE ─── */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Order Status</h2>
          <p className="font-mono text-xs text-gray-600 mb-8">ID: {order.id.toUpperCase()}</p>

          {order.status === 'cancelled' ? (
             <div className="bg-red-950/50 border border-red-900 rounded-2xl p-6 text-center">
               <XCircle size={48} className="mx-auto text-red-500 mb-4" />
               <h3 className="text-xl font-black uppercase tracking-widest text-red-400 mb-2">Order Cancelled</h3>
               <p className="text-sm text-red-200/70">We could not verify the details or GCash reference. Please contact the diner.</p>
             </div>
          ) : (
            <div className="space-y-8 relative before:absolute before:inset-0 before:ml-[23px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-white/10">
              {steps.map((step, index) => {
                const isActive = index === currentStepIndex;
                const isPast = index < currentStepIndex;
                const StepIcon = step.icon;

                return (
                  <div key={step.key} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className={`flex items-center justify-center w-12 h-12 rounded-full border-4 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow shadow-[#1A1A1A] z-10 transition-colors duration-500 ${isActive ? 'bg-[#B71C1C] border-red-900 text-white' : isPast ? 'bg-green-600 border-green-900 text-white' : 'bg-black border-white/10 text-gray-600'}`}>
                      {isPast ? <CheckCircle size={20} /> : <StepIcon size={20} />}
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-4 rounded-xl shadow">
                      <h3 className={`font-black uppercase tracking-widest text-sm mb-1 transition-colors ${isActive ? 'text-white' : isPast ? 'text-gray-300' : 'text-gray-600'}`}>{step.label}</h3>
                      <p className={`text-xs ${isActive ? 'text-gray-400' : 'text-gray-600'}`}>{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
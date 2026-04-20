// =============================================================================
// IMPORTS & CONFIGURATION
// =============================================================================

// React and router imports
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { generateGoogleMapsUrl } from '../utils/mapUtils';

// Leaflet map components
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// =============================================================================
// LEAFLET MAP CONFIGURATION
// =============================================================================

// Fix Leaflet default marker icons for webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// =============================================================================
// HELPER COMPONENTS (Map Utilities)
// =============================================================================

// Component to update map bounds after markers are rendered
function MapBoundsUpdater({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [map, bounds]);
  return null;
}

// Component to invalidate map size when it becomes visible
function MapSizeHandler({ isVisible }) {
  const map = useMap();
  useEffect(() => {
    if (isVisible) {
      setTimeout(() => {
        map.invalidateSize();
      }, 150);
    }
  }, [map, isVisible]);
  return null;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

function LandingPage({ stations, loading, navigateTo }) {
  // =============================================================================
  // HOOKS: Authentication & Navigation
  // =============================================================================
  const { session, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // =============================================================================
  // STATE: Location & Station Data
  // =============================================================================
  // Location state
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [nearbyStations, setNearbyStations] = useState([]);
  const [showAllStations, setShowAllStations] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // =============================================================================
  // EFFECTS: Redirect & Scroll
  // =============================================================================

  // Redirect if user is already logged in
  useEffect(() => {
    if (session) {
      const targetPath = isAdmin ? '/admin/dashboard' : '/home';
      navigate(targetPath, { replace: true });
    }
  }, [session, isAdmin, navigate]);

  // Effect to scroll to section if specified in location.state
  useEffect(() => {
    if (location.state?.scrollTo) {
      const element = document.getElementById(location.state.scrollTo);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [location.state]);

  // =============================================================================
  // HELPER FUNCTIONS: Location & Distance
  // =============================================================================

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Get user's current location
  const getUserLocation = () => {
    setLocationLoading(true);
    setLocationError('');

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      setLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });
        setLocationLoading(false);

        if (stations && stations.length > 0) {
          const stationsWithDistance = stations.map(station => {
            const stationLat = station.latitude || (latitude + (Math.random() - 0.5) * 0.01);
            const stationLng = station.longitude || (longitude + (Math.random() - 0.5) * 0.01);
            const distance = calculateDistance(latitude, longitude, stationLat, stationLng);

            return {
              ...station,
              latitude: stationLat,
              longitude: stationLng,
              distance: distance
            };
          });

          const sortedStations = stationsWithDistance
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 6);

          setNearbyStations(sortedStations);
        }
      },
      (error) => {
        setLocationLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location access was denied. Please enable location services.');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location information is unavailable.');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timed out.');
            break;
          default:
            setLocationError('An unknown error occurred while getting location.');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  // =============================================================================
  // COMPUTED VALUES: Stations & Map Data
  // =============================================================================

  const displayedStations = userLocation && nearbyStations.length > 0 && !showAllStations
    ? nearbyStations
    : stations;

  // Filter stations with valid coordinates for the map
  const stationsWithCoords = displayedStations.filter(s => s.latitude && s.longitude &&
    typeof s.latitude === 'number' && typeof s.longitude === 'number');

  // Calculate map bounds from stations
  const mapBounds = stationsWithCoords.length > 0 ? L.latLngBounds(
    stationsWithCoords.map(s => [s.latitude, s.longitude])
  ) : null;

  // =============================================================================
  // RENDER HELPERS: Station Card Component
  // =============================================================================

  // Render station card for mobile list
  const renderMobileStationCard = (station) => {
    return (
      <a
        key={station.station_id}
        href={generateGoogleMapsUrl(station.location_description, station.latitude, station.longitude)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2.5 p-3.5 rounded-2xl mb-2 no-underline"
        style={{
          background: 'rgba(255,255,255,0.7)',
          border: '1px solid rgba(255,255,255,0.9)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800 truncate">{station.station_name}</p>
          <p className="text-[10px] text-gray-500 mt-0.5 truncate">{station.location_description}</p>
        </div>
        </a>
    );
  };

  // =============================================================================
  // RENDER: UI SECTIONS
  // =============================================================================

  return (
    <div className="min-h-dvh flex flex-col pt-10 mb-0 " style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>

      {/* =============================================================================
         SECTION: MOBILE HERO (Dark background)
         Contains: Logo badge, Title, Subtitle, CTA buttons
      ============================================================================= */}
      {/* Mobile Hero Section - Full width dark */}
      <section id="hero" className="md:hidden relative overflow-hidden px-4 pt-12 pb-8 min-h-screen flex flex-col justify-between"
        style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 100%)' }}>
        
        <div className="flex-none flex flex-col"> 
          {/* Decorative orbs */}
          <div className="absolute top-[-60px] right-[-60px] w-40 h-40 rounded-full blur-[40px] pointer-events-none"
            style={{ background: 'rgba(56,182,255,0.15)' }}></div>
          <div className="absolute bottom-[-40px] left-[-40px] w-36 h-36 rounded-full blur-[40px] pointer-events-none"
            style={{ background: 'rgba(249,210,23,0.08)' }}></div>

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-3"
            style={{
              background: 'rgba(56,182,255,0.12)',
              border: '1px solid rgba(56,182,255,0.25)'
            }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#38b6ff"/>
            </svg>
            <span className="text-[10px] font-bold" style={{ color: '#38b6ff' }}>
              Powered by Solar Energy
            </span>
          </div>

          {/* Title */}
          <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-2">
            Solar<span style={{ color: '#38b6ff' }}>Charge</span><br />
            Powering Your<br />World.
          </h1>
          
          {/* Subtitle */}
          <p className="text-xs text-white/50 leading-relaxed mb-5 max-w-xs">
            Clean, smart, solar-powered charging stations across Iloilo City. Charge your devices sustainably.
          </p>
        </div>

      {/* Buttons */}
        <div className="flex-auto flex flex-col gap-2">
          <button
            onClick={() => navigateTo('signup')}
            className="w-full py-3.5 rounded-2xl text-white text-sm font-bold"
            style={{ background: '#38b6ff' }}
          >
            Get started — it's free
          </button>
          <button
            onClick={() => navigateTo('login')}
            className="w-full py-3 rounded-2xl text-sm font-semibold"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.7)'
            }}
          >
            Log in to charge
          </button>
        </div>

        {/* Scroll down indicator - stacking arrow heads */}
        <button 
          onClick={() => document.getElementById('stations')?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 transition-transform"
        >
          <span className="text-[9px] font-medium tracking-widest text-white/50 uppercase">Scroll</span>
          <div className="flex flex-col items-center">
            <svg width="12" height="8" viewBox="0 0 12 8" className="text-white/80">
              <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <svg width="12" height="8" viewBox="0 0 12 8" className="text-white/50 -mt-0.5">
              <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <svg width="12" height="8" viewBox="0 0 12 8" className="text-white/25 -mt-0.5">
              <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </button>
      </section>

      {/* =============================================================================
         SECTION: MOBILE STATIONS (Light background)
         Contains: Section header, Location detect button, Location error message,
                   Map toggle button, Map panel, Station count, Station list
      ============================================================================= */}
      {/* Stations Section - Light background (mobile) - NOW FIRST */}
      <section id="stations" className="md:hidden px-4 py-5"
        style={{ background: '#f1f3e0' }}>
        <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-1">
          Charging network
        </p>
        <h2 className="text-base font-bold text-gray-800 mb-3">Stations near you</h2>

        {/* Location detect pill */}
        <div
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl mb-3 cursor-pointer"
          style={{
            background: 'rgba(255,255,255,0.7)',
            border: '1px solid rgba(255,255,255,0.9)'
          }}
          onClick={getUserLocation}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#38b6ff' }}>
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/>
          </svg>
          <span className="flex-1 text-xs text-gray-500">
            {locationLoading ? 'Getting location...' : 'Detect my location'}
          </span>
          {userLocation && (
            <span className="text-xs font-bold" style={{ color: '#10b981' }}>
              ✓ Located
            </span>
          )}
        </div>

        {/* Location Error */}
        {locationError && (
          <div className="mb-3 px-3 py-2 rounded-xl text-xs"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: '#dc2626'
            }}>
            {locationError}
          </div>
        )}

        {/* Map toggle button */}
        {stationsWithCoords.length > 0 && (
          <div
            className="flex items-center justify-center gap-2 py-2.5 rounded-2xl mb-3 cursor-pointer"
            style={{
              background: 'rgba(56,182,255,0.08)',
              border: '1px solid rgba(56,182,255,0.2)'
            }}
            onClick={() => setShowMap(!showMap)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38b6ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 7m0 8V9m0 0L9 7"/>
            </svg>
            <span className="text-sm font-medium" style={{ color: '#38b6ff' }}>
              {showMap ? 'Hide map' : 'Show map'}
            </span>
            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold" style={{ background: 'rgba(56,182,255,0.12)', border: '1px solid rgba(56,182,255,0.2)', color: '#38b6ff' }}>
              {stationsWithCoords.length} pins
            </span>
          </div>
        )}

        {/* Map Panel */}
        {stationsWithCoords.length > 0 && showMap && (
          <div className="mb-3 rounded-3xl overflow-hidden border border-white/60 shadow-sm" style={{ height: '200px' }}>
            <MapContainer
              key="mobile-stations-map"
              center={stationsWithCoords.length > 0 ? [stationsWithCoords[0].latitude, stationsWithCoords[0].longitude] : [14.5995, 120.9842]}
              zoom={stationsWithCoords.length > 0 ? 13 : 10}
              className="h-full w-full"
              scrollWheelZoom={true}
              style={{ height: '100%', width: '100%', position: 'relative' }}
              zoomControl={true}
              attributionControl={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {stationsWithCoords.map((station) => (
                <Marker
                  key={station.station_id}
                  position={[station.latitude, station.longitude]}
                  eventHandlers={{ click: () => {
                    window.open(generateGoogleMapsUrl(station.location_description, station.latitude, station.longitude), '_blank');
                  } }}
                >
                  <Popup>
                    <div className="text-gray-800" style={{ minWidth: '180px' }}>
                      <h3 className="font-bold text-sm mb-1">{station.station_name}</h3>
                      <p className="text-xs text-gray-600 mb-1">{station.location_description}</p>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: station.available_ports > 0 ? '#10b981' : '#ef4444' }}></span>
                        <span style={{ color: station.available_ports > 0 ? '#10b981' : '#ef4444' }}>
                          {station.available_ports > 0 ? `${station.available_ports} open` : 'Full'}
                        </span>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {mapBounds && <MapBoundsUpdater bounds={mapBounds} />}
              <MapSizeHandler isVisible={showMap} />
            </MapContainer>
          </div>
        )}

        {/* Station count */}
        {displayedStations.length > 0 && (
          <div className="flex justify-between items-center px-1 mb-2">
            <h3 className="text-xs font-bold text-gray-700">
              {userLocation && !showAllStations ? 'Nearby stations' : 'All stations'}
            </h3>
            <span className="text-[10px] text-gray-400">{displayedStations.length} stations</span>
          </div>
        )}

        {/* Station list */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-3 border-t-transparent"
              style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
            <p className="text-sm ml-2" style={{ color: '#000b3d', opacity: 0.7 }}>Loading...</p>
          </div>
        ) : displayedStations.length > 0 ? (
          <div className="px-1">
            {displayedStations.map((station) => renderMobileStationCard(station))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(255,255,255,0.5)' }}>
              <span className="text-2xl">🔌</span>
            </div>
            <p className="text-sm font-bold text-gray-800">No stations available</p>
            <p className="text-xs text-gray-500">Check back later!</p>
          </div>
        )}
      </section>

      {/* =============================================================================
         SECTION: MOBILE FEATURES (Dark background)
         Contains: Section header, Feature cards (Sustainable, Tiered, Smart)
      ============================================================================= */}
      {/* Features Section - Dark background (mobile) - NOW SECOND */}
      <section id="features" className="md:hidden px-4 py-5"
        style={{ background: '#0f172a' }}>
        <p className="text-[9px] font-bold tracking-widest text-gray-500 uppercase mb-1">
          Why choose us
        </p>
        <h2 className="text-base font-bold text-white mb-3">Built for the future</h2>

        <div className="flex flex-col gap-3">
          {/* Card 1: Sustainable Power */}
          <div className="flex items-start gap-3 p-3.5 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderTop: '1px solid rgba(255,255,255,0.18)'
            }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(56,182,255,0.15)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="5" stroke="#38b6ff" strokeWidth="2"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="#38b6ff" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-white">Sustainable Power</p>
              <p className="text-[10px] leading-relaxed mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                100% solar-sourced energy — zero carbon footprint.
              </p>
            </div>
          </div>

          {/* Card 2: Tiered Charging */}
          <div className="flex items-start gap-3 p-3.5 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderTop: '1px solid rgba(255,255,255,0.18)'
            }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(249,210,23,0.15)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-white">Tiered Charging</p>
              <p className="text-[10px] leading-relaxed mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Flexible plans from Basic to Pro — pay only for what you need.
              </p>
            </div>
          </div>

          {/* Card 3: Smart Management */}
          <div className="flex items-start gap-3 p-3.5 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderTop: '1px solid rgba(255,255,255,0.18)'
            }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(16,185,129,0.12)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="2" width="14" height="20" rx="2" stroke="#059669" strokeWidth="2"/>
                <circle cx="12" cy="17" r="1" fill="#059669"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-white">Smart Management</p>
              <p className="text-[10px] leading-relaxed mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Track usage, sessions, and billing from your phone in real time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =============================================================================
         SECTION: DESKTOP HERO (Hidden on mobile)
         Contains: Glassmorphism card, Logo, Main title, CTA buttons
      ============================================================================= */}
      {/* Desktop Navigation (hidden on mobile) */}
      <header className="hidden md:block w-full max-w-6xl mx-auto relative z-10 animate-fade-in px-4 sm:px-6 lg:px-8">
        <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden text-center py-16 sm:py-20 px-6 sm:px-8 lg:px-12" style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          {/* Rest of desktop hero content remains unchanged */}
          <div className="relative z-10">
            <div className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold mb-8 animate-fade-in-down" style={{
              background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(249, 210, 23, 0.2) 100%)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: '#000b3d'
            }}>
              <span className="mr-2 text-lg">⚡</span>
              Powered by Solar Energy
            </div>

            <div className="flex items-center justify-center mb-8 animate-fade-in-down delay-100">
              <div className="relative">
                <img
                  src="/img/solarchargelogo.png"
                  alt="SolarCharge Logo"
                  className="h-24 md:h-28 w-auto drop-shadow-2xl animate-logo-float"
                />
                <div className="absolute inset-0 blur-xl opacity-50 animate-pulse-slow" style={{
                  background: 'radial-gradient(circle, rgba(249, 210, 23, 0.4) 0%, transparent 70%)'
                }}></div>
              </div>
            </div>

            <h1 className="text-7xl md:text-8xl font-black leading-tight mb-6 animate-fade-in-down delay-200" style={{
              background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 50%, #000b3d 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              textShadow: '0 0 40px rgba(56, 182, 255, 0.3)'
            }}>
              SolarCharge
            </h1>

            <h2 className="text-4xl md:text-5xl font-bold mb-8 animate-fade-in-down delay-300" style={{ color: '#000b3d' }}>
              Powering Your World, Sustainably
            </h2>

            <p className="text-xl md:text-2xl mb-12 max-w-3xl mx-auto leading-relaxed animate-fade-in-up delay-400" style={{ color: '#000b3d', opacity: 0.8 }}>
              Never run out of power again. Access smart, solar-powered charging stations for your mobile devices, anywhere, anytime.
            </p>

            <div className="flex flex-col sm:flex-row gap-6 justify-center animate-fade-in-up delay-500">
              <button
                onClick={() => navigateTo('login')}
                className="group relative px-10 py-4 rounded-2xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                  boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                  focusRingColor: 'rgba(56, 182, 255, 0.5)'
                }}
              >
                <span className="relative z-10 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Login to Charge
                </span>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                  background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
                }}></div>
              </button>

              <button
                onClick={() => navigateTo('signup')}
                className="group relative px-10 py-4 rounded-2xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 100%)',
                  boxShadow: '0 8px 24px rgba(249, 210, 23, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                  focusRingColor: 'rgba(249, 210, 23, 0.5)'
                }}
              >
                <span className="relative z-10 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                  </svg>
                  Join SolarCharge
                </span>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                  background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.3) 0%, rgba(249, 210, 23, 0.3) 100%)'
                }}></div>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* =============================================================================
         SECTION: DESKTOP FEATURES (Hidden on mobile)
         Contains: Section title, 3 feature cards (glassmorphism style)
      ============================================================================= */}
      {/* Desktop Features - keep existing */}
      <section id="features" className="hidden md:block w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in delay-300 px-4 sm:px-6 lg:px-8">
        <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <div className="text-center mb-12">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: '#000b3d' }}>Why Choose SolarCharge?</h2>
            <p className="text-lg sm:text-xl max-w-2xl mx-auto" style={{ color: '#000b3d', opacity: 0.7 }}>Experience the future of sustainable charging with our innovative solar-powered stations.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature cards remain unchanged for desktop */}
            <div className="group relative backdrop-blur-xl rounded-3xl p-8 text-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-2" style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px 0 rgba(249, 210, 23, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
            }}>
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform duration-500" style={{
                background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(249, 210, 23, 0.1) 100%)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(249, 210, 23, 0.3)'
              }}>
                <span className="text-4xl">☀️</span>
              </div>
              <h3 className="text-2xl font-bold mb-4" style={{ color: '#000b3d' }}>Sustainable Power</h3>
              <p className="leading-relaxed" style={{ color: '#000b3d', opacity: 0.7 }}>Charge your devices with clean, renewable solar energy, reducing your carbon footprint and contributing to a greener planet.</p>
            </div>

            <div className="group relative backdrop-blur-xl rounded-3xl p-8 text-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-2" style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px 0 rgba(56, 182, 255, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
            }}>
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform duration-500" style={{
                background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.3) 0%, rgba(56, 182, 255, 0.1) 100%)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(56, 182, 255, 0.3)'
              }}>
                <span className="text-4xl">⚡</span>
              </div>
              <h3 className="text-2xl font-bold mb-4" style={{ color: '#000b3d' }}>Tiered Charging</h3>
              <p className="leading-relaxed" style={{ color: '#000b3d', opacity: 0.7 }}>Enjoy basic free charging or upgrade to premium for faster speeds, priority access, and real-time monitoring features.</p>
            </div>

            <div className="group relative backdrop-blur-xl rounded-3xl p-8 text-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-2" style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
            }}>
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform duration-500" style={{
                background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.3) 0%, rgba(0, 11, 61, 0.1) 100%)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(0, 11, 61, 0.3)'
              }}>
                <span className="text-4xl">📱</span>
              </div>
              <h3 className="text-2xl font-bold mb-4" style={{ color: '#000b3d' }}>Smart Management</h3>
              <p className="leading-relaxed" style={{ color: '#000b3d', opacity: 0.7 }}>Intelligent system prevents idle usage, manages quotas efficiently, and provides real-time data and analytics.</p>
            </div>
          </div>
        </div>
      </section>

      {/* =============================================================================
         SECTION: DESKTOP STATIONS (Hidden on mobile)
         Contains: Section title, Location detect button, Location error message,
                   Toggle nearby/all stations, Station grid with clickable cards
      ============================================================================= */}
      {/* Desktop Stations - keep existing */}
      <section id="stations" className="hidden md:block w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in delay-400 px-4 sm:px-6 lg:px-8">
        <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          {/* Existing desktop stations content */}
          <div className="text-center mb-10">
            <h3 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: '#000b3d' }}>Find a Charging Station Near You</h3>
            <p className="text-lg sm:text-xl" style={{ color: '#000b3d', opacity: 0.7 }}>Locate and use our solar-powered charging stations across the city</p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-6">
              {!userLocation ? (
                <button
                  onClick={getUserLocation}
                  disabled={locationLoading}
                  className="font-bold py-3 px-6 rounded-xl shadow-lg transform transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-white"
                  style={{
                    background: locationLoading ? 'linear-gradient(135deg, rgba(56, 182, 255, 0.6) 0%, rgba(0, 11, 61, 0.6) 100%)' : 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                    boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                  }}
                >
                  {locationLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Getting Location...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                      </svg>
                      Find Stations Near Me
                    </>
                  )}
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="px-4 py-2 rounded-lg flex items-center gap-2 backdrop-blur-md" style={{
                    background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(56, 182, 255, 0.2) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    color: '#000b3d'
                  }}>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                    </svg>
                    Location Found!
                  </div>
                  <button
                    onClick={() => setShowAllStations(!showAllStations)}
                    className="font-bold py-2 px-4 rounded-lg transition-all duration-300 hover:scale-105 text-white"
                    style={{
                      background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.8) 0%, rgba(0, 11, 61, 0.6) 100%)',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      boxShadow: '0 4px 16px rgba(0, 11, 61, 0.3)'
                    }}
                  >
                    {showAllStations ? 'Show Nearby Only' : 'Show All Stations'}
                  </button>
                </div>
              )}
            </div>

            {/* Location Error */}
            {locationError && (
              <div className="mt-4 px-4 py-3 rounded-lg backdrop-blur-md" style={{
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#dc2626'
              }}>
                {locationError}
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{
                borderColor: '#38b6ff',
                borderTopColor: 'transparent'
              }}></div>
              <p className="text-lg ml-4" style={{ color: '#000b3d', opacity: 0.7 }}>Loading stations...</p>
            </div>
          ) : (userLocation && nearbyStations.length > 0 && !showAllStations) ? (
            <div>
              <div className="text-center mb-8">
                <h4 className="text-2xl font-bold mb-2" style={{ color: '#000b3d' }}>Nearby Charging Stations</h4>
                <p style={{ color: '#000b3d', opacity: 0.7 }}>Showing the closest stations to your location</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {nearbyStations.map((station, index) => (
                  <a
                    key={station.station_id}
                    href={generateGoogleMapsUrl(station.location_description, station.latitude, station.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative backdrop-blur-xl p-6 rounded-2xl text-left transform transition-all duration-500 hover:scale-105 hover:-translate-y-2 cursor-pointer overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      boxShadow: '0 8px 32px 0 rgba(249, 210, 23, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
                      animationDelay: `${index * 100}ms`
                    }}
                  >
                    <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold text-white backdrop-blur-md" style={{
                      background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.8) 0%, rgba(249, 210, 23, 0.6) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.3)'
                    }}>
                      {station.distance < 1 ? `${Math.round(station.distance * 1000)}m` : `${station.distance.toFixed(1)}km`}
                    </div>
                    <div className="flex flex-col gap-2">
                      <h4 className="text-2xl font-bold" style={{ color: '#000b3d' }}>{station.station_name}</h4>
                      <p className="text-base flex items-center" style={{ color: '#000b3d', opacity: 0.7 }}>
                        <svg className="w-5 h-5 mr-3" style={{ color: '#38b6ff' }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                        </svg>
                        {station.location_description}
                      </p>
                      <p className="text-xs mt-2 font-medium" style={{ color: '#38b6ff' }}>
                        📍 Click to open precise location in Google Maps
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : stations.length > 0 ? (
            <div>
              {userLocation && (
                <div className="text-center mb-8">
                  <h4 className="text-2xl font-bold mb-2" style={{ color: '#000b3d' }}>All Charging Stations</h4>
                  <p style={{ color: '#000b3d', opacity: 0.7 }}>Showing all available stations</p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {stations.map((station, index) => (
                  <a
                    key={station.station_id}
                    href={generateGoogleMapsUrl(station.location_description, station.latitude, station.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative backdrop-blur-xl p-6 rounded-2xl text-left transform transition-all duration-500 hover:scale-105 hover:-translate-y-2 cursor-pointer overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      boxShadow: '0 8px 32px 0 rgba(56, 182, 255, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
                      animationDelay: `${index * 100}ms`
                    }}
                  >
                    <div className="flex flex-col gap-2">
                      <h4 className="text-2xl font-bold" style={{ color: '#000b3d' }}>{station.station_name}</h4>
                      <p className="text-base flex items-center" style={{ color: '#000b3d', opacity: 0.7 }}>
                        <svg className="w-5 h-5 mr-3" style={{ color: '#38b6ff' }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                        </svg>
                        {station.location_description}
                      </p>
                      <p className="text-xs mt-2 font-medium" style={{ color: '#38b6ff' }}>
                        📍 Click to open precise location in Google Maps
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-md" style={{
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.1) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.3)'
              }}>
                <span className="text-4xl">🔌</span>
              </div>
              <h4 className="text-2xl font-bold mb-2" style={{ color: '#000b3d' }}>No Stations Available</h4>
              <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>No charging stations found at the moment. Please check back later!</p>
            </div>
          )}
        </div>
      </section>

      {/* =============================================================================
         SECTION: MOBILE CTA (Call to Action)
         Contains: Section title, Subtitle, Signup/Login buttons
      ============================================================================= */}
      {/* CTA Band - Mobile */}
      <section id="cta" className="md:hidden px-4 py-6 text-center"
        style={{ background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)' }}>
        <h2 className="text-base font-bold text-white mb-1">Ready to start charging?</h2>
        <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Join hundreds of users charging sustainably in Iloilo City.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => navigateTo('signup')}
            className="flex-1 py-3 rounded-xl text-sm font-bold"
            style={{ background: '#fff', color: '#000b3d' }}
          >
            Get started
          </button>
          <button
            onClick={() => navigateTo('login')}
            className="flex-1 py-3 rounded-xl text-sm font-semibold"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.4)',
              color: '#fff'
            }}
          >
            Sign in
          </button>
        </div>
      </section>

      {/* =============================================================================
         SECTION: DESKTOP CTA (Call to Action - Hidden on mobile)
         Contains: Section title, Subtitle, Signup/Login buttons (glassmorphism)
      ============================================================================= */}
      {/* Desktop CTA - keep existing */}
      <section className="hidden md:block w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in delay-500 px-4 sm:px-6 lg:px-8">
        <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 text-center overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(56, 182, 255, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <div className="flex items-center justify-center mb-6">
            <span className="text-4xl sm:text-5xl mr-3 animate-bounce-slow">⚡</span>
            <h3 className="text-3xl sm:text-4xl font-bold" style={{ color: '#000b3d' }}>Ready to Start Charging?</h3>
          </div>
          <p className="text-base sm:text-lg mb-8 max-w-2xl mx-auto" style={{ color: '#000b3d', opacity: 0.8 }}>
            Get a subscription to access charging controls, monitor your usage, and enjoy premium features at our solar-powered charging stations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigateTo('signup')}
              className="relative px-8 py-3 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50"
              style={{
                background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 100%)',
                boxShadow: '0 8px 24px rgba(249, 210, 23, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                focusRingColor: 'rgba(249, 210, 23, 0.5)'
              }}
            >
              Get Started
            </button>
            <button
              onClick={() => navigateTo('login')}
              className="relative px-8 py-3 rounded-xl font-bold overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50 backdrop-blur-md"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                border: '2px solid #38b6ff',
                color: '#000b3d',
                boxShadow: '0 4px 16px rgba(56, 182, 255, 0.2)',
                focusRingColor: 'rgba(56, 182, 255, 0.5)'
              }}
            >
              Sign In
            </button>
          </div>
          <p className="text-sm mt-6" style={{ color: '#000b3d', opacity: 0.6 }}>
            📍 All station locations open in Google Maps with precise coordinates
          </p>
        </div>
      </section>

      {/* =============================================================================
         SECTION: MOBILE FOOTER
         Contains: Copyright text only
      ============================================================================= */}
      {/* Footer - Mobile minimal */}
      <footer className="md:hidden px-4 py-4 text-center"
        style={{
          background: '#0f172a',
          borderTop: '1px solid rgba(255,255,255,0.06)'
        }}>
        <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          © {new Date().getFullYear()} SolarCharge · Innovating for a sustainable future
        </p>
      </footer>

      {/* =============================================================================
         SECTION: DESKTOP FOOTER (Hidden on mobile)
         Contains: Logo, Copyright text (glassmorphism card)
      ============================================================================= */}
      {/* Desktop Footer - keep existing */}
      <footer className="hidden md:block w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in delay-600 px-4 sm:px-6 lg:px-8">
        <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden text-center py-10 sm:py-12 px-6 sm:px-8 lg:px-12" style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <div className="flex items-center justify-center mb-4">
            <img
              src="/img/solarchargelogo.png"
              alt="SolarCharge Logo"
              className="h-10 sm:h-12 w-auto mr-3 drop-shadow-lg"
            />
            <h3 className="text-2xl sm:text-3xl font-bold" style={{ color: '#000b3d' }}>SolarCharge</h3>
          </div>
          <p className="text-base sm:text-lg mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>© {new Date().getFullYear()} SolarCharge. All rights reserved.</p>
          <p className="text-sm sm:text-base" style={{ color: '#000b3d', opacity: 0.6 }}>Innovating for a sustainable future.</p>
        </div>
      </footer>

      {/* =============================================================================
         SECTION: MOBILE BOTTOM NAVIGATION (Fixed)
         Contains: Tab bar with 4 icons (Home, Stations, Features, Join)
      ============================================================================= */}
      {/* Public Bottom Navigation - Mobile Only */}
      {/* <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="mx-2.5 mb-3 flex items-center justify-around h-14 rounded-[22px]"
          style={{
            background: 'rgba(15,23,42,0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderTop: '1px solid rgba(255,255,255,0.18)'
          }}>
          {[
            { id: 'hero', label: 'Home', icon: 'home' },
            { id: 'stations', label: 'Stations', icon: 'signal' },
            { id: 'features', label: 'Features', icon: 'star' },
            { id: 'cta', label: 'Join', icon: 'user' },
          ].map(tab => (
            <button key={tab.id}
              onClick={() => {
                const el = document.getElementById(tab.id);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="flex flex-col items-center gap-0.5 flex-1 py-1.5 rounded-[15px] border-0 bg-transparent cursor-pointer"
            >
              {tab.icon === 'home' && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" fill="#38b6ff"/>
                </svg>
              )}
              {tab.icon === 'star' && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="rgba(255,255,255,0.35)" strokeWidth="1.8" strokeLinejoin="round"/>
                </svg>
              )}
              {tab.icon === 'signal' && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="3" stroke="rgba(255,255,255,0.35)" strokeWidth="1.8"/>
                  <path d="M6.34 6.34a8 8 0 000 11.32M17.66 6.34a8 8 0 010 11.32" stroke="rgba(255,255,255,0.35)" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              )}
              {tab.icon === 'user' && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="rgba(255,255,255,0.35)" strokeWidth="1.8" strokeLinecap="round"/>
                  <circle cx="12" cy="7" r="4" stroke="rgba(255,255,255,0.35)" strokeWidth="1.8"/>
                </svg>
              )}
              <span className="text-[9px] font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {tab.label}
              </span>
            </button>
          ))}
        </div> */}
        {/* Home indicator placeholder */}
        {/* <div className="home-ind" style={{ width: '100px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '3px', margin: '4px auto 8px' }}></div>
      </nav> */}

      
    </div>
  );
}

export default LandingPage;

// frontend/src/pages/StationsPage.js
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { openGoogleMaps } from '../utils/mapUtils';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet default marker icons for webpack/vite builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

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

function StationsPage({ navigateTo, stations: propStations, loadingStations: propLoadingStations }) {
  const { session, subscription } = useAuth();
  
  // Location state
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [nearbyStations, setNearbyStations] = useState([]);
  const [showAllStations, setShowAllStations] = useState(true);
  
  // Station data state
  const [internalStations, setInternalStations] = useState([]);
  const [internalLoadingStations, setInternalLoadingStations] = useState(true);
  const [stationsInitialized, setStationsInitialized] = useState(false);
  
  // Map visibility state
  const [showMap, setShowMap] = useState(false);
  
  // Use props if provided, otherwise use internal state
  const stations = propStations || internalStations;
  const loadingStations = propLoadingStations !== undefined ? propLoadingStations : internalLoadingStations;

  // Fetch stations if not provided as props
  useEffect(() => {
    async function fetchStations() {
      if (!session) return;
      try {
        setInternalLoadingStations(true);
        setStationsInitialized(true);
        const { supabase } = await import('../supabaseClient');
        const { data, error } = await supabase
          .from('public_station_view')
          .select('*');

        if (error) throw error;
        setInternalStations(data);
      } catch (err) {
        console.error('StationsPage: Error fetching stations:', err.message);
      } finally {
        setInternalLoadingStations(false);
      }
    }
    
    if (session && !stationsInitialized && internalStations.length === 0 && !propStations) {
      fetchStations();
    } else if (session && (stations.length > 0 || propStations)) {
      setInternalLoadingStations(false);
      setStationsInitialized(true);
    } else if (session && stationsInitialized) {
      setInternalLoadingStations(false);
    }
  }, [session, stationsInitialized, internalStations.length, propStations]);

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in kilometers
    return distance;
  };

  // Get user's current location
  const handleGetLocation = () => {
    setLocationLoading(true);
    setLocationError('');
    
    if (!navigator.geolocation) {
      setLocationError('GEOLOCATION IS NOT SUPPORTED BY THIS BROWSER.');
      setLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });
        setLocationLoading(false);
        
        // Calculate nearby stations
        if (stations && stations.length > 0) {
          const stationsWithDistance = stations.map(station => {
            const stationLat = station.latitude;
            const stationLng = station.longitude;
            
            if (!stationLat || !stationLng) {
              return {
                ...station,
                distance: null
              };
            }
            
            const distance = calculateDistance(latitude, longitude, stationLat, stationLng);
            
            return {
              ...station,
              distance: distance
            };
          });
          
          // Sort by distance and filter out stations without coordinates
          const sortedStations = stationsWithDistance
            .filter(station => station.distance !== null)
            .sort((a, b) => a.distance - b.distance);
          
          setNearbyStations(sortedStations);
          setShowAllStations(false);
        }
      },
      (error) => {
        setLocationLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('LOCATION ACCESS WAS DENIED. PLEASE ENABLE LOCATION SERVICES.');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('LOCATION INFORMATION IS UNAVAILABLE.');
            break;
          case error.TIMEOUT:
            setLocationError('LOCATION REQUEST TIMED OUT.');
            break;
          default:
            setLocationError('AN UNKNOWN ERROR OCCURRED WHILE GETTING LOCATION.');
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

  // Handle station click
  const handleStationClick = (station) => {
    if (subscription) {
      // Use navigateTo function to properly set station data in App.js
      navigateTo('station', { 
        station, 
        state: {
          from: '/stations',
          message: `WELCOME TO ${station.station_name.toUpperCase()}!`
        }
      });
    } else {
      // For users without subscription, open Google Maps with precise coordinates
      openGoogleMaps(station.location_description, station.latitude, station.longitude);
    }
  };

   // Determine which stations to display
   const displayStations = userLocation && nearbyStations.length > 0 && !showAllStations 
     ? nearbyStations 
     : stations;

   // Filter stations with valid coordinates for the map
   const stationsWithCoords = useMemo(() => 
     displayStations.filter(s => s.latitude && s.longitude && 
       typeof s.latitude === 'number' && typeof s.longitude === 'number'),
     [displayStations]
   );

   // Calculate map bounds from stations
   const mapBounds = useMemo(() => {
     if (stationsWithCoords.length === 0) return null;
     const bounds = L.latLngBounds([]);
     stationsWithCoords.forEach(s => bounds.extend([s.latitude, s.longitude]));
     return bounds;
   }, [stationsWithCoords]);

const renderStationCard = (station, showDistance = true) => {
    const availablePorts = (station.num_free_ports || 0);
    let availableColor = '#10b981';
    if (availablePorts === 0) availableColor = '#ef4444';
    else if (availablePorts === 1) availableColor = '#f59e0b';

    return (
      <div
        key={station.station_id}
        onClick={() => handleStationClick(station)}
        className="flex items-center mb-3 gap-3 p-4 rounded-2xl cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ background: availableColor }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 truncate">{station.station_name}</p>
          <p className="text-[10px] text-gray-500 mt-0.5 truncate">{station.location_description}</p>
        </div>
        <div className="text-right flex-shrink-0">
          {showDistance && !showAllStations && station.distance && (
            <p className="text-[10px] text-gray-400">{station.distance < 1 ? `${Math.round(station.distance * 1000)}m` : `${station.distance.toFixed(1)}km`}</p>
          )}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mt-1">
            <path d="M9 18l6-6-6-6" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-dvh flex flex-col justify-start text-gray-800 relative" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
      {/* MOBILE LAYOUT (< lg:) */}
      <div className="lg:hidden pt-16">
        {/* Page Header */}
        <div className="flex justify-between items-center px-4 pt-3 pb-2">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Stations</h1>
            <p className="text-xs text-gray-500 mt-0.5">Find a charging station near you</p>
          </div>
        </div>

        {/* Location Bar (Compact Pill) */}
        <div className="bg-white/60 border border-white/80 rounded-2xl px-4 py-3 mx-4 mb-3 flex items-center gap-3">
          {!userLocation ? (
            <>
              <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#38b6ff' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
              </svg>
              <button onClick={handleGetLocation} disabled={locationLoading} className="flex-1 text-left text-sm text-gray-600">
                {locationLoading ? 'Getting location...' : 'Detect my location'}
              </button>
            </>
          ) : locationLoading ? (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border-b-2" style={{ borderColor: '#38b6ff' }}></div>
              <span className="flex-1 text-sm text-gray-500">Getting location...</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#10b981' }}></div>
              <span className="flex-1 text-xs text-gray-600 truncate">Iloilo City detected</span>
              <button onClick={() => setShowAllStations(!showAllStations)} className="text-xs font-semibold" style={{ color: '#38b6ff' }}>
                {showAllStations ? 'Nearby only' : 'Show all'}
              </button>
            </>
          )}
        </div>

        {/* Location Error */}
        {locationError && (
          <div className="mx-4 mb-3 px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }}>
            {locationError}
          </div>
        )}

        {/* All / Nearby Segmented Control */}
        {userLocation && (
          <div className="mx-4 mb-3 p-1 rounded-2xl bg-white/50 border border-white/70 flex gap-1">
            <button 
              onClick={() => setShowAllStations(true)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${showAllStations ? 'bg-[#38b6ff] text-white' : 'text-gray-500'}`}
            >
              All stations
            </button>
            <button 
              onClick={() => setShowAllStations(false)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${!showAllStations ? 'bg-[#38b6ff] text-white' : 'text-gray-500'}`}
            >
              Nearby
            </button>
          </div>
        )}

        {/* Show Map Button */}
        <div className="mx-4 mb-3 md:hidden flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/60 border border-white/70 cursor-pointer" onClick={() => setShowMap(!showMap)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 9m0 8V9m0 0L9 7"/>
          </svg>
          <span className="text-sm font-medium text-gray-600">{showMap ? 'Hide map' : 'Show map'}</span>
          <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: 'rgba(56,182,255,0.12)', border: '1px solid rgba(56,182,255,0.2)', color: '#38b6ff' }}>
            {stationsWithCoords.length} pins
          </span>
        </div>

        {/* Map Panel */}
        {stationsWithCoords.length > 0 && (
          <div className={`mx-4 mb-3 ${showMap ? 'block' : 'hidden'} md:block`}>
            <div className="rounded-3xl overflow-hidden border border-white/60 shadow-sm" style={{ height: '200px' }}>
              <MapContainer
                key="stations-map"
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
                    eventHandlers={{ click: () => handleStationClick(station) }}
                  >
                    <Popup>
                      <div className="text-gray-800" style={{ minWidth: '200px' }}>
                        <h3 className="font-bold text-lg mb-1">{station.station_name}</h3>
                        <p className="text-sm text-gray-600 mb-2">{station.location_description}</p>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                          Available ports: {station.num_free_ports || 0} free, {station.available_premium_ports || 0} premium
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
                {mapBounds && <MapBoundsUpdater bounds={mapBounds} />}
                <MapSizeHandler isVisible={showMap} />
              </MapContainer>
            </div>
            <p className="text-center text-gray-400 text-[10px] mt-1.5">Tap a marker to view station details</p>
          </div>
        )}

        {/* Section Header */}
        <div className="flex justify-between items-center px-4 mb-2">
          <h2 className="text-sm font-bold text-gray-800">
            {!showAllStations && userLocation ? 'Nearby stations' : 'All charging stations'}
          </h2>
          <span className="text-xs text-gray-400">{displayStations.length} stations</span>
        </div>

        {/* Loading State */}
        {loadingStations ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-transparent" style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
          </div>
        ) : displayStations.length > 0 ? (
          /* Station Cards */
          <div className="px-4 mt-2">
            {displayStations.map((station) => renderStationCard(station, true))}
          </div>
        ) : (
          /* Empty State */
          <div className="mx-4 text-center py-12">
            <p className="text-sm text-gray-400">No stations available</p>
          </div>
        )}

        {/* Bottom Spacer */}
        <div className="h-6"></div>
      </div>

      {/* DESKTOP LAYOUT (lg: and above) */}
      <div className="hidden lg:block w-full pt-20 pb-8">
        <section className="w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in px-4 sm:px-6 lg:px-8">
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <div className="absolute inset-0 opacity-30" style={{
              background: 'linear-gradient(135deg, transparent 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)',
              animation: 'shimmer 3s ease-in-out infinite'
            }}></div>
            
            <div className="relative z-10">
              <div className="text-center mb-10 animate-fade-in-down">
                <div className="flex items-center justify-center space-x-3 mb-4">
                  <img 
                    src="/img/solarchargelogo.png" 
                    alt="SolarCharge Logo" 
                    className="h-12 md:h-16 w-auto drop-shadow-lg animate-logo-float"
                  />
                  <span className="text-3xl md:text-4xl font-black tracking-tight" style={{
                    background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 50%, #000b3d 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>SolarCharge</span>
                </div>
                <div className="text-xl md:text-2xl font-semibold" style={{ color: '#000b3d' }}>
                  Find a Charging Station
                </div>
                <p className="text-lg mt-2" style={{ color: '#000b3d', opacity: 0.7 }}>
                  Locate and use our solar-powered charging stations across the city
                </p>
              </div>

              {/* Desktop Location Controls */}
              <div className="flex justify-center gap-4 mb-8">
                {!userLocation ? (
                  <button 
                    onClick={handleGetLocation}
                    disabled={locationLoading}
                    className="px-6 py-3 rounded-xl font-semibold text-white transition-all hover:scale-105"
                    style={{ background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)' }}
                  >
                    {locationLoading ? 'Getting location...' : 'Detect my location'}
                  </button>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: '#10b981' }}></div>
                      <span className="text-sm font-semibold" style={{ color: '#10b981' }}>Location detected</span>
                    </div>
                    <button 
                      onClick={() => setShowAllStations(!showAllStations)}
                      className="px-4 py-2 rounded-xl font-semibold transition-all"
                      style={showAllStations ? { background: '#38b6ff', color: 'white' } : { background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.1)', color: '#000b3d' }}
                    >
                      {showAllStations ? 'All stations' : 'Nearby only'}
                    </button>
                  </div>
                )}
              </div>

              {/* Desktop Map */}
              {stationsWithCoords.length > 0 && (
                <div className="mb-8">
                  <div className="rounded-3xl overflow-hidden border border-white/60 shadow-lg" style={{ height: '300px' }}>
                    <MapContainer
                      key="stations-map-desktop"
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
                          eventHandlers={{ click: () => handleStationClick(station) }}
                        >
                          <Popup>
                            <div className="text-gray-800" style={{ minWidth: '200px' }}>
                              <h3 className="font-bold text-lg mb-1">{station.station_name}</h3>
                              <p className="text-sm text-gray-600 mb-2">{station.location_description}</p>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                                Available ports: {station.num_free_ports || 0} free, {station.available_premium_ports || 0} premium
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      ))}
                      {mapBounds && <MapBoundsUpdater bounds={mapBounds} />}
                    </MapContainer>
                  </div>
                </div>
              )}

              {/* Desktop Station Grid */}
              <div className="mb-4">
                <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: '#000b3d' }}>
                  {!showAllStations && userLocation ? 'Nearby Stations' : 'All Charging Stations'}
                  <span className="text-lg font-normal ml-2" style={{ opacity: 0.6 }}>({displayStations.length} stations)</span>
                </h2>
              </div>

              {loadingStations ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
                </div>
              ) : displayStations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {displayStations.map((station) => {
                    const availablePorts = (station.num_free_ports || 0);
                    let availableColor = '#10b981';
                    if (availablePorts === 0) availableColor = '#ef4444';
                    else if (availablePorts === 1) availableColor = '#f59e0b';

                    return (
                      <div
                        key={station.station_id}
                        onClick={() => handleStationClick(station)}
                        className="group relative backdrop-blur-xl p-6 rounded-2xl text-left transform transition-all duration-500 hover:scale-105 hover:-translate-y-2 cursor-pointer overflow-hidden"
                        style={{
                          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          boxShadow: '0 8px 32px 0 rgba(56, 182, 255, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                        }}
                      >
                        <div className="flex flex-col gap-2">
                          <h4 className="text-xl font-bold" style={{ color: '#000b3d' }}>{station.station_name}</h4>
                          <p className="text-base flex items-center" style={{ color: '#000b3d', opacity: 0.7 }}>
                            <svg className="w-5 h-5 mr-3" style={{ color: '#38b6ff' }} fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                            </svg>
                            {station.location_description}
                          </p>
                        </div>

                        <div className="space-y-3 mt-6">
                          <div className="flex items-center justify-between p-3 rounded-lg backdrop-blur-md" style={{
                            background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                            border: '1px solid rgba(56, 182, 255, 0.3)'
                          }}>
                            <span className="flex items-center" style={{ color: '#000b3d', opacity: 0.8 }}>
                              <span className="mr-2">🔌</span> Free Ports
                            </span>
                            <span className="text-lg font-bold" style={{ color: availableColor }}>{availablePorts}</span>
                          </div>
                          <div className="flex items-center justify-between p-3 rounded-lg backdrop-blur-md" style={{
                            background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                            border: '1px solid rgba(249, 210, 23, 0.3)'
                          }}>
                            <span className="flex items-center" style={{ color: '#000b3d', opacity: 0.8 }}>
                              <span className="mr-2">⚡</span> Premium
                            </span>
                            <span className="text-lg font-bold" style={{ color: '#b45309' }}>{station.available_premium_ports || 0}</span>
                          </div>
                        </div>

                        <button
                          className="w-full mt-6 py-3 rounded-xl font-bold text-white transition-all duration-300 group-hover:scale-105"
                          style={{
                            background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)'
                          }}
                        >
                          View Details
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>No stations available</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default StationsPage;

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

return (
    <div className="min-h-dvh flex flex-col justify-start text-gray-800 relative" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
      {/* Page Header */}
      <div className="flex justify-between items-center px-4 pt-3 pb-2">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Stations</h1>
          <p className="text-xs text-gray-500 mt-0.5">Find a charging station near you</p>
        </div>
        <button className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(56,182,255,0.12)', border: '1px solid rgba(56,182,255,0.25)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="#38b6ff" strokeWidth="2"/>
            <path d="M21 21l-4.35-4.35" stroke="#38b6ff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
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
        <div className="px-4">
          {displayStations.map((station) => {
            const availablePorts = (station.num_free_ports || 0);
            let availableColor = '#10b981';
            if (availablePorts === 0) availableColor = '#ef4444';
            else if (availablePorts === 1) availableColor = '#f59e0b';
            
            return (
              <div
                key={station.station_id}
                onClick={() => handleStationClick(station)}
                className="flex items-center gap-3 p-4 rounded-2xl cursor-pointer mb-3"
                style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
              >
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ background: availableColor }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{station.station_name}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 truncate">{station.location_description}</p>
                  <div className="flex gap-1.5 mt-1.5 items-center">
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-semibold" style={{ background: `${availableColor}15`, color: availableColor, border: `1px solid ${availableColor}30` }}>
                      {availablePorts > 0 ? `${availablePorts} open` : 'Full'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-semibold" style={{ background: 'rgba(56,182,255,0.08)', color: '#38b6ff', border: '1px solid rgba(56,182,255,0.2)' }}>
                      Solar
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {!showAllStations && station.distance && (
                    <p className="text-[10px] text-gray-400">{station.distance < 1 ? `${Math.round(station.distance * 1000)}m` : `${station.distance.toFixed(1)}km`}</p>
                  )}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mt-1">
                    <path d="M9 18l6-6-6-6" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
            );
          })}
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
  );
}

export default StationsPage;

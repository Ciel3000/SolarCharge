// frontend/src/pages/StationsPage.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { openGoogleMaps, generateGoogleMapsUrl } from '../utils/mapUtils';

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
  const getUserLocation = () => {
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

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-gray-800 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-3xl animate-pulse-slow" style={{ background: 'radial-gradient(circle, rgba(0, 11, 61, 0.15) 0%, rgba(0, 11, 61, 0.05) 50%, transparent 100%)' }}></div>
      </div>

      {/* Main Content */}
      <div className="w-full pt-24 pb-8">
        {/* Stations Section */}
        <section className="w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in px-4 sm:px-6 lg:px-8">
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <div className="text-center mb-10">
              <h3 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: '#000b3d' }}>FIND A CHARGING STATION</h3>
              <p className="text-lg sm:text-xl" style={{ color: '#000b3d', opacity: 0.7 }}>LOCATE AND USE OUR SOLAR-POWERED CHARGING STATIONS ACROSS THE CITY</p>
            
              {/* Location Controls */}
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
                        GETTING LOCATION...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                        </svg>
                        FIND STATIONS NEAR ME
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
                      LOCATION FOUND!
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
                      {showAllStations ? 'SHOW NEARBY ONLY' : 'SHOW ALL STATIONS'}
                    </button>
                  </div>
                )}
              </div>
            
              {/* Location Error */}
              {locationError && (
                <div className="mt-4 px-4 py-3 rounded-lg backdrop-blur-md mx-auto max-w-md" style={{
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#dc2626'
                }}>
                  {locationError}
                </div>
              )}
            </div>
            
            {loadingStations ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{
                  borderColor: '#38b6ff',
                  borderTopColor: 'transparent'
                }}></div>
                <p className="text-lg ml-4" style={{ color: '#000b3d', opacity: 0.7 }}>LOADING STATIONS...</p>
              </div>
            ) : displayStations.length > 0 ? (
              <div>
                {userLocation && nearbyStations.length > 0 && !showAllStations ? (
                  <div className="text-center mb-8">
                    <h4 className="text-2xl font-bold mb-2" style={{ color: '#000b3d' }}>NEARBY CHARGING STATIONS</h4>
                    <p style={{ color: '#000b3d', opacity: 0.7 }}>SHOWING THE CLOSEST STATIONS TO YOUR LOCATION</p>
                  </div>
                ) : userLocation && (
                  <div className="text-center mb-8">
                    <h4 className="text-2xl font-bold mb-2" style={{ color: '#000b3d' }}>ALL CHARGING STATIONS</h4>
                    <p style={{ color: '#000b3d', opacity: 0.7 }}>SHOWING ALL AVAILABLE STATIONS</p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {displayStations.map((station, index) => (
                    <div
                      key={station.station_id}
                      onClick={() => handleStationClick(station)}
                      className="group relative backdrop-blur-xl p-6 rounded-2xl text-left transform transition-all duration-500 hover:scale-105 hover:-translate-y-2 cursor-pointer overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        boxShadow: '0 8px 32px 0 rgba(56, 182, 255, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
                        animationDelay: `${index * 100}ms`
                      }}
                    >
                      {/* Distance badge for nearby stations */}
                      {station.distance !== undefined && station.distance !== null && (
                        <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold text-white backdrop-blur-md" style={{
                          background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.8) 0%, rgba(249, 210, 23, 0.6) 100%)',
                          border: '1px solid rgba(255, 255, 255, 0.3)'
                        }}>
                          {station.distance < 1 ? `${Math.round(station.distance * 1000)}m` : `${station.distance.toFixed(1)}km`}
                        </div>
                      )}
                      
                      <div className="flex flex-col gap-2">
                        <h4 className="text-2xl font-bold" style={{ color: '#000b3d' }}>{station.station_name}</h4>
                        <p className="text-base flex items-center" style={{ color: '#000b3d', opacity: 0.7 }}>
                          <svg className="w-5 h-5 mr-3" style={{ color: '#38b6ff' }} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                          </svg>
                          {station.location_description}
                        </p>
                      </div>

                      {/* Conditional rendering for subscribed users */}
                      {subscription && (
                        <>
                          <div className="space-y-3 mt-6">
                            <div className="flex items-center justify-between p-3 rounded-lg backdrop-blur-md" style={{
                              background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                              border: '1px solid rgba(56, 182, 255, 0.3)'
                            }}>
                              <span className="flex items-center" style={{ color: '#000b3d', opacity: 0.8 }}>
                                <span className="mr-2">🔌</span> FREE PORTS
                              </span>
                              <span className="font-bold" style={{ color: '#38b6ff' }}>{station.num_free_ports}</span>
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-lg backdrop-blur-md" style={{
                              background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                              border: '1px solid rgba(249, 210, 23, 0.3)'
                            }}>
                              <span className="flex items-center" style={{ color: '#000b3d', opacity: 0.8 }}>
                                <span className="mr-2">⚡</span> PREMIUM PORTS
                              </span>
                              <span className="font-bold" style={{ color: '#f9d217' }}>{station.available_premium_ports} / {station.num_premium_ports}</span>
                            </div>
                          </div>

                          {station.last_maintenance_message && (
                            <div className="mt-4 p-3 rounded-lg backdrop-blur-md" style={{
                              background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                              border: '1px solid rgba(249, 210, 23, 0.3)'
                            }}>
                              <p className="text-sm flex items-center" style={{ color: '#000b3d', opacity: 0.8 }}>
                                <span className="mr-2">🛠️</span> LAST MAINTENANCE: {station.last_maintenance_message}
                              </p>
                            </div>
                          )}
                        </>
                      )}

                      {!subscription && (
                        <div className="mt-4 text-center text-sm italic" style={{ color: '#000b3d', opacity: 0.6 }}>
                          {subscription ? 'CLICK TO VIEW DETAILS' : 'CLICK TO VIEW ON MAP. SUBSCRIBE FOR FULL DETAILS AND CHARGING.'}
                        </div>
                      )}
                    </div>
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
                <h4 className="text-2xl font-bold mb-2" style={{ color: '#000b3d' }}>NO STATIONS AVAILABLE</h4>
                <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>NO CHARGING STATIONS FOUND AT THE MOMENT. PLEASE CHECK BACK LATER!</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default StationsPage;
